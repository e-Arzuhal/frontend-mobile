import ApiService from './api.service';

class ChatbotService {
  /**
   * Chatbot'a mesaj gönderir. contractId verilmezse ve kullanıcının birden
   * fazla sözleşmesi varsa sunucu requiresContractSelection=true ve
   * contractOptions ile döner.
   */
  async sendMessage(message, history = [], contractId = null) {
    return ApiService.post('/api/chat', { message, history, contractId });
  }
}

const chatbotService = new ChatbotService();
export default chatbotService;
