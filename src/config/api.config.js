import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ── Backend base URL configuration ───────────────────────────────────────
// Production / APK builds:
//   Set EXPO_PUBLIC_API_BASE_URL before running `expo prebuild` or
//   `expo export` — Metro inlines EXPO_PUBLIC_* vars into the JS bundle
//   at build time. Example:
//     EXPO_PUBLIC_API_BASE_URL=http://192.168.1.187:8080 npx expo prebuild --clean
//   Or put it in a `.env` file at the project root.
//
// Development:
//   The Metro debugger host is auto-detected, so you don't have to set
//   anything when running `npx expo start` on a physical device.
//
// Fallback:
//   If the env var is missing in a release build, we use 192.168.1.187:8080
//   to preserve the previous hardcoded behavior.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_RELEASE_BASE_URL = 'http://192.168.1.187:8080';

const getBaseUrl = () => {
  if (__DEV__) {
    // Physical device via Expo Go / dev client: derive IP from Metro host
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:8080`;
    }
    // Fallback: emulator / simulator
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8080';
    }
    return 'http://localhost:8080';
  }

  // Release (APK) build — physical device cannot reach localhost; use the
  // server's LAN IP from the env var set at build time.
  return process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_RELEASE_BASE_URL;
};

export const API_BASE_URL = getBaseUrl();
export const API_TIMEOUT = 30000;
