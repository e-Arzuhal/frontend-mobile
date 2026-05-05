import { Alert, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import api from './api.service';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class PushNotificationService {
  constructor() {
    this._receivedSub = null;
    this._responseSub = null;
  }

  /**
   * Cihazı Expo push servisine kayıt et ve token'ı backend'e ilet.
   * `silent: true` verilirse permission reddedilince kullanıcıya alert
   * gösterme — App.js'in arka plan kaydı için kullanılır; Settings'ten
   * elle tetiklenirse alert görünür.
   */
  async registerForPushNotificationsAsync({ silent = false } = {}) {
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
      // Android 13+ için POST_NOTIFICATIONS izni + bildirim kanalı
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Bildirimler',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#C8963E',
        });
      } catch {
        // Kanal oluşturma başarısız olursa kayıt akışını bloklamayalım.
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (!silent) {
        Alert.alert(
          'Bildirim İzni Gerekli',
          'Onay bekleyen sözleşmelerden ve karşı taraf cevaplarından haberdar olmak için bildirim izni vermelisiniz.'
        );
      }
      return null;
    }

    // Expo SDK 50+ EAS build'de getExpoPushTokenAsync için projectId gerekir
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    let token = null;
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      token = tokenResponse?.data || null;
    } catch (e) {
      // Expo Go'da veya projectId yoksa hata fırlatır — backend'e kayıt
      // atlanır ama uygulamanın geri kalanı çalışmaya devam etsin.
      if (!silent) {
        console.warn('Expo push token alınamadı:', e?.message);
      }
      return null;
    }

    if (!token) return null;

    try {
      await api.post('/api/notifications/device-token', {
        token,
        platform: Platform.OS,
      });
    } catch {
      // Backend'e kayıt başarısız olsa bile token'ı dön — caller bilsin.
    }
    return token;
  }

  /**
   * Foreground/background bildirim olaylarını dinle. App.js açılışında bir kez
   * çağrılır; aynı handler tekrar register edilmez.
   * onReceive: bildirim cihaza geldiğinde (uygulama açıkken).
   * onResponse: kullanıcı bildirime tıkladığında (deep link / navigation için).
   */
  addListeners({ onReceive, onResponse } = {}) {
    this.removeListeners();
    if (onReceive) {
      this._receivedSub = Notifications.addNotificationReceivedListener(onReceive);
    }
    if (onResponse) {
      this._responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
    }
  }

  removeListeners() {
    try { this._receivedSub?.remove(); } catch {}
    try { this._responseSub?.remove(); } catch {}
    this._receivedSub = null;
    this._responseSub = null;
  }
}

const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
