import api from './api.service';

const contractService = {
  // NLP intent + spaCy NER + GraphRAG + Gemini açıklama zinciri toplam 30-60sn
  // sürebiliyor — varsayılan 30sn timeout sözleşme analizini sıklıkla iptal
  // ediyordu. 90sn'ye çıkarıyoruz (chatbot.service de 60sn kullanıyor).
  analyze: (text) => api.post('/api/analysis/analyze', { text }, { timeoutMs: 90000 }),
  create: (data) => api.post('/api/contracts', data),
  // skipAuthHandler: backend yanlışlıkla 401 dönerse kullanıcıyı sözleşme
  // oluşturma formunun ortasında oturumdan düşürmeyelim; çağıran kod
  // (CreateContractScreen.handleTcKimlikChange) hatayı `{found:false}` ile
  // değerlendirir.
  lookupUserByTc: (tcKimlik) =>
    api.get('/api/users/lookup', { tcKimlik }, { skipAuthHandler: true }),
  getAll: (params) => api.get('/api/contracts', params),
  getById: (id) => api.get(`/api/contracts/${id}`),
  update: (id, data) => api.put(`/api/contracts/${id}`, data),
  delete: (id) => api.delete(`/api/contracts/${id}`),
  finalize: (id) => api.post(`/api/contracts/${id}/finalize`),
  getPendingApprovals: () => api.get('/api/contracts/pending-approval'),
  getStats: () => api.get('/api/contracts/stats'),
  approve: (id) => api.post(`/api/contracts/${id}/approve`),
  reject: (id) => api.post(`/api/contracts/${id}/reject`),
  /** GraphRAG'den sözleşme tipine göre zorunlu/opsiyonel madde rehberi. */
  getRequiredClauses: (id) => api.get(`/api/contracts/${id}/required-clauses`),
};

export default contractService;
