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

/* ─── Expo Camera (opsiyonel — EAS Build gerekli) ─── */
let CameraView = null;
let useCameraPermissions = null;
try {
  const camModule = require('expo-camera');
  CameraView = camModule.CameraView;
  useCameraPermissions = camModule.useCameraPermissions;
} catch {
  // expo-camera mevcut değil veya Expo Go
}

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
const CAMERA_AVAILABLE = !!CameraView;

const STEPS = [
  'Ön Yüz',
  'Arka Yüz',
  'Bilgiler',
  'NFC Tara',
];

export default function VerificationScreen({ navigation, route }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Camera state
  const [cameraPermission, requestCameraPermission] = useCameraPermissions?.() || [null, async () => null];
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);
  const cameraRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);

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

  /* ─── Request camera permission ─── */
  const ensureCameraPermission = async () => {
    if (!CAMERA_AVAILABLE) return false;
    if (cameraPermission?.granted) return true;
    const result = await requestCameraPermission();
    return result?.granted;
  };

  /* ─── Take photo ─── */
  const takePhoto = async (side) => {
    if (!cameraRef.current) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (side === 'front') {
        setFrontPhoto(photo);
      } else {
        setBackPhoto(photo);
      }
      // Move to next step
      setCurrentStep(prev => prev + 1);
    } catch (err) {
      Alert.alert('Hata', 'Fotoğraf çekilemedi. Tekrar deneyin.');
    } finally {
      setIsCapturing(false);
    }
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

  /* ─── NFC Scan ─── */
  const handleNfcScan = async () => {
    setNfcError('');
    setNfcResult(null);

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

      // Submit to backend
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
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  /* ─── Submit verification to backend ─── */
  const submitVerification = async (parsedData, dg1) => {
    setIsSubmitting(true);
    try {
      const payload = {
        tcNo: parsedData?.tcNo || '',
        firstName: parsedData?.firstName || '',
        lastName: parsedData?.lastName || '',
        dateOfBirth: parsedData?.dateOfBirth
          ? formatYymmddToIso(parsedData.dateOfBirth)
          : null,
        method: 'NFC',
        mrzData: dg1?.raw || '',
      };

      const result = await verificationService.verify(payload);
      setVerificationStatus(result);

      Alert.alert(
        'Doğrulama Başarılı',
        `${result.firstName} ${result.lastName} kimliği doğrulandı.`,
        [{
          text: 'Tamam',
          onPress: () => {
            if (isContractGate && onVerified) {
              onVerified();
              navigation.goBack();
            }
          },
        }]
      );
    } catch (err) {
      Alert.alert('Hata', err.message || 'Doğrulama sunucuya gönderilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatYymmddToIso = (yymmdd) => {
    if (!yymmdd || yymmdd.length !== 6) return null;
    const yy = parseInt(yymmdd.slice(0, 2), 10);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${year}-${mm}-${dd}`;
  };

  /* ─── Skip camera (no camera available) ─── */
  const handleSkipCamera = (side) => {
    if (side === 'front') {
      setFrontPhoto({ skipped: true });
    } else {
      setBackPhoto({ skipped: true });
    }
    setCurrentStep(prev => prev + 1);
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

  /* ─── Render: Step 0 - Front of ID (Camera) ─── */
  const renderFrontCameraStep = () => (
    <Card style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <Ionicons name="camera-outline" size={24} color={colors.accent} />
        <Text style={styles.stepTitle}>Kimliğin Ön Yüzü</Text>
      </View>
      <Text style={styles.stepDescription}>
        TC Kimlik Kartınızın ön yüzünü (fotoğraflı taraf) kameraya gösterin.
        Fotoğraf, ad, soyad ve TC numaranız görünür olmalı.
      </Text>

      {CAMERA_AVAILABLE && cameraPermission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          >
            {/* ID Card frame overlay */}
            <View style={styles.cameraOverlay}>
              <View style={styles.idFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.overlayText}>Kimlik kartını çerçeveye yerleştirin</Text>
            </View>
          </CameraView>

          <Button
            title={isCapturing ? 'Çekiliyor...' : 'Fotoğraf Çek'}
            variant="accent"
            onPress={() => takePhoto('front')}
            loading={isCapturing}
            fullWidth
            style={styles.captureButton}
            icon={<Ionicons name="camera" size={20} color={colors.textInverse} />}
          />
        </View>
      ) : (
        <View style={styles.noCameraBox}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          <Text style={styles.noCameraText}>
            {!CAMERA_AVAILABLE
              ? 'Kamera bu ortamda kullanılamıyor. EAS Build ile gerçek cihazda test edin.'
              : 'Kamera izni gerekli.'}
          </Text>
          {CAMERA_AVAILABLE && !cameraPermission?.granted && (
            <Button
              title="Kamera İzni Ver"
              variant="accent"
              onPress={ensureCameraPermission}
              style={{ marginTop: 12 }}
            />
          )}
          <Button
            title="Kamerasız Devam Et"
            variant="primary"
            onPress={() => handleSkipCamera('front')}
            style={{ marginTop: 12 }}
          />
        </View>
      )}
    </Card>
  );

  /* ─── Render: Step 1 - Back of ID (Camera) ─── */
  const renderBackCameraStep = () => (
    <Card style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <Ionicons name="camera-outline" size={24} color={colors.accent} />
        <Text style={styles.stepTitle}>Kimliğin Arka Yüzü</Text>
      </View>
      <Text style={styles.stepDescription}>
        TC Kimlik Kartınızın arka yüzünü (MRZ kodlu taraf) kameraya gösterin.
        Alttaki makine tarafından okunabilir satırlar görünür olmalı.
      </Text>

      {CAMERA_AVAILABLE && cameraPermission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.idFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              {/* MRZ zone highlight */}
              <View style={styles.mrzHighlight}>
                <Text style={styles.mrzHighlightText}>MRZ Bölgesi</Text>
                <View style={styles.mrzLines}>
                  <View style={styles.mrzLine} />
                  <View style={styles.mrzLine} />
                  <View style={styles.mrzLine} />
                </View>
              </View>
              <Text style={styles.overlayText}>Arka yüzü çerçeveye yerleştirin</Text>
            </View>
          </CameraView>

          <Button
            title={isCapturing ? 'Çekiliyor...' : 'Fotoğraf Çek'}
            variant="accent"
            onPress={() => takePhoto('back')}
            loading={isCapturing}
            fullWidth
            style={styles.captureButton}
            icon={<Ionicons name="camera" size={20} color={colors.textInverse} />}
          />
        </View>
      ) : (
        <View style={styles.noCameraBox}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          <Text style={styles.noCameraText}>
            Kamera kullanılamıyor. Belge bilgilerini bir sonraki adımda elle gireceksiniz.
          </Text>
          <Button
            title="Kamerasız Devam Et"
            variant="primary"
            onPress={() => handleSkipCamera('back')}
            style={{ marginTop: 12 }}
          />
        </View>
      )}
    </Card>
  );

  /* ─── Render: Step 2 - Document Data Entry ─── */
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
          onPress={() => setCurrentStep(3)}
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

        {/* Scan button */}
        <Button
          title={isSubmitting ? 'Doğrulanıyor...' : stateLabels[nfcState]}
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
                    1. Kimlik ön yüz fotoğrafı
                  </Text>
                </View>
                <View style={styles.processStep}>
                  <View style={[styles.processStepDot, currentStep >= 1 && styles.processStepDotActive]} />
                  <Text style={[styles.processStepText, currentStep === 1 && styles.processStepTextActive]}>
                    2. Kimlik arka yüz fotoğrafı (MRZ)
                  </Text>
                </View>
                <View style={styles.processStep}>
                  <View style={[styles.processStepDot, currentStep >= 2 && styles.processStepDotActive]} />
                  <Text style={[styles.processStepText, currentStep === 2 && styles.processStepTextActive]}>
                    3. Belge bilgilerini girin/onaylayın
                  </Text>
                </View>
                <View style={styles.processStep}>
                  <View style={[styles.processStepDot, currentStep >= 3 && styles.processStepDotActive]} />
                  <Text style={[styles.processStepText, currentStep === 3 && styles.processStepTextActive]}>
                    4. NFC ile çip okuma ve doğrulama
                  </Text>
                </View>
              </View>
            </Card>

            <StepIndicator currentStep={currentStep} steps={STEPS} />

            {currentStep === 0 && renderFrontCameraStep()}
            {currentStep === 1 && renderBackCameraStep()}
            {currentStep === 2 && renderDataEntryStep()}
            {currentStep === 3 && renderNfcStep()}

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
