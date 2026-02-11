import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Fiziksel cihaz: bilgisayarın LAN IP'si
// Android emülatör: 10.0.2.2
// iOS simülatör / web: localhost
const getBaseUrl = () => {
  if (__DEV__) {
    // Expo Go ile fiziksel cihazda çalışıyorsa debuggerHost'tan IP al
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:8080`;
    }
    // Fallback: emülatör/simülatör
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8080';
    }
    return 'http://localhost:8080';
  }
  return 'http://localhost:8080'; // Production URL buraya gelecek
};

export const API_BASE_URL = getBaseUrl();
export const API_TIMEOUT = 30000;
