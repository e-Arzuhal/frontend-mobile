import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, fonts, radius } from '../styles/tokens';
import api from '../services/api.service';

const STORAGE_KEY = 'disclaimerAccepted_v1.0';

const DisclaimerModal = ({ visible, onAccepted }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/disclaimer/accept', { platform: 'MOBILE' });
    } catch {
      // Backend ulaşılamaz olsa da kullanıcı metni gördü — yerel olarak kaydet ve devam et
    }
    await SecureStore.setItemAsync(STORAGE_KEY, '1');
    onAccepted && onAccepted();
    setLoading(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.icon}>⚖️</Text>
            <Text style={styles.title}>Yasal Uyarı</Text>
            <Text style={styles.text}>
              Bu platform tarafından sunulan hukuki tavsiyeler yanıltıcı olabilir.
              Herhangi bir sözleşme veya hukuki işlem öncesinde bir{' '}
              <Text style={styles.bold}>avukata danışmanız şiddetle tavsiye edilir.</Text>
            </Text>
            <Text style={styles.subtext}>
              Devam etmek için aşağıdaki butona tıklayarak bu uyarıyı okuduğunuzu
              ve anladığınızı onaylayın.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleAccept}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Text style={styles.buttonText}>Okudum, Anladım — Devam Et</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const checkDisclaimerAccepted = async () => {
  const cached = await SecureStore.getItemAsync(STORAGE_KEY);
  if (cached) return true;
  try {
    const data = await api.get('/api/disclaimer/status');
    if (data.accepted) {
      await SecureStore.setItemAsync(STORAGE_KEY, '1');
      return true;
    }
  } catch {
    // backend erişilemiyor → modal'ı göster
  }
  return false;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 26, 48, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    maxHeight: '85%',
    width: '100%',
  },
  scroll: {
    padding: 32,
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 12,
  },
  bold: {
    fontFamily: fonts.bodyBold,
    color: colors.primary,
  },
  subtext: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.accent,
  },
});

export default DisclaimerModal;
