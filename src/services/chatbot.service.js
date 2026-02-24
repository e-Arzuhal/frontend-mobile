import ApiService from './api.service';

class ChatbotService {
  async sendMessage(message, history = []) {
    return ApiService.post('/api/chat', { message, history });
  }
}

const chatbotService = new ChatbotService();
export default chatbotService;
