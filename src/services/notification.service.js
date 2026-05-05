import api from './api.service';

const notificationService = {
  list: (unreadOnly = false) => api.get('/api/notifications', { unreadOnly }),
  unreadCount: () => api.get('/api/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/api/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/api/notifications/read-all'),
};

export default notificationService;
