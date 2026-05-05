import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/auth.service';
import pushNotificationService from '../services/pushNotification.service';
import ScreenWrapper from '../components/ScreenWrapper';
import api from '../services/api.service';

// SecureStore anahtarlari — App.js de "notif:push" anahtarini okuyor.
const NOTIF_KEYS = {
  email: 'notif:email',
  push: 'notif:push',
  approvals: 'notif:approvals',
};

const tabs = [
  { key: 'profile', label: 'Profil', icon: 'person-outline' },
  { key: 'security', label: 'Güvenlik', icon: 'shield-outline' },
  { key: 'notifications', label: 'Bildirimler', icon: 'notifications-outline' },
];

export default function SettingsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  // Bildirim tercihleri — SecureStore'da string olarak saklaniyor
  // ('true'/'false'). Default ON (yani 'false' acikca yazilmamissa true).
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    push: true,
    approvals: true,
  });

  // 2FA durumu — backend `users/me` üzerinden çekilir; toggle modal akışı.
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorModal, setTwoFactorModal] = useState(null); // 'enable' | 'disable' | null
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorSending, setTwoFactorSending] = useState(false);
  const [twoFactorVerifying, setTwoFactorVerifying] = useState(false);
  const [twoFactorInfo, setTwoFactorInfo] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');

  useEffect(() => {
    loadUser();
    loadNotifPrefs();
  }, []);

  const loadNotifPrefs = async () => {
    // Önce SecureStore'dan optimistik default — sonra backend'den senkronla.
    // Backend down ise SecureStore son bilinen değeri sağlar.
    try {
      const [email, push, approvals] = await Promise.all([
        SecureStore.getItemAsync(NOTIF_KEYS.email),
        SecureStore.getItemAsync(NOTIF_KEYS.push),
        SecureStore.getItemAsync(NOTIF_KEYS.approvals),
      ]);
      setNotifPrefs({
        email: email !== 'false',
        push: push !== 'false',
        approvals: approvals !== 'false',
      });
    } catch {
      // SecureStore okuma hatasi — defaultlari kullan
    }
    // Backend tercihlerini çek ve UI'yı senkronla.
    try {
      const remote = await api.get('/api/users/me/notification-preferences');
      const next = {
        email: remote.email !== false,
        push: remote.push !== false,
        approvals: remote.approvalRequests !== false,
      };
      setNotifPrefs(next);
      // SecureStore'u backend ile senkronla — App.js push gating bu değeri okuyor
      await Promise.all([
        SecureStore.setItemAsync(NOTIF_KEYS.email, String(next.email)),
        SecureStore.setItemAsync(NOTIF_KEYS.push, String(next.push)),
        SecureStore.setItemAsync(NOTIF_KEYS.approvals, String(next.approvals)),
      ]);
    } catch {
      // Backend ulaşılamadı — SecureStore default'larıyla devam et
    }
  };

  const setNotifPref = async (key, value) => {
    // 1) UI optimistik güncelle
    setNotifPrefs((prev) => {
      const next = { ...prev, [key]: value };
      // 2) Backend'e gönder — 6 alanlı tam tercih payload'u (DTO field adları ile)
      api.put('/api/users/me/notification-preferences', {
        email: next.email,
        push: next.push,
        approvalRequests: next.approvals,
        // SMS / contract updates / marketing UI'da yok; backend null geçince
        // mevcut değerleri korumalı — null güvenli olduğunda bu yeterli.
        // (Backend service tarafında null = "değişme" davranışı varsa.)
      }).catch(() => {
        // Hata olursa kullanıcıya rahatsızlık vermemek için sessiz —
        // SecureStore en azından local olarak doğru kalır.
      });
      return next;
    });
    // 3) SecureStore'a yaz — App.js push gating bu değeri okuyor
    try {
      await SecureStore.setItemAsync(NOTIF_KEYS[key], String(value));
    } catch {
      // Yazma hatasi — UI'da false gosterilse de bir sonraki acilis default'a doner
    }
    // 4) Push toggle'i: ON yapilirsa device-token'i hemen backend'e gonder.
    if (key === 'push' && value) {
      try {
        await pushNotificationService.registerForPushNotificationsAsync();
      } catch {
        // Izin reddi vs. — App.js'deki gibi kullaniciyi engellememeliyiz
      }
    }
  };

  const loadUser = async () => {
    const userData = await authService.getCurrentUser();
    if (userData) {
      setUser(userData);
      setProfileForm({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
      });
      if (typeof userData.twoFactorEnabled === 'boolean') {
        setTwoFactorEnabled(userData.twoFactorEnabled);
      }
    }
    // Backend'den taze değeri çek — SecureStore'daki user payload'u eski olabilir.
    try {
      const remote = await api.get('/api/users/me');
      if (typeof remote?.twoFactorEnabled === 'boolean') {
        setTwoFactorEnabled(remote.twoFactorEnabled);
      }
    } catch {
      // Backend ulaşılamadı — local değer kullanılır
    }
  };

  const open2faModal = async () => {
    const action = twoFactorEnabled ? 'disable' : 'enable';
    setTwoFactorModal(action);
    setTwoFactorCode('');
    setTwoFactorError('');
    setTwoFactorInfo('');
    setTwoFactorSending(true);
    try {
      await authService.send2faCode(action);
      setTwoFactorInfo('6 haneli doğrulama kodu e-posta adresinize gönderildi.');
    } catch (e) {
      setTwoFactorError(e?.message || 'Kod gönderilemedi.');
    } finally {
      setTwoFactorSending(false);
    }
  };

  const verify2faCode = async () => {
    if (!twoFactorCode || twoFactorCode.length < 4) {
      setTwoFactorError('Lütfen e-posta ile gelen kodu girin.');
      return;
    }
    setTwoFactorVerifying(true);
    setTwoFactorError('');
    try {
      await authService.verify2faCode(twoFactorCode.trim(), twoFactorModal);
      setTwoFactorEnabled((prev) => !prev);
      setTwoFactorModal(null);
      Alert.alert(
        'Başarılı',
        twoFactorModal === 'enable'
          ? 'İki adımlı doğrulama etkinleştirildi.'
          : 'İki adımlı doğrulama kapatıldı.'
      );
    } catch (e) {
      setTwoFactorError(e?.message || 'Doğrulama başarısız. Kodu kontrol edip tekrar deneyin.');
    } finally {
      setTwoFactorVerifying(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.email.trim()) {
      Alert.alert('Hata', 'Ad ve e-posta alanları zorunludur.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/users/me', profileForm);
      const updatedUser = { ...user, ...profileForm };
      await authService.logout();
      await require('expo-secure-store').setItemAsync('user', JSON.stringify(updatedUser));
      const token = await authService.getToken();
      if (token) await require('expo-secure-store').setItemAsync('authToken', token);
      setUser(updatedUser);
      Alert.alert('Başarılı', 'Profil güncellendi.');
    } catch (error) {
      Alert.alert('Hata', error.message || 'Profil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current || !passwordForm.newPass) {
      Alert.alert('Hata', 'Tüm şifre alanlarını doldurun.');
      return;
    }
    if (passwordForm.newPass.length < 8) {
      Alert.alert('Hata', 'Yeni şifre en az 8 karakter olmalı.');
      return;
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      Alert.alert('Hata', 'Yeni şifreler eşleşmiyor.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/users/me/password', {
        currentPassword: passwordForm.current,
        newPassword: passwordForm.newPass,
      });
      setPasswordForm({ current: '', newPass: '', confirm: '' });
      Alert.alert('Başarılı', 'Şifre değiştirildi.');
    } catch (error) {
      Alert.alert('Hata', error.message || 'Şifre değiştirilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Çıkış', 'Çıkış yapmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await authService.logout();
        },
      },
    ]);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
            <Card>
              <Text style={styles.sectionTitle}>Profil Bilgileri</Text>
              <Input
                label="Ad"
                value={profileForm.firstName}
                onChangeText={(v) => setProfileForm((p) => ({ ...p, firstName: v }))}
                placeholder="Adınız"
              />
              <Input
                label="Soyad"
                value={profileForm.lastName}
                onChangeText={(v) => setProfileForm((p) => ({ ...p, lastName: v }))}
                placeholder="Soyadınız"
              />
              <Input
                label="E-posta"
                value={profileForm.email}
                onChangeText={(v) => setProfileForm((p) => ({ ...p, email: v }))}
                placeholder="ornek@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Kullanıcı Adı"
                value={user?.username || ''}
                editable={false}
              />
              <Button
                title="Kaydet"
                variant="accent"
                onPress={handleSaveProfile}
                loading={saving}
                fullWidth
                style={styles.saveButton}
              />
            </Card>
        );
      case 'security':
        return (
          <Card>
            <Text style={styles.sectionTitle}>Kimlik & Güvenlik</Text>
            <SettingRow
              icon="shield-checkmark-outline"
              title="Kimlik Doğrulama"
              description="TC Kimlik Kartınızı NFC ile doğrulayın"
              onPress={() => navigation.navigate('Verification')}
              actionIcon="chevron-forward"
            />
            <SettingRow
              icon="key-outline"
              title="İki Adımlı Doğrulama (2FA)"
              description={
                twoFactorEnabled
                  ? 'Etkin · Giriş sırasında e-postanıza kod gönderilir'
                  : 'Hesabınız için ek güvenlik katmanı ekleyin'
              }
              value={twoFactorEnabled}
              onValueChange={() => open2faModal()}
            />
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Şifre Değiştir</Text>
            <Input
              label="Mevcut Şifre"
              value={passwordForm.current}
              onChangeText={(v) => setPasswordForm((p) => ({ ...p, current: v }))}
              placeholder="••••••••"
              secureTextEntry
            />
            <Input
              label="Yeni Şifre"
              value={passwordForm.newPass}
              onChangeText={(v) => setPasswordForm((p) => ({ ...p, newPass: v }))}
              placeholder="••••••••"
              secureTextEntry
            />
            <Input
              label="Yeni Şifre Tekrar"
              value={passwordForm.confirm}
              onChangeText={(v) => setPasswordForm((p) => ({ ...p, confirm: v }))}
              placeholder="••••••••"
              secureTextEntry
            />
            <Button
              title="Şifreyi Değiştir"
              variant="primary"
              onPress={handleChangePassword}
              loading={saving}
              fullWidth
              style={styles.saveButton}
            />
          </Card>
        );
      case 'notifications':
        return (
          <Card>
            <Text style={styles.sectionTitle}>Bildirim Ayarları</Text>
            <SettingRow
              icon="mail-outline"
              title="E-posta Bildirimleri"
              description="Sözleşme güncellemeleri için e-posta al"
              value={notifPrefs.email}
              onValueChange={(v) => setNotifPref('email', v)}
            />
            <SettingRow
              icon="notifications-outline"
              title="Push Bildirimleri"
              description="Anlık bildirimler al"
              value={notifPrefs.push}
              onValueChange={(v) => setNotifPref('push', v)}
            />
            <SettingRow
              icon="chatbubble-outline"
              title="Onay Bildirimleri"
              description="Onay işlemleri için bildirim al"
              value={notifPrefs.approvals}
              onValueChange={(v) => setNotifPref('approvals', v)}
            />
          </Card>
        );
    }
  };

  return (
    <ScreenWrapper>
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
      <Header title="Ayarlar" subtitle="Hesap ve uygulama ayarları" />

      {user && (
        <Card style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.firstName?.[0] || user.username?.[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {user.firstName} {user.lastName}
              </Text>
              <Text style={styles.profileEmail}>{user.email}</Text>
            </View>
          </View>
        </Card>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={activeTab === tab.key ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {renderContent()}

      <Button
        title="Çıkış Yap"
        variant="outline"
        onPress={handleLogout}
        fullWidth
        icon={<Ionicons name="log-out-outline" size={20} color={colors.primary} />}
        style={styles.logoutButton}
      />
    </ScrollView>

    <Modal
      visible={!!twoFactorModal}
      transparent
      animationType="fade"
      onRequestClose={() => setTwoFactorModal(null)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {twoFactorModal === 'enable'
              ? 'İki Adımlı Doğrulamayı Aç'
              : 'İki Adımlı Doğrulamayı Kapat'}
          </Text>
          <Text style={styles.modalDesc}>
            {twoFactorSending
              ? 'Kod gönderiliyor...'
              : twoFactorInfo || 'E-postanıza gelen 6 haneli kodu girin.'}
          </Text>
          <Input
            label="Doğrulama Kodu"
            value={twoFactorCode}
            onChangeText={(v) => setTwoFactorCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            keyboardType="numeric"
            maxLength={6}
          />
          {twoFactorError ? (
            <Text style={styles.modalError}>{twoFactorError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Button
              title="İptal"
              variant="outline"
              onPress={() => setTwoFactorModal(null)}
              style={styles.modalButton}
            />
            <Button
              title="Doğrula"
              variant="accent"
              loading={twoFactorVerifying}
              onPress={verify2faCode}
              style={[styles.modalButton, styles.modalButtonRight]}
            />
          </View>
          {!twoFactorSending && (
            <TouchableOpacity onPress={open2faModal} style={styles.resendBtn}>
              <Text style={styles.resendText}>Kodu tekrar gönder</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
    </ScreenWrapper>
  );
}

function SettingRow({ icon, title, description, onPress, actionIcon, value, onValueChange }) {
  const hasSwitch = typeof onValueChange === 'function';
  const inner = (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
      {hasSwitch ? (
        <Switch
          value={!!value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
          thumbColor="#fff"
          ios_backgroundColor={colors.surfaceAlt}
        />
      ) : actionIcon ? (
        <Ionicons name={actionIcon} size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );
  // Switch'in kendi tap alani var; row'u ayrica TouchableOpacity ile sarmak
  // hem dokunma hedeflerini cakistirir hem de istem disi toggle'a yol acar.
  if (onPress && !hasSwitch) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  profileCard: {
    marginBottom: 16,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.textInverse,
  },
  profileInfo: {
    marginLeft: 14,
  },
  profileName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    color: colors.text,
  },
  profileEmail: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tabsContainer: {
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
  },
  sectionTitle: {
    fontFamily: fonts.headingMedium,
    fontSize: 16,
    color: colors.text,
    marginBottom: 20,
  },
  saveButton: {
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  settingDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutButton: {
    marginTop: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 22,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  modalError: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  modalButton: { flex: 1 },
  modalButtonRight: { marginLeft: 10 },
  resendBtn: { alignSelf: 'center', marginTop: 12, padding: 6 },
  resendText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.accent,
  },
});
