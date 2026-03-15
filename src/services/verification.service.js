import api from './api.service';

const verificationService = {
  /** Get current user's verification status */
  getStatus: () => api.get('/api/verification/status'),

  /** Submit identity verification (NFC, MRZ, or MANUAL) */
  verify: (data) => api.post('/api/verification/identity', data),

  /**
   * Check if user is verified. Returns true/false.
   * Used as a gate before contract operations.
   */
  isVerified: async () => {
    try {
      const status = await api.get('/api/verification/status');
      return status?.verified === true;
    } catch {
      return false;
    }
  },
};

export default verificationService;
