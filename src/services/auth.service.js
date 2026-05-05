import api from './api.service';
import * as SecureStore from 'expo-secure-store';

// App.js logout sonrası Login ekranına dönmek için bir callback register eder.
// authService.logout() bu callback'i çağırarak state'i sıfırlar.
let _onLogout = null;
export const setOnLogout = (cb) => { _onLogout = cb; };

class AuthService {
  async register(userData) {
    const response = await api.post('/api/auth/register', {
      username: userData.username,
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
    });

    if (response.accessToken) {
      await SecureStore.setItemAsync('authToken', response.accessToken);
      await SecureStore.setItemAsync('user', JSON.stringify(response.userInfo));
    }

    return response;
  }

  async login(usernameOrEmail, password, twoFactorCode) {
    const response = await api.post('/api/auth/login', {
      usernameOrEmail,
      password,
      twoFactorCode: twoFactorCode || null,
    });

    if (response.accessToken) {
      await SecureStore.setItemAsync('authToken', response.accessToken);
      await SecureStore.setItemAsync('user', JSON.stringify(response.userInfo));
    }

    return response;
  }

  async logout() {
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('user');
    // SettingsScreen'den çağrıldığında App.js otomatik olarak Login ekranına
    // dönsün diye callback'i tetikle. NavigationContainer.onStateChange tek
    // başına yeterli değil — kullanıcı navigate etmedikçe state taze kalmaz.
    if (_onLogout) {
      try { _onLogout(); } catch {}
    }
  }

  /** E-posta'ya 6 haneli şifre sıfırlama kodu gönderme talebi. */
  async requestPasswordReset(email) {
    return api.post('/api/auth/forgot-password', { email });
  }

  /** E-posta + kod ile yeni şifre belirleme. */
  async confirmPasswordReset(email, code, newPassword) {
    return api.post('/api/auth/reset-password', { email, code, newPassword });
  }

  /** Authenticated kullanıcıya 2FA kodu (enable/disable) e-postaya gönder. */
  async send2faCode(action = 'enable') {
    return api.post(`/api/auth/2fa/send?action=${encodeURIComponent(action)}`);
  }

  /** 2FA kodunu doğrula ve enable/disable işlemini sunucuda kalıcı yap. */
  async verify2faCode(code, action = 'enable') {
    return api.post('/api/auth/2fa/verify', { code, action });
  }

  async isAuthenticated() {
    const token = await SecureStore.getItemAsync('authToken');
    return !!token;
  }

  async getCurrentUser() {
    const userStr = await SecureStore.getItemAsync('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  async getToken() {
    return await SecureStore.getItemAsync('authToken');
  }
}

const authService = new AuthService();
export default authService;
