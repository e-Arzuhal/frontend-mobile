import ApiService from './api.service';

// Chat çağrısı NLP intent + Gemini'yi tetikliyor; varsayılan 30s timeout
// gerçek dünyada yetmiyor (Gemini bazen 20-40s gecikiyor). Mobil
// "Bir hata oluştu lütfen tekrar deneyin" hatası bu yüzden çıkıyordu.
const CHAT_TIMEOUT_MS = 60000;

class ChatbotService {
  /**
   * Chatbot'a mesaj gönderir. contractId verilmezse ve kullanıcının birden
   * fazla sözleşmesi varsa sunucu requiresContractSelection=true ve
   * contractOptions ile döner.
   */
  async sendMessage(message, history = [], contractId = null) {
    return ApiService.post(
      '/api/chat',
      { message, history, contractId },
      { timeoutMs: CHAT_TIMEOUT_MS }
    );
  }
}

const chatbotService = new ChatbotService();
export default chatbotService;
