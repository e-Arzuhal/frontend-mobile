import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/auth.service';

export default function LoginScreen({ navigation, onLoginSuccess }) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorInfo, setTwoFactorInfo] = useState('');

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotNewPasswordConfirm, setForgotNewPasswordConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const validate = () => {
    const e = {};
    if (!usernameOrEmail.trim()) e.usernameOrEmail = 'Kullanıcı adı veya e-posta gerekli';
    if (!password) e.password = 'Şifre gerekli';
    if (twoFactorRequired && (!twoFactorCode || twoFactorCode.trim().length < 4)) {
      e.twoFactorCode = 'Lütfen e-postanıza gelen 6 haneli kodu girin';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const response = await authService.login(
        usernameOrEmail,
        password,
        twoFactorRequired ? twoFactorCode.trim() : undefined,
      );
      if (response?.requires2fa && !response.accessToken) {
        setTwoFactorRequired(true);
        setTwoFactorCode('');
        setTwoFactorInfo('E-postanıza 6 haneli bir doğrulama kodu gönderildi. Kodu girerek girişi tamamlayın.');
        return;
      }
      onLoginSuccess && onLoginSuccess();
    } catch (error) {
      Alert.alert('Giriş Hatası', error.message || 'Giriş yapılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend2faCode = async () => {
    setLoading(true);
    try {
      const response = await authService.login(usernameOrEmail, password);
      if (response?.requires2fa) {
        setTwoFactorInfo('Yeni bir kod e-posta adresinize gönderildi.');
      }
    } catch (error) {
      Alert.alert('Kod Gönderilemedi', error.message || 'Kod gönderilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const resetForgot = () => {
    setForgotStep(1);
    setForgotEmail('');
    setForgotCode('');
    setForgotNewPassword('');
    setForgotNewPasswordConfirm('');
    setForgotError('');
  };

  const handleSendResetCode = async () => {
    setForgotError('');
    if (!forgotEmail || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setForgotError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }
    setForgotLoading(true);
    try {
      await authService.requestPasswordReset(forgotEmail);
      setForgotStep(2);
    } catch (err) {
      // Backend e-posta enumeration için her zaman 200 döner; yine de kullanıcıyı 2. adıma geçir.
      setForgotStep(2);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    setForgotError('');
    if (!forgotCode || forgotCode.trim().length !== 6) {
      setForgotError('Lütfen e-postanıza gelen 6 haneli kodu girin.');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 8) {
      setForgotError('Yeni şifre en az 8 karakter olmalıdır.');
      return;
    }
    if (forgotNewPassword !== forgotNewPasswordConfirm) {
      setForgotError('Şifreler eşleşmiyor.');
      return;
    }
    setForgotLoading(true);
    try {
      await authService.confirmPasswordReset(forgotEmail, forgotCode.trim(), forgotNewPassword);
      setForgotStep(3);
    } catch (err) {
      const raw = err?.message || '';
      if (/geçersiz|süresi dolmuş|hatalı/i.test(raw)) {
        setForgotError('Kod hatalı veya süresi dolmuş. Lütfen yeni bir kod talep edin.');
      } else {
        setForgotError(raw || 'İşlem başarısız oldu. Lütfen tekrar deneyin.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setTimeout(resetForgot, 200);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="document-text" size={40} color={colors.accent} />
          </View>
          <Text style={styles.title}>e-Arzuhal</Text>
          <Text style={styles.subtitle}>Dijital Sözleşme Yönetim Platformu</Text>
        </View>

        <View style={[styles.card, shadows.md]}>
          <Text style={styles.cardTitle}>Giriş Yap</Text>

          <Input
            label="Kullanıcı Adı veya E-posta"
            value={usernameOrEmail}
            onChangeText={setUsernameOrEmail}
            placeholder="ornek@email.com"
            error={errors.usernameOrEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!twoFactorRequired}
            icon={<Ionicons name="person-outline" size={20} color={colors.textMuted} />}
          />

          <Input
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            error={errors.password}
            secureTextEntry
            editable={!twoFactorRequired}
            icon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
          />

          {twoFactorRequired && (
            <>
              <Input
                label="Doğrulama Kodu"
                value={twoFactorCode}
                onChangeText={(t) => setTwoFactorCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 haneli kod"
                keyboardType="numeric"
                maxLength={6}
                error={errors.twoFactorCode}
                icon={<Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} />}
              />
              {!!twoFactorInfo && (
                <Text style={styles.infoText}>{twoFactorInfo}</Text>
              )}
              <View style={styles.twoFaActionsRow}>
                <TouchableOpacity onPress={() => {
                  setTwoFactorRequired(false);
                  setTwoFactorCode('');
                  setTwoFactorInfo('');
                }}>
                  <Text style={styles.linkText}>← E-postayı/şifreyi değiştir</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResend2faCode} disabled={loading}>
                  <Text style={styles.linkText}>Kodu yeniden gönder</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Button
            title={twoFactorRequired ? 'Doğrula ve Giriş Yap' : 'Giriş Yap'}
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.loginButton}
          />

          <TouchableOpacity onPress={() => setForgotOpen(true)} style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>Şifremi Unuttum</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Hesabınız yok mu?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}> Kaydolun</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={closeForgot}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.lg]}>
            <Text style={styles.modalTitle}>Şifremi Unuttum</Text>

            {forgotStep === 1 && (
              <>
                <Text style={styles.modalSubtitle}>
                  Hesabınıza tanımlı e-posta adresini girin. 6 haneli bir doğrulama kodu göndereceğiz.
                </Text>
                <Input
                  label="E-posta"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="ornek@email.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                {!!forgotError && <Text style={styles.errorText}>{forgotError}</Text>}
                <View style={styles.modalActions}>
                  <Button title="Vazgeç" variant="outline" onPress={closeForgot} disabled={forgotLoading} />
                  <Button title="Kod Gönder" onPress={handleSendResetCode} loading={forgotLoading} />
                </View>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <Text style={styles.modalSubtitle}>
                  <Text style={{ fontFamily: fonts.bodySemiBold }}>{forgotEmail}</Text> adresine gönderilen 6 haneli kodu girin ve yeni şifrenizi belirleyin.
                </Text>
                <Input
                  label="Doğrulama Kodu"
                  value={forgotCode}
                  onChangeText={(t) => setForgotCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 haneli kod"
                  keyboardType="numeric"
                  maxLength={6}
                />
                <Input
                  label="Yeni Şifre"
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  placeholder="En az 8 karakter"
                  secureTextEntry
                />
                <Input
                  label="Yeni Şifre (Tekrar)"
                  value={forgotNewPasswordConfirm}
                  onChangeText={setForgotNewPasswordConfirm}
                  placeholder="Tekrar girin"
                  secureTextEntry
                />
                {!!forgotError && <Text style={styles.errorText}>{forgotError}</Text>}
                <View style={styles.modalActions}>
                  <Button title="Geri" variant="outline" onPress={() => { setForgotStep(1); setForgotCode(''); setForgotError(''); }} disabled={forgotLoading} />
                  <Button title="Şifreyi Sıfırla" onPress={handleConfirmReset} loading={forgotLoading} />
                </View>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <Text style={styles.modalSubtitle}>
                  Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
                </Text>
                <View style={[styles.modalActions, { justifyContent: 'flex-end' }]}>
                  <Button title="Tamam" onPress={closeForgot} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 24,
  },
  cardTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  loginButton: {
    marginTop: 8,
  },
  forgotLink: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.accent,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  footerLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -4,
    marginBottom: 8,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
    marginBottom: 4,
  },
  twoFaActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    marginBottom: 8,
  },
  linkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 22,
  },
  modalTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 19,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
});
