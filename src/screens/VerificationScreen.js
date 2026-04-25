import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import StepIndicator from '../components/StepIndicator';
import verificationService from '../services/verification.service';
import { parseTD1, buildBacInput, formatMrzDate, isValidTcNo } from '../utils/mrz-parser';
import MrzScanModal from '../components/MrzScanModal';

/* ─── NFC Manager (opsiyonel — EAS Build gerekli) ─── */
let NfcManager = null;
let NfcTech = null;
try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default;
  NfcTech = nfcModule.NfcTech;
} catch {
  // NFC mevcut değil
}

const NFC_AVAILABLE = !!NfcManager;

// Camera steps removed — they provided no functional value (no OCR is
// performed on the captured images; MRZ still had to be typed manually
// for BAC key derivation) and the new-arch CameraView froze on several
// Android devices. Flow is now: Bilgiler → NFC Tara.
const STEPS = [
  'Bilgiler',
  'NFC Tara',
];

export default function VerificationScreen({ navigation, route }) {
  // Start directly on data entry (previous step indices 0 and 1 were the
  // camera steps, now removed).
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // MRZ / Document data
  const [documentNumber, setDocumentNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(''); // YYMMDD
  const [dateOfExpiry, setDateOfExpiry] = useState(''); // YYMMDD
  const [dobDisplay, setDobDisplay] = useState(''); // DD.MM.YYYY for display
  const [expiryDisplay, setExpiryDisplay] = useState(''); // DD.MM.YYYY for display

  // NFC state
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcState, setNfcState] = useState('idle'); // idle | scanning | success | error
  const [nfcError, setNfcError] = useState('');
  const [nfcResult, setNfcResult] = useState(null);

  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(''); // e.g. "2/5 deneniyor..."

  // MRZ OCR scan modal
  const [scanModalVisible, setScanModalVisible] = useState(false);

  // Whether this is a contract-gate flow (redirected from contract action)
  const isContractGate = route?.params?.contractGate === true;
  const onVerified = route?.params?.onVerified;

  /* ─── Load verification status ─── */
  useEffect(() => {
    verificationService.getStatus()
      .then(setVerificationStatus)
      .catch(() => {})
      .finally(() => setIsLoadingStatus(false));
  }, []);

  /* ─── Init NFC ─── */
  useEffect(() => {
    if (!NFC_AVAILABLE) return;
    NfcManager.start()
      .then(() => NfcManager.isSupported())
      .then(setNfcSupported)
      .catch(() => setNfcSupported(false));
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  /* ─── Pulse animation ─── */
  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };
  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };


  /* ─── Date helpers ─── */
  const parseDisplayDate = (display) => {
    // Convert DD.MM.YYYY to YYMMDD
    const parts = display.split('.');
    if (parts.length !== 3) return '';
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    if (yyyy.length !== 4) return '';
    const yy = yyyy.slice(2);
    return yy + mm + dd;
  };

  const handleDobChange = (val) => {
    setDobDisplay(val);
    setDateOfBirth(parseDisplayDate(val));
  };

  const handleExpiryChange = (val) => {
    setExpiryDisplay(val);
    setDateOfExpiry(parseDisplayDate(val));
  };

  const yymmddToDisplay = (yymmdd) => {
    if (!yymmdd || yymmdd.length !== 6) return '';
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${dd}.${mm}.${year}`;
  };

  /* ─── MRZ OCR scan result ─── */
  const handleMrzScanResult = useCallback((mrzLines) => {
    try {
      const parsed = parseTD1(mrzLines.line1, mrzLines.line2, mrzLines.line3);
      if (!parsed) {
        Alert.alert('Tarama Hatası', 'MRZ okundu ancak ayrıştırılamadı. Lütfen elle giriniz.');
        setScanModalVisible(false);
        return;
      }
      // Populate the three BAC fields + their display mirrors
      if (parsed.documentNumber) setDocumentNumber(parsed.documentNumber);
      if (parsed.dateOfBirth && parsed.dateOfBirth.length === 6) {
        setDateOfBirth(parsed.dateOfBirth);
        setDobDisplay(yymmddToDisplay(parsed.dateOfBirth));
      }
      if (parsed.dateOfExpiry && parsed.dateOfExpiry.length === 6) {
        setDateOfExpiry(parsed.dateOfExpiry);
        setExpiryDisplay(yymmddToDisplay(parsed.dateOfExpiry));
      }
      setScanModalVisible(false);

      // Auto-advance to NFC step shortly after closing the modal
      setTimeout(() => setCurrentStep(1), 350);
    } catch (e) {
      Alert.alert('Tarama Hatası', e?.message || 'MRZ işlenemedi.');
      setScanModalVisible(false);
    }
  }, []);

  /* ─── NFC Scan ─── */
  const handleNfcScan = async () => {
    setNfcError('');
    setNfcResult(null);
    setSubmitFailed(false);
    setSubmitProgress('');

    if (!NFC_AVAILABLE || !nfcSupported) {
      setNfcState('scanning');
      startPulse();
      setTimeout(() => {
        stopPulse();
        setNfcState('error');
        setNfcError(
          NFC_AVAILABLE
            ? 'Bu cihaz NFC desteklemiyor.'
            : 'NFC bu geliştirme ortamında kullanılamaz. EAS Build ile gerçek cihazda test edin.'
        );
      }, 2000);
      return;
    }

    // Validate we have BAC inputs
    if (!documentNumber || !dateOfBirth || !dateOfExpiry) {
      Alert.alert('Hata', 'Belge numarası, doğum tarihi ve son kullanma tarihi gerekli.');
      return;
    }

    setNfcState('scanning');
    startPulse();

    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep, {
        alertMessage: 'TC Kimlik Kartınızı telefonun arkasına yaklaştırın.',
      });

      // Transceive function for MRTD protocol
      const transceive = async (apdu) => {
        const response = await NfcManager.isoDepHandler.transceive(apdu);
        return response;
      };

      // Import and run MRTD protocol
      const { readTurkishIdCard } = require('../utils/nfc-mrtd');
      const dg1 = await readTurkishIdCard(transceive, documentNumber, dateOfBirth, dateOfExpiry);

      stopPulse();
      setNfcState('success');

      // Parse DG1 MRZ lines
      let parsedData = null;
      if (dg1.type === 'TD1') {
        parsedData = parseTD1(dg1.line1, dg1.line2, dg1.line3);
      }

      setNfcResult({ dg1, parsedData });

      // IMPORTANT: close the NFC/IsoDep session BEFORE making the HTTP
      // request. Many Android devices (Samsung/Xiaomi/etc.) cannot do
      // Wi-Fi/HTTP while an NFC tech session is still open — the result
      // is a misleading "Network request failed". Release the NFC radio
      // first, then submit. 1500 ms + an automatic retry handles even
      // slow radios (e.g. Samsung with heavy OneUI).
      try { await NfcManager.cancelTechnologyRequest(); } catch {}
      await new Promise(r => setTimeout(r, 1500));

      // Submit to backend. submitVerification contains an internal
      // retry-once path for transient "network request failed" errors
      // that happen while the NFC radio is still releasing.
      await submitVerification(parsedData, dg1);

    } catch (err) {
      stopPulse();
      if (err.message?.includes('cancelled') || err.message?.includes('UserCancel')) {
        setNfcState('idle');
      } else {
        setNfcState('error');
        setNfcError(err.message || 'Kart okunamadı. Kimliğinizi telefonun NFC bölgesine yaklaştırın ve bilgileri kontrol edin.');
      }
    } finally {
      // Idempotent — safe to call even after we already cancelled above
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  /* ─── Submit verification to backend ───
   *
   * Why this is so aggressive:
   *   On Android, the NFC controller and Wi-Fi/cellular radio share a
   *   coexistence arbiter (especially on Samsung OneUI / Xiaomi MIUI).
   *   `cancelTechnologyRequest()` only *requests* release — the NFC HAL
   *   may keep the shared bus busy for 2–5 seconds afterward. During
   *   that window, the very first HTTP request fails instantly with
   *   "Network request failed", regardless of any fixed delay.
   *
   *   Previous attempts (1500 ms + single retry) still lost this race
   *   on slow radios. The fix is to retry through the arbiter window:
   *   5 attempts at 0s, 2s, 4s, 8s, 12s — ~26 s total budget — and
   *   expose a manual retry button that reuses the cached NFC result
   *   so the user never has to rescan the physical card.
   */
  const ATTEMPT_DELAYS_MS = [0, 2000, 4000, 8000, 12000];

  const isNetworkError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout') ||
      msg.includes('zaman aşımı') ||
      msg.includes('zaman asimi') ||
      msg.includes('aborted')
    );
  };

  const buildPayload = (parsedData, dg1) => ({
    tcNo: parsedData?.tcNo || '',
    firstName: parsedData?.firstName || '',
    lastName: parsedData?.lastName || '',
    dateOfBirth: parsedData?.dateOfBirth
      ? formatYymmddToIso(parsedData.dateOfBirth)
      : null,
    method: 'NFC',
    mrzData: dg1?.raw || '',
  });

  /**
   * Check the server to see if the verification is already recorded.
   * This is critical for handling the case where POST /verification/identity
   * actually reached the server and returned 204, but the client's fetch
   * threw "Network request failed" because the response TCP frame was
   * dropped (NFC radio coexistence). The server log confirms this happens:
   * the POST succeeds with 204, yet the client never sees the ack.
   */
  const checkServerVerified = async () => {
    try {
      const status = await verificationService.getStatus();
      return status?.verified === true;
    } catch {
      return false;
    }
  };

  const finishSuccess = (parsedData, method) => {
    setSubmitProgress('');
    setIsSubmitting(false);
    setSubmitFailed(false);
    setVerificationStatus({ verified: true, method });

    const displayName = parsedData?.firstName && parsedData?.lastName
      ? `${parsedData.firstName} ${parsedData.lastName} kimliği doğrulandı.`
      : 'Kimliğiniz başarıyla doğrulandı.';

    Alert.alert(
      'Doğrulama Başarılı',
      displayName,
      [{
        text: 'Tamam',
        onPress: () => {
          if (isContractGate && onVerified) {
            onVerified();
          }
          navigation.goBack();
        },
      }]
    );
  };

  const submitVerification = async (parsedData, dg1) => {
    setIsSubmitting(true);
    setSubmitFailed(false);
    setSubmitProgress('');

    const payload = buildPayload(parsedData, dg1);
    let lastError = null;

    // Before the first POST, do a pre-check — maybe an earlier attempt
    // already succeeded server-side (common when user hits "Sunucuya
    // Gönder" manually after an auto-submit that lost its response).
    setSubmitProgress('Durum kontrol ediliyor...');
    if (await checkServerVerified()) {
      finishSuccess(parsedData, payload.method);
      return;
    }

    for (let i = 0; i < ATTEMPT_DELAYS_MS.length; i++) {
      const delay = ATTEMPT_DELAYS_MS[i];
      if (delay > 0) {
        setSubmitProgress(
          `Bağlantı bekleniyor... (${i + 1}/${ATTEMPT_DELAYS_MS.length})`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        setSubmitProgress(`Gönderiliyor... (${i + 1}/${ATTEMPT_DELAYS_MS.length})`);
      }

      try {
        await verificationService.verify(payload);
        finishSuccess(parsedData, payload.method);
        return;
      } catch (err) {
        lastError = err;
        if (!isNetworkError(err)) {
          // Non-network error (e.g. 400, 401, 500) — permanent, stop.
          break;
        }

        // --- Read-after-write idempotency check --- //
        // The backend might have already recorded the verification
        // (server received POST, returned 204, but response never made
        // it back to us). A GET is far more likely to succeed than the
        // POST because it's smaller and the NFC radio window may have
        // opened. If status says verified → we're done, ignore the
        // misleading POST error.
        setSubmitProgress('Sunucu durumu doğrulanıyor...');
        // Small settle before the GET to let radio release further
        await new Promise(r => setTimeout(r, 800));
        if (await checkServerVerified()) {
          finishSuccess(parsedData, payload.method);
          return;
        }
        // Still not verified server-side — fall through to next backoff
      }
    }

    // Final safety net: one last status poll before declaring failure.
    setSubmitProgress('Son durum kontrolü...');
    if (await checkServerVerified()) {
      finishSuccess(parsedData, payload.method);
      return;
    }

    // All attempts + status polls exhausted. Expose manual retry.
    setSubmitProgress('');
    setIsSubmitting(false);
    setSubmitFailed(true);

    const msg = isNetworkError(lastError)
      ? 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin ve "Sunucuya Gönder" butonuyla tekrar deneyin — kimliği yeniden okutmanıza gerek yok.'
      : (lastError?.message || 'Doğrulama sunucuya gönderilemedi.');
    Alert.alert('Bağlantı Hatası', msg);
  };

  /* ─── Manual retry: user-initiated resubmit using cached NFC data ─── */
  const handleManualResubmit = async () => {
    if (!nfcResult?.parsedData || !nfcResult?.dg1) {
      Alert.alert('Hata', 'Önce NFC ile kimliği okutun.');
      return;
    }
    await submitVerification(nfcResult.parsedData, nfcResult.dg1);
  };

  const formatYymmddToIso = (yymmdd) => {
    if (!yymmdd || yymmdd.length !== 6) return null;
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${year}-${mm}-${dd}`;
  };

  /* ─── Render: Status Card ─── */
  const renderStatusCard = () => {
    if (isLoadingStatus) return null;
    const isVerified = verificationStatus?.verified;
    return (
      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, { backgroundColor: isVerified ? colors.successBg : colors.surfaceAlt }]}>
            <Ionicons
              name={isVerified ? 'shield-checkmark' : 'shield-outline'}
              size={28}
              color={isVerified ? colors.success : colors.textMuted}
            />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>
              {isVerified ? 'Kimlik Doğrulandı' : 'Kimlik Doğrulanmamış'}
            </Text>
            {isVerified ? (
              <Text style={styles.statusDetail}>
                TC: {verificationStatus.tcNoMasked} &#x2022; {verificationStatus.verificationMethod}
              </Text>
            ) : (
              <Text style={styles.statusDetail}>
                {isContractGate
                  ? 'Sözleşme işlemi için kimlik doğrulaması gereklidir.'
                  : 'Kimliğinizi doğrulayarak güvenli sözleşme imzalayın.'}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: isVerified ? '#e6f7ee' : '#f5f5f5' }]}>
            <Text style={[styles.badgeText, { color: isVerified ? colors.success : colors.textMuted }]}>
              {isVerified ? 'Doğrulandı' : 'Bekliyor'}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  /* ─── Render: Document Data Entry ─── */
  const renderDataEntryStep = () => {
    const isDataValid = documentNumber.length >= 3 && dateOfBirth.length === 6 && dateOfExpiry.length === 6;

    return (
      <Card style={styles.stepCard}>
        <View style={styles.stepHeader}>
          <Ionicons name="document-text-outline" size={24} color={colors.accent} />
          <Text style={styles.stepTitle}>Belge Bilgileri</Text>
        </View>
        <Text style={styles.stepDescription}>
          Kimlik kartınızın arka yüzündeki MRZ (makine tarafından okunabilir bölge) bilgilerini girin.
          Bu bilgiler NFC çip şifresini çözmek için kullanılacaktır.
        </Text>

        {/* Camera OCR: scan the MRZ instead of typing it manually. */}
        <TouchableOpacity
          style={styles.scanCta}
          onPress={() => setScanModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.scanCtaIcon}>
            <Ionicons name="scan-outline" size={22} color={colors.textInverse} />
          </View>
          <View style={styles.scanCtaTextWrap}>
            <Text style={styles.scanCtaTitle}>Fotoğrafla Otomatik Doldur</Text>
            <Text style={styles.scanCtaSubtitle}>
              Kimliğin arka yüzünü kameraya tutun — MRZ otomatik okunur
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textInverse} />
        </TouchableOpacity>

        <View style={styles.scanDividerRow}>
          <View style={styles.scanDividerLine} />
          <Text style={styles.scanDividerText}>veya elle girin</Text>
          <View style={styles.scanDividerLine} />
        </View>

        {/* Visual guide for MRZ */}
        <View style={styles.mrzGuide}>
          <View style={styles.mrzGuideCard}>
            <Text style={styles.mrzGuideTitle}>MRZ Örneği (Arka Yüz)</Text>
            <View style={styles.mrzGuideLines}>
              <Text style={styles.mrzGuideMono}>I&lt;TUR<Text style={styles.mrzHighlighted}>BELGE_NO_</Text>0&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
              <Text style={styles.mrzGuideMono}><Text style={styles.mrzHighlighted}>DOĞUM_T</Text>0M<Text style={styles.mrzHighlighted}>S_KULNM</Text>0TUR&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
              <Text style={styles.mrzGuideMono}>SOYADI&lt;&lt;ADI&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
            </View>
          </View>
        </View>

        <Text style={styles.inputLabel}>Belge Numarası *</Text>
        <Text style={styles.inputHint}>Kimlik kartı arka yüzünde, MRZ 1. satırda 6-9 karakter</Text>
        <TextInput
          style={styles.input}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="A12B34567"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={9}
        />

        <Text style={styles.inputLabel}>Doğum Tarihi *</Text>
        <Text style={styles.inputHint}>GG.AA.YYYY formatında</Text>
        <TextInput
          style={styles.input}
          value={dobDisplay}
          onChangeText={handleDobChange}
          placeholder="01.01.1990"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />

        <Text style={styles.inputLabel}>Son Geçerlilik Tarihi *</Text>
        <Text style={styles.inputHint}>Kimlik kartınızın son kullanma tarihi — GG.AA.YYYY</Text>
        <TextInput
          style={styles.input}
          value={expiryDisplay}
          onChangeText={handleExpiryChange}
          placeholder="01.01.2030"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info} />
          <Text style={styles.infoText}>
            Bu 3 bilgi, kimlik kartınızın NFC çipine erişmek için gereken BAC (Basic Access Control)
            şifreleme anahtarını oluşturur. Bankalar da aynı yöntemi kullanır.
          </Text>
        </View>

        <Button
          title="NFC Taramaya Geç"
          variant="accent"
          onPress={() => setCurrentStep(1)}
          disabled={!isDataValid}
          fullWidth
          style={styles.nextButton}
          icon={<Ionicons name="arrow-forward" size={18} color={isDataValid ? colors.textInverse : colors.textMuted} />}
        />
      </Card>
    );
  };

  /* ─── Render: Step 3 - NFC Scan ─── */
  const renderNfcStep = () => {
    const stateLabels = {
      idle: 'NFC Taramayı Başlat',
      scanning: 'Taranıyor...',
      success: 'Başarılı!',
      error: 'Tekrar Dene',
    };

    return (
      <Card style={styles.nfcCard}>
        <View style={styles.stepHeader}>
          <Ionicons name="wifi-outline" size={24} color={colors.accent} style={{ transform: [{ rotate: '90deg' }] }} />
          <Text style={styles.stepTitle}>NFC ile Kimlik Okuma</Text>
        </View>
        <Text style={styles.stepDescription}>
          TC Kimlik Kartınızı telefonun arkasına yaklaştırın.
          Kartı hareket ettirmeden birkaç saniye bekleyin.
        </Text>

        {/* NFC animation area */}
        <View style={styles.nfcArea}>
          <Animated.View style={[styles.nfcRingOuter, { transform: [{ scale: pulseAnim }] }]} />
          <View style={styles.nfcRingInner}>
            <Ionicons
              name={
                nfcState === 'success' ? 'checkmark-circle'
                  : nfcState === 'error' ? 'close-circle'
                    : 'wifi-outline'
              }
              size={48}
              color={
                nfcState === 'success' ? colors.success
                  : nfcState === 'error' ? colors.error
                    : colors.accent
              }
              style={{ transform: [{ rotate: '90deg' }] }}
            />
          </View>
        </View>

        {/* ID card placement guide */}
        <View style={styles.cardGuide}>
          <View style={styles.idCardMock}>
            <View style={styles.idCardChip} />
            <View style={styles.idCardNfcSymbol}>
              <Ionicons name="wifi-outline" size={14} color={colors.accent} style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
          </View>
          <Text style={styles.cardGuideText}>Kimliğin NFC çipi telefona dokunmalı</Text>
        </View>

        {/* NFC Result */}
        {nfcState === 'success' && nfcResult?.parsedData && (
          <View style={styles.resultBox}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <View style={styles.resultInfo}>
              <Text style={styles.resultTitle}>Kimlik Okundu</Text>
              <Text style={styles.resultDetail}>
                {nfcResult.parsedData.firstName} {nfcResult.parsedData.lastName}
              </Text>
              {nfcResult.parsedData.tcNo && (
                <Text style={styles.resultDetail}>TC: {nfcResult.parsedData.tcNo}</Text>
              )}
            </View>
          </View>
        )}

        {/* Error */}
        {nfcState === 'error' && nfcError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{nfcError}</Text>
          </View>
        ) : null}

        {/* Submission progress (visible during retry backoff) */}
        {isSubmitting && submitProgress ? (
          <View style={styles.infoBox}>
            <ActivityIndicator size="small" color={colors.info} />
            <Text style={styles.infoText}>{submitProgress}</Text>
          </View>
        ) : null}

        {/* Persistent manual retry — appears only after auto-submit has
            exhausted all backoff attempts. Reuses cached NFC result so
            the user does NOT have to rescan the physical card. */}
        {submitFailed && nfcResult ? (
          <View style={styles.retryBox}>
            <Ionicons name="refresh-circle-outline" size={18} color={colors.warning || '#B45309'} />
            <Text style={styles.retryText}>
              Sunucuya bağlanılamadı. NFC okuması hafızada — kartı tekrar okutmaya gerek yok.
            </Text>
          </View>
        ) : null}

        {/* Primary scan button */}
        <Button
          title={isSubmitting ? (submitProgress || 'Doğrulanıyor...') : stateLabels[nfcState]}
          variant={nfcState === 'success' ? 'primary' : 'accent'}
          onPress={nfcState === 'scanning' || isSubmitting ? undefined : handleNfcScan}
          loading={nfcState === 'scanning' || isSubmitting}
          fullWidth
          style={styles.nfcButton}
          icon={
            nfcState === 'success'
              ? <Ionicons name="checkmark" size={20} color={colors.textInverse} />
              : <Ionicons name="wifi-outline" size={20} color={colors.textInverse} style={{ transform: [{ rotate: '90deg' }] }} />
          }
        />

        {/* Manual resubmit — shown when a previous auto-submit failed and
            we have cached NFC data. Clicking it retries the backoff loop. */}
        {submitFailed && nfcResult && !isSubmitting ? (
          <Button
            title="Sunucuya Gönder (Tekrar Dene)"
            variant="primary"
            onPress={handleManualResubmit}
            fullWidth
            style={styles.resubmitButton}
            icon={<Ionicons name="cloud-upload-outline" size={18} color={colors.textInverse} />}
          />
        ) : null}

        {!NFC_AVAILABLE && (
          <Text style={styles.nfcWarning}>
            NFC bu geliştirme ortamında devre dışıdır. Gerçek cihaz testi için EAS Build kullanın.
          </Text>
        )}

        {/* BAC info summary */}
        <View style={styles.bacSummary}>
          <Text style={styles.bacSummaryTitle}>BAC Anahtar Bilgileri</Text>
          <View style={styles.bacRow}>
            <Text style={styles.bacLabel}>Belge No:</Text>
            <Text style={styles.bacValue}>{documentNumber}</Text>
          </View>
          <View style={styles.bacRow}>
            <Text style={styles.bacLabel}>Doğum Tarihi:</Text>
            <Text style={styles.bacValue}>{dobDisplay}</Text>
          </View>
          <View style={styles.bacRow}>
            <Text style={styles.bacLabel}>Son Geçerlilik:</Text>
            <Text style={styles.bacValue}>{expiryDisplay}</Text>
          </View>
        </View>
      </Card>
    );
  };

  /* ─── Navigation buttons ─── */
  const renderNavButtons = () => (
    <View style={styles.navButtons}>
      {currentStep > 0 && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep(prev => prev - 1)}
        >
          <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
          <Text style={styles.backButtonText}>Geri</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /* ─── Main render ─── */
  return (
    <ScreenWrapper>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Header
          title="Kimlik Doğrulama"
          subtitle={isContractGate
            ? 'Sözleşme işlemi için kimlik doğrulaması gerekli'
            : 'Banka seviyesinde güvenli kimlik doğrulama'}
        />

        {renderStatusCard()}

        {/* Only show the flow if not already verified, or if this is a contract gate */}
        {(!verificationStatus?.verified || isContractGate) && (
          <>
            {/* Process explanation */}
            <Card style={styles.processCard}>
              <View style={styles.processHeader}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
                <Text style={styles.processTitle}>Doğrulama Adımları</Text>
              </View>
              <View style={styles.processSteps}>
                <View style={styles.processStep}>
                  <View style={[styles.processStepDot, currentStep >= 0 && styles.processStepDotActive]} />
                  <Text style={[styles.processStepText, currentStep === 0 && styles.processStepTextActive]}>
                    1. Belge bilgilerini girin (MRZ)
                  </Text>
                </View>
                <View style={styles.processStep}>
                  <View style={[styles.processStepDot, currentStep >= 1 && styles.processStepDotActive]} />
                  <Text style={[styles.processStepText, currentStep === 1 && styles.processStepTextActive]}>
                    2. NFC ile çip okuma ve doğrulama
                  </Text>
                </View>
              </View>
            </Card>

            <StepIndicator currentStep={currentStep} steps={STEPS} />

            {currentStep === 0 && renderDataEntryStep()}
            {currentStep === 1 && renderNfcStep()}

            {renderNavButtons()}
          </>
        )}

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyText}>
            TC Kimlik Numaranız maskelenerek saklanır. Fotoğraflar cihazda kalır ve sunucuya gönderilmez.
            NFC okuma sırasında yalnızca DG1 (kişisel bilgiler) okunur.
          </Text>
        </View>
      </ScrollView>

      {/* MRZ OCR scan modal — auto-scans with the camera, returns parsed
          TD1 lines, then auto-advances to the NFC step. */}
      <MrzScanModal
        visible={scanModalVisible}
        onClose={() => setScanModalVisible(false)}
        onResult={handleMrzScanResult}
      />
    </ScreenWrapper>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Status card
  statusCard: { marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  statusDetail: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },

  // Process card
  processCard: { marginBottom: 16 },
  processHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  processTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  processSteps: { gap: 8 },
  processStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processStepDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  processStepDotActive: { backgroundColor: colors.accent },
  processStepText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  processStepTextActive: { fontFamily: fonts.bodySemiBold, color: colors.text },

  // Step card
  stepCard: { marginBottom: 16 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepTitle: { fontFamily: fonts.headingMedium, fontSize: 16, color: colors.text },
  stepDescription: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary,
    lineHeight: 20, marginBottom: 16,
  },

  // Camera
  cameraContainer: { borderRadius: radius.md, overflow: 'hidden', marginBottom: 8 },
  camera: { width: '100%', height: 260 },
  cameraOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  idFrame: {
    width: '85%', height: 180,
    borderWidth: 0, position: 'relative',
  },
  corner: {
    position: 'absolute', width: 30, height: 30,
    borderColor: colors.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  overlayText: {
    fontFamily: fonts.bodySemiBold, fontSize: 13,
    color: '#fff', marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  mrzHighlight: {
    position: 'absolute', bottom: 30, left: '7.5%', right: '7.5%',
    backgroundColor: 'rgba(200,150,62,0.2)', borderRadius: 4, padding: 6,
    alignItems: 'center',
  },
  mrzHighlightText: {
    fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.accentLight,
    marginBottom: 4,
  },
  mrzLines: { gap: 2, alignSelf: 'stretch' },
  mrzLine: { height: 2, backgroundColor: 'rgba(200,150,62,0.4)', borderRadius: 1 },
  captureButton: { marginTop: 12 },
  noCameraBox: {
    alignItems: 'center', padding: 32,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
  },
  noCameraText: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textMuted,
    textAlign: 'center', marginTop: 12, lineHeight: 20,
  },

  // OCR scan CTA
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 14,
  },
  scanCtaIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanCtaTextWrap: { flex: 1 },
  scanCtaTitle: {
    fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textInverse,
  },
  scanCtaSubtitle: {
    fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  scanDividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  scanDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  scanDividerText: {
    fontFamily: fonts.body, fontSize: 11, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Manual resubmit
  retryBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12, borderRadius: radius.md,
    marginBottom: 12, alignSelf: 'stretch',
  },
  retryText: {
    fontFamily: fonts.body, fontSize: 12, color: '#92400E',
    flex: 1, lineHeight: 18,
  },
  resubmitButton: { alignSelf: 'stretch', marginTop: 10 },

  // Data entry
  mrzGuide: { marginBottom: 16 },
  mrzGuideCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: 12, borderWidth: 1, borderColor: colors.border,
  },
  mrzGuideTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  mrzGuideLines: { gap: 2 },
  mrzGuideMono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 9, color: colors.textMuted },
  mrzHighlighted: { color: colors.accent, fontWeight: '700' },

  inputLabel: {
    fontFamily: fonts.bodyMedium, fontSize: 13,
    color: colors.textSecondary, marginBottom: 4, marginTop: 14,
  },
  inputHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12,
    fontFamily: fonts.body, fontSize: 14, color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.infoBg, padding: 12, borderRadius: radius.md,
    marginTop: 16,
  },
  infoText: { fontFamily: fonts.body, fontSize: 12, color: colors.info, flex: 1, lineHeight: 18 },
  nextButton: { marginTop: 16 },

  // NFC
  nfcCard: { alignItems: 'center', marginBottom: 16 },
  nfcArea: {
    width: 160, height: 160, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  nfcRingOuter: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, borderColor: `${colors.accent}40`,
    backgroundColor: `${colors.accent}08`,
  },
  nfcRingInner: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  cardGuide: { alignItems: 'center', marginBottom: 24 },
  idCardMock: {
    width: 120, height: 76, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    position: 'relative', marginBottom: 8,
  },
  idCardChip: {
    position: 'absolute', top: 18, left: 12,
    width: 22, height: 16, borderRadius: 3,
    backgroundColor: colors.accent, opacity: 0.7,
  },
  idCardNfcSymbol: { position: 'absolute', top: 18, right: 14 },
  cardGuideText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },

  resultBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.successBg, padding: 14, borderRadius: radius.md,
    marginBottom: 16, alignSelf: 'stretch',
  },
  resultInfo: { flex: 1 },
  resultTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.success },
  resultDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.text, marginTop: 2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.errorBg, padding: 12, borderRadius: radius.md,
    marginBottom: 16, alignSelf: 'stretch',
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.error, flex: 1 },

  nfcButton: { alignSelf: 'stretch' },
  nfcWarning: {
    fontFamily: fonts.body, fontSize: 11, color: colors.textMuted,
    textAlign: 'center', marginTop: 12, lineHeight: 16,
  },

  bacSummary: {
    marginTop: 16, padding: 12,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  bacSummaryTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  bacRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  bacLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  bacValue: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },

  // Nav buttons
  navButtons: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 4, marginBottom: 16 },
  backButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  backButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },

  // Privacy note
  privacyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.surfaceAlt, padding: 12, borderRadius: radius.md,
    marginTop: 8,
  },
  privacyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
