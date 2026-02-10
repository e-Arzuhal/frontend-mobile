import api from './api.service';

const contractService = {
  create: (data) => api.post('/api/contracts', data),
  getAll: (params) => api.get('/api/contracts', params),
  getById: (id) => api.get(`/api/contracts/${id}`),
  update: (id, data) => api.put(`/api/contracts/${id}`, data),
  delete: (id) => api.delete(`/api/contracts/${id}`),
  finalize: (id) => api.post(`/api/contracts/${id}/finalize`),
  getPendingApprovals: () => api.get('/api/contracts/pending-approval'),
  getStats: () => api.get('/api/contracts/stats'),
  approve: (id) => api.post(`/api/contracts/${id}/approve`),
  reject: (id) => api.post(`/api/contracts/${id}/reject`),
};

export default contractService;
