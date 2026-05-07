import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, fonts, radius, shadows } from '../styles/tokens';
import ScreenWrapper from '../components/ScreenWrapper';
import Header from '../components/Header';
import chatbotService from '../services/chatbot.service';
import useVoiceInput from '../hooks/useVoiceInput';

const INITIAL_MESSAGE = {
  id: '0',
  role: 'assistant',
  content:
    'Merhaba! Ben e-Arzuhal yardım asistanıyım. Sözleşme oluşturma, PDF indirme veya onay süreci hakkında size yardımcı olabilirim.',
};

const SUGGESTED_INITIAL = [
  'Sözleşme nasıl oluşturulur?',
  'PDF nasıl indirilir?',
  'Hangi sözleşme tipleri destekleniyor?',
];

export default function ChatbotScreen() {
  // Tab navigator içindeki KeyboardAvoidingView, tab bar yüksekliğini bilmediği
  // için klavye açıldığında input + öneri çipleri tab bar'ın altında kalıyordu.
  // Tab bar height'ı offset'e ekleyerek alttaki içerik klavyenin tam üstüne çıksın.
  const tabBarHeight = useBottomTabBarHeight();
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState(SUGGESTED_INITIAL);
  const [contractOptions, setContractOptions] = useState([]);
  const [selectedContractId, setSelectedContractId] = useState(null);
  const [pendingMessage, setPendingMessage] = useState('');
  const flatListRef = useRef(null);

  /* ── Voice-to-Text ── */
  const handleVoiceResult = useCallback((text) => {
    setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text);
  }, []);

  const handleVoiceError = useCallback((err) => {
    Alert.alert('Ses Tanıma Hatası', err);
  }, []);

  const { isListening, isAvailable: voiceAvailable, toggleListening } = useVoiceInput({
    lang: 'tr-TR',
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });

  useEffect(() => {
    if (messages.length > 1) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const getHistory = () =>
    messages.map((m) => ({ role: m.role, content: m.content }));

  const send = async (text, opts = {}) => {
    const trimmed = (text ?? '').trim();
    const contractId = opts.contractId ?? selectedContractId;
    const skipUserBubble = opts.skipUserBubble === true;
    if (!trimmed || loading) return;

    if (!skipUserBubble) {
      setMessages((prev) => [...prev, { id: String(Date.now()), role: 'user', content: trimmed }]);
    }
    setInput('');
    setSuggested([]);
    setContractOptions([]);
    setLoading(true);

    try {
      const res = await chatbotService.sendMessage(trimmed, getHistory(), contractId || null);
      const botMsg = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: res.response,
      };
      setMessages((prev) => [...prev, botMsg]);

      if (res.requiresContractSelection && Array.isArray(res.contractOptions) && res.contractOptions.length) {
        setContractOptions(res.contractOptions);
        setPendingMessage(trimmed);
      } else if (res.suggestedQuestions?.length) {
        setSuggested(res.suggestedQuestions);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: 'Bir hata oluştu. Lütfen tekrar deneyin.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const pickContract = async (option) => {
    setSelectedContractId(option.id);
    const labelText = `Seçilen sözleşme: ${option.title || `#${option.id}`}`;
    setMessages((prev) => [...prev, { id: String(Date.now()), role: 'user', content: labelText }]);
    setContractOptions([]);
    if (pendingMessage) {
      const msg = pendingMessage;
      setPendingMessage('');
      await send(msg, { contractId: option.id, skipUserBubble: true });
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowBot]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="chatbubble-ellipses" size={14} color={colors.textInverse} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenWrapper>
      {/* Diğer sekmelerdeki ile aynı yatay padding (20px) — Header doğrudan
          ScreenWrapper'ın çocuğuyken ekran kenarına yapışıyordu. */}
      <View style={styles.headerWrap}>
        <Header title="Yardım Asistanı" subtitle="Size nasıl yardımcı olabiliriz?" />
      </View>

      {/* Android: native adjustResize klavye açıldığında tab bar dahil
          her şeyi yukarı iter; KeyboardAvoidingView "height" ile birlikte
          kullanılınca offset KALICI olarak rezerve ediliyordu ve klavye
          kapansa bile alt boşluk açık kalıyordu. Android'de behavior=undefined
          bırakıyoruz → klavyenin kapanması da içeriği eski yerine geri çeker.
          iOS'te padding gerekli; tab bar yüksekliğini offset olarak ekleriz. */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        {/* Mesaj Listesi */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            loading ? (
              <View style={styles.messageRow}>
                <View style={styles.avatar}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={colors.textInverse} />
                </View>
                <View style={styles.bubbleBot}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Sözleşme Seçimi */}
        {contractOptions.length > 0 && !loading && (
          <View style={styles.contractsBlock}>
            <Text style={styles.contractsLabel}>
              Hangi sözleşme hakkında konuşalım?
            </Text>
            <ScrollView
              style={{ maxHeight: 180 }}
              contentContainerStyle={{ gap: 6 }}
            >
              {contractOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.contractOption}
                  onPress={() => pickContract(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.contractOptionTitle}>
                    {opt.title || `Sözleşme #${opt.id}`}
                  </Text>
                  <Text style={styles.contractOptionSubtitle}>
                    {(opt.type || 'Sözleşme') + ' · ' + (opt.status || '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Önerilen Sorular — uzun soru metinleri çipte iki satıra
            taşıp scroll'un yarısını kapatıyordu; numberOfLines=1 ile tek
            satıra zorla, çiplerin shrink olmasını engelle. */}
        {suggested.length > 0 && !loading && contractOptions.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestedContainer}
            style={styles.suggestedScroll}
          >
            {suggested.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={styles.suggestionChip}
                onPress={() => send(q)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionChipText} numberOfLines={1}>
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Mesajınızı yazın..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons
              name="send"
              size={18}
              color={input.trim() && !loading ? colors.textInverse : colors.textMuted}
            />
          </TouchableOpacity>
          {/* Mikrofon butonu */}
          {voiceAvailable && (
            <TouchableOpacity
              style={[styles.micButton, isListening && styles.micButtonActive]}
              onPress={toggleListening}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={18}
                color={isListening ? '#fff' : colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  kav: { flex: 1 },

  messageList: {
    padding: 16,
    paddingBottom: 8,
    gap: 12,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowBot: {
    justifyContent: 'flex-start',
  },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
    minWidth: 48,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.body,
  },
  bubbleTextUser: {
    color: colors.textInverse,
  },
  bubbleTextBot: {
    color: colors.text,
  },

  // Önerilen sorular
  suggestedScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  suggestedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestionChip: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 260,
  },
  suggestionChipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  micButtonActive: {
    backgroundColor: '#ef4444',
  },
  contractsBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  contractsLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 6,
  },
  contractOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  contractOptionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  contractOptionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
