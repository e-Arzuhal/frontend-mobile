import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';
import * as SecureStore from 'expo-secure-store';

// 401 aldığında çağrılacak global callback — App.js tarafından register edilir
let _onUnauthorized = null;
export const setOnUnauthorized = (cb) => { _onUnauthorized = cb; };

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.timeout = API_TIMEOUT;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // skipAuthHandler: 401 alındığında global oturum temizleme/Login yönlendirme
    // tetiklenmesin. Sözleşme oluştururken TC kimlik lookup gibi yan akışlarda
    // 401 (sunucu yanlış yapılandırılmışsa) kullanıcıyı form ortasında çıkışa
    // zorlamaz; çağıran kod 401'i normal hata gibi yakalar.
    const { skipAuthHandler, headers: customHeaders, ...fetchOpts } = options;
    const headers = { 'Content-Type': 'application/json', ...customHeaders };
    const token = await SecureStore.getItemAsync('authToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, { ...fetchOpts, headers, signal: controller.signal });
      clearTimeout(timeoutId);

      // Token süresi dolmuş veya geçersiz → oturumu temizle, login'e yönlendir
      if (response.status === 401) {
        if (!skipAuthHandler) {
          await SecureStore.deleteItemAsync('authToken');
          await SecureStore.deleteItemAsync('user');
          if (_onUnauthorized) _onUnauthorized();
          throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
        }
        // skipAuthHandler senaryosu: çağıranın kararına bırak
        throw new Error('HTTP 401');
      }

      const contentType = response.headers.get('content-type');
      const hasBody = response.status !== 204 && contentType?.includes('application/json');
      const data = hasBody ? await response.json() : {};
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') throw new Error('İstek zaman aşımına uğradı.');
      throw error;
    }
  }

  get(endpoint, params = {}, opts = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(query ? `${endpoint}?${query}` : endpoint, { method: 'GET', ...opts });
  }

  post(endpoint, data = {}, opts = {}) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(data), ...opts });
  }

  put(endpoint, data = {}, opts = {}) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data), ...opts });
  }

  delete(endpoint, opts = {}) {
    return this.request(endpoint, { method: 'DELETE', ...opts });
  }
}

const api = new ApiService();
export default api;
