import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import api from '../services/api.service';

/* ──────────────── TC No doğrulama algoritması ──────────────────── */
const isValidTcNo = (tcNo) => {
  if (!/^\d{11}$/.test(tcNo)) return false;
  if (tcNo[0] === '0') return false;
  const d = tcNo.split('').map(Number);
  const d10 = ((7 * (d[0] + d[2] + d[4] + d[6] + d[8]) - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  if (d[9] !== d10) return false;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return d[10] === sum % 10;
};

/* ──────────────── NFC yardımcı (opsiyonel bağımlılık) ─────────── */
// react-native-nfc-manager Expo Go'da çalışmaz.
// EAS Build veya bare workflow ile build alındığında aktif olur.
let NfcManager = null;
let NfcTech = null;
try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default;
  NfcTech = nfcModule.NfcTech;
} catch {
  // Expo Go veya paket kurulmamış — NFC devre dışı
}

const NFC_AVAILABLE = !!NfcManager;

export default function VerificationScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('nfc'); // 'nfc' | 'manual'
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // NFC durumu
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcState, setNfcState] = useState('idle'); // idle | scanning | success | error
  const [nfcError, setNfcError] = useState('');

  // Manuel form
  const [form, setForm] = useState({ tcNo: '', firstName: '', lastName: '', dateOfBirth: '' });
  const [tcError, setTcError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pulse animasyonu (NFC ring)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  /* ─── Durum yükle ─── */
  useEffect(() => {
    api.get('/api/verification/status')
      .then(setVerificationStatus)
      .catch(() => {})
      .finally(() => setIsLoadingStatus(false));
  }, []);

  /* ─── NFC başlat ─── */
  useEffect(() => {
    if (!NFC_AVAILABLE) return;
    NfcManager.start()
      .then(() => NfcManager.isSupported())
      .then((supported) => setNfcSupported(supported))
      .catch(() => setNfcSupported(false));
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  /* ─── Pulse animasyonu ─── */
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

  /* ─── NFC Tarama ─── */
  const handleNfcScan = async () => {
    setNfcError('');

    if (!NFC_AVAILABLE || !nfcSupported) {
      // Demo modu: gerçek build olmadan simüle et
      setNfcState('scanning');
      startPulse();
      setTimeout(() => {
        stopPulse();
        setNfcState('error');
        setNfcError(
          NFC_AVAILABLE
            ? 'Bu cihaz NFC desteklemiyor.'
            : 'NFC bu geliştirme ortamında kullanılamaz. Gerçek cihazda test edin.'
        );
      }, 2000);
      return;
    }

    setNfcState('scanning');
    startPulse();

    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      // Gerçek implementasyonda burada TC Kimlik Kartı MRTD protokolü okunur.
      // ICAO 9303 standard: BAC authentication → DG1 (personal data), DG2 (photo)
      const tag = await NfcManager.getTag();

      stopPulse();
      setNfcState('success');

      // Backend'e NFC verilerini gönder (gerçek implementasyonda parse edilmiş veri)
      await api.post('/api/verification/identity', {
        tcNo: tag?.id || '',
        method: 'NFC',
        mrzData: JSON.stringify(tag),
      });

      const status = await api.get('/api/verification/status');
      setVerificationStatus(status);
    } catch (err) {
      stopPulse();
      if (err.message?.includes('cancelled') || err.message?.includes('UserCancel')) {
        setNfcState('idle');
      } else {
        setNfcState('error');
        setNfcError('Kart okunamadı. Kimliğinizi telefonun NFC bölgesine yaklaştırın.');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  /* ─── Manuel doğrulama ─── */
  const handleTcChange = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    setForm(f => ({ ...f, tcNo: digits }));
    if (digits.length === 11) {
      setTcError(isValidTcNo(digits) ? '' : 'Geçersiz TC Kimlik Numarası.');
    } else {
      setTcError('');
    }
  };

  const handleManualSubmit = async () => {
    if (!isValidTcNo(form.tcNo)) { setTcError('Geçersiz TC Kimlik Numarası.'); return; }
    if (!form.firstName.trim() || !form.lastName.trim()) {
      Alert.alert('Hata', 'Ad ve soyad zorunludur.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await api.post('/api/verification/identity', {
        tcNo: form.tcNo,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth || null,
        method: 'MANUAL',
      });
      setVerificationStatus(result);
      Alert.alert('Başarılı', 'Kimlik doğrulaması tamamlandı.');
    } catch (err) {
      Alert.alert('Hata', err.message || 'Doğrulama sırasında hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ────────────────── Render: Durum kartı ─────────────────────── */
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
                Kimliğinizi doğrulayarak güvenli sözleşme imzalayın.
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

  /* ────────────────── Render: NFC ekranı ─────────────────────── */
  const renderNfcTab = () => {
    const stateLabels = {
      idle: 'Taramayı Başlat',
      scanning: 'Taranıyor...',
      success: 'Başarılı!',
      error: 'Tekrar Dene',
    };

    return (
      <Card style={styles.nfcCard}>
        <Text style={styles.sectionTitle}>NFC ile Kimlik Doğrulama</Text>
        <Text style={styles.sectionSubtitle}>
          TC Kimlik Kartınızı telefonun arkasına yaklaştırın.
          Android cihazlarda arka kamera civarında NFC anteni bulunur.
        </Text>

        {/* NFC animasyon alanı */}
        <View style={styles.nfcArea}>
          <Animated.View style={[styles.nfcRingOuter, { transform: [{ scale: pulseAnim }] }]} />
          <View style={styles.nfcRingInner}>
            <Ionicons
              name={nfcState === 'success' ? 'checkmark-circle' : nfcState === 'error' ? 'close-circle' : 'wifi-outline'}
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

        {/* Kimlik kartı yerleştirme görseli */}
        <View style={styles.cardGuide}>
          <View style={styles.idCardMock}>
            <View style={styles.idCardChip} />
            <View style={styles.idCardNfcSymbol}>
              <Ionicons name="wifi-outline" size={14} color={colors.accent} style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
          </View>
          <Text style={styles.cardGuideText}>Kimliğin NFC çipi telefona dokunmalı</Text>
        </View>

        {nfcState === 'error' && nfcError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{nfcError}</Text>
          </View>
        ) : null}

        <Button
          title={nfcState === 'scanning' ? 'Taranıyor...' : stateLabels[nfcState]}
          variant={nfcState === 'success' ? 'primary' : 'accent'}
          onPress={nfcState === 'scanning' ? undefined : handleNfcScan}
          loading={nfcState === 'scanning'}
          fullWidth
          style={styles.nfcButton}
        />

        {!NFC_AVAILABLE && (
          <Text style={styles.nfcWarning}>
            NFC bu geliştirme ortamında devre dışıdır. Gerçek cihaz testi için EAS Build kullanın.
          </Text>
        )}
      </Card>
    );
  };

  /* ────────────────── Render: Manuel form ────────────────────── */
  const renderManualTab = () => (
    <Card>
      <Text style={styles.sectionTitle}>TC Kimlik Bilgileri</Text>

      <Text style={styles.inputLabel}>TC Kimlik Numarası *</Text>
      <TextInput
        style={[styles.input, tcError ? styles.inputError : null]}
        value={form.tcNo}
        onChangeText={handleTcChange}
        placeholder="12345678901"
        keyboardType="numeric"
        maxLength={11}
        placeholderTextColor={colors.textMuted}
      />
      {tcError ? <Text style={styles.fieldError}>{tcError}</Text> : null}

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.inputLabel}>Ad *</Text>
          <TextInput
            style={styles.input}
            value={form.firstName}
            onChangeText={(v) => setForm(f => ({ ...f, firstName: v }))}
            placeholder="Adınız"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.inputLabel}>Soyad *</Text>
          <TextInput
            style={styles.input}
            value={form.lastName}
            onChangeText={(v) => setForm(f => ({ ...f, lastName: v }))}
            placeholder="Soyadınız"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </View>
      </View>

      <Text style={styles.inputLabel}>Doğum Tarihi (YYYY-AA-GG)</Text>
      <TextInput
        style={styles.input}
        value={form.dateOfBirth}
        onChangeText={(v) => setForm(f => ({ ...f, dateOfBirth: v }))}
        placeholder="1990-01-01"
        placeholderTextColor={colors.textMuted}
        keyboardType="numbers-and-punctuation"
      />

      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        <Text style={styles.privacyText}>
          TC Kimlik Numaranız maskelenerek saklanır. Hiçbir zaman açık metin olarak depolanmaz.
        </Text>
      </View>

      <Button
        title={isSubmitting ? 'Doğrulanıyor...' : 'Kimliği Doğrula'}
        variant="accent"
        onPress={handleManualSubmit}
        loading={isSubmitting}
        disabled={form.tcNo.length !== 11 || !!tcError || !form.firstName.trim() || !form.lastName.trim()}
        fullWidth
        style={styles.submitButton}
      />
    </Card>
  );

  return (
    <ScreenWrapper>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Header title="Kimlik Doğrulama" subtitle="Banka seviyesinde güvenli kimlik doğrulama" />

        {renderStatusCard()}

        {/* Tab seçici */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'nfc' && styles.tabActive]}
            onPress={() => setActiveTab('nfc')}
          >
            <Ionicons
              name="wifi-outline"
              size={18}
              color={activeTab === 'nfc' ? colors.accent : colors.textSecondary}
              style={{ transform: [{ rotate: '90deg' }] }}
            />
            <Text style={[styles.tabLabel, activeTab === 'nfc' && styles.tabLabelActive]}>
              NFC ile Tara
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
            onPress={() => setActiveTab('manual')}
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={activeTab === 'manual' ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === 'manual' && styles.tabLabelActive]}>
              Manuel Giriş
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'nfc' ? renderNfcTab() : renderManualTab()}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  statusCard: { marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  statusDetail: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  tabLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  tabLabelActive: { color: colors.accent, fontFamily: fonts.bodySemiBold },

  nfcCard: { alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.headingMedium, fontSize: 16, color: colors.text, marginBottom: 8 },
  sectionSubtitle: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: 32,
  },

  nfcArea: {
    width: 160, height: 160, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  nfcRingOuter: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
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
    position: 'relative',
    marginBottom: 8,
  },
  idCardChip: {
    position: 'absolute', top: 18, left: 12,
    width: 22, height: 16, borderRadius: 3,
    backgroundColor: colors.accent, opacity: 0.7,
  },
  idCardNfcSymbol: {
    position: 'absolute', top: 18, right: 14,
  },
  cardGuideText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },

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

  inputLabel: {
    fontFamily: fonts.bodyMedium, fontSize: 13,
    color: colors.textSecondary, marginBottom: 6, marginTop: 12,
  },
  input: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12,
    fontFamily: fonts.body, fontSize: 14, color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  inputError: { borderColor: colors.error },
  fieldError: { fontFamily: fonts.body, fontSize: 12, color: colors.error, marginTop: 4 },

  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },

  privacyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.surfaceAlt, padding: 12, borderRadius: radius.md,
    marginTop: 16,
  },
  privacyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 18 },

  submitButton: { marginTop: 16 },
});
