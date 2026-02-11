import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Header from '../components/Header';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/auth.service';
import ScreenWrapper from '../components/ScreenWrapper';
import api from '../services/api.service';

const tabs = [
  { key: 'profile', label: 'Profil', icon: 'person-outline' },
  { key: 'security', label: 'Güvenlik', icon: 'shield-outline' },
  { key: 'notifications', label: 'Bildirimler', icon: 'notifications-outline' },
];

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userData = await authService.getCurrentUser();
    if (userData) {
      setUser(userData);
      setProfileForm({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
      });
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
    if (passwordForm.newPass.length < 6) {
      Alert.alert('Hata', 'Yeni şifre en az 6 karakter olmalı.');
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
          <ScreenWrapper>
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
          </ScreenWrapper> 
        );
      case 'security':
        return (
          <Card>
            <Text style={styles.sectionTitle}>Şifre Değiştir</Text>
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
            />
            <SettingRow
              icon="notifications-outline"
              title="Push Bildirimleri"
              description="Anlık bildirimler al"
            />
            <SettingRow
              icon="chatbubble-outline"
              title="Onay Bildirimleri"
              description="Onay işlemleri için bildirim al"
            />
          </Card>
        );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
  );
}

function SettingRow({ icon, title, description }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
});
