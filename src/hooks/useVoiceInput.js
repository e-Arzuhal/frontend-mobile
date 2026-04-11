import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/**
 * React Native hook for voice-to-text using expo-speech-recognition.
 * Uses the device's native speech recognition engine.
 *
 * @param {Object} options
 * @param {string} options.lang - Dil kodu (varsayılan: 'tr-TR')
 * @param {function} options.onResult - Her tanınan metin parçası için callback
 * @param {function} options.onError - Hata callback'i
 */
export default function useVoiceInput({ lang = 'tr-TR', onResult, onError } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Cihazda speech recognition var mı kontrol et
  useEffect(() => {
    let cancelled = false;
    ExpoSpeechRecognitionModule.isRecognitionAvailable()
      .then((available) => { if (!cancelled) setIsAvailable(available); })
      .catch(() => { if (!cancelled) setIsAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  // Unmount olursa mikrofonu kesin durdur — aksi halde ekrandan çıkılsa
  // bile native recognizer açık kalabilir (pil + privacy sorunu).
  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // zaten kapalıysa sessizce geç
      }
    };
  }, []);

  // Event listeners
  useSpeechRecognitionEvent('result', (event) => {
    // Son final sonucu al
    if (event.isFinal && event.results?.length > 0) {
      const transcript = event.results[0]?.transcript;
      if (transcript && onResultRef.current) {
        onResultRef.current(transcript);
      }
    }
  });

  useSpeechRecognitionEvent('start', () => setIsListening(true));

  useSpeechRecognitionEvent('end', () => setIsListening(false));

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (onErrorRef.current) {
      const messages = {
        'not-allowed': 'Mikrofon izni reddedildi. Ayarlardan izin verin.',
        'no-speech': 'Konuşma algılanamadı. Tekrar deneyin.',
        'network': 'Ağ hatası. İnternet bağlantınızı kontrol edin.',
      };
      onErrorRef.current(messages[event.error] || `Ses tanıma hatası: ${event.error}`);
    }
  });

  const startListening = useCallback(async () => {
    if (!isAvailable) return;

    try {
      // İzin kontrolü
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        onErrorRef.current?.('Mikrofon izni reddedildi. Ayarlardan izin verin.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: false,
        continuous: false, // Her cümle sonrası durur — daha stabil
      });
    } catch (err) {
      // İzin promise'i veya start() reject olursa kullanıcıyı bilgilendir,
      // aksi halde mic butonuna basmak sessizce hiçbir şey yapmaz.
      onErrorRef.current?.(
        `Ses tanıma başlatılamadı: ${err?.message || err}`
      );
    }
  }, [isAvailable, lang]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // zaten kapalıysa sessizce geç
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return { isListening, isAvailable, startListening, stopListening, toggleListening };
}
