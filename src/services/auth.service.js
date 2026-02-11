import api from './api.service';
import * as SecureStore from 'expo-secure-store';

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

  async login(usernameOrEmail, password) {
    const response = await api.post('/api/auth/login', { usernameOrEmail, password });

    if (response.accessToken) {
      await SecureStore.setItemAsync('authToken', response.accessToken);
      await SecureStore.setItemAsync('user', JSON.stringify(response.userInfo));
    }

    return response;
  }

  async logout() {
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('user');
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
