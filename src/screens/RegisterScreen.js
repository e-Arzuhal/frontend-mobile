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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import Input from '../components/Input';
import Button from '../components/Button';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Ad gerekli';
    if (!form.lastName.trim()) e.lastName = 'Soyad gerekli';
    if (!form.username.trim()) e.username = 'Kullanıcı adı gerekli';
    if (!form.email.trim()) e.email = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Geçerli bir e-posta girin';
    if (!form.password) e.password = 'Şifre gerekli';
    else if (form.password.length < 6) e.password = 'Şifre en az 6 karakter olmalı';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Şifreler eşleşmiyor';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const authService = require('../services/auth.service').default;
      await authService.register(form);
    } catch (error) {
      Alert.alert('Kayıt Hatası', error.message || 'Kayıt yapılamadı.');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.subtitle}>Yeni hesap oluşturun</Text>
        </View>

        <View style={[styles.card, shadows.md]}>
          <Text style={styles.cardTitle}>Kayıt Ol</Text>

          <View style={styles.row}>
            <Input
              label="Ad"
              value={form.firstName}
              onChangeText={(v) => updateField('firstName', v)}
              placeholder="Adınız"
              error={errors.firstName}
              style={styles.halfInput}
            />
            <Input
              label="Soyad"
              value={form.lastName}
              onChangeText={(v) => updateField('lastName', v)}
              placeholder="Soyadınız"
              error={errors.lastName}
              style={styles.halfInput}
            />
          </View>

          <Input
            label="Kullanıcı Adı"
            value={form.username}
            onChangeText={(v) => updateField('username', v)}
            placeholder="Kullanıcı adınız"
            error={errors.username}
            autoCapitalize="none"
            icon={<Ionicons name="person-outline" size={20} color={colors.textMuted} />}
          />

          <Input
            label="E-posta"
            value={form.email}
            onChangeText={(v) => updateField('email', v)}
            placeholder="ornek@email.com"
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            icon={<Ionicons name="mail-outline" size={20} color={colors.textMuted} />}
          />

          <Input
            label="Şifre"
            value={form.password}
            onChangeText={(v) => updateField('password', v)}
            placeholder="••••••••"
            error={errors.password}
            secureTextEntry
            icon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
          />

          <Input
            label="Şifre Tekrar"
            value={form.confirmPassword}
            onChangeText={(v) => updateField('confirmPassword', v)}
            placeholder="••••••••"
            error={errors.confirmPassword}
            secureTextEntry
            icon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
          />

          <Button
            title="Kayıt Ol"
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
            variant="accent"
            style={styles.registerButton}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Zaten hesabınız var mı?</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.footerLink}> Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
    marginBottom: 24,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  registerButton: {
    marginTop: 8,
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
});
