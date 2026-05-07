import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

// expo-speech-recognition is a native module. Its top-level
// `requireNativeModule("ExpoSpeechRecognition")` call throws synchronously
// at import time when the native module isn't registered (Expo Go, or a
// build that hasn't picked up the autolinked module yet). A static `import`
// would propagate that throw and crash any screen using this hook on mount.
// Load it defensively instead so the screens still render and the mic UI
// just hides itself when voice input isn't available.
let ExpoSpeechRecognitionModule = null;
let nativeUseSpeechRecognitionEvent = null;
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule || null;
  nativeUseSpeechRecognitionEvent = mod.useSpeechRecognitionEvent || null;
} catch {
  // Native module not linked into this build. Voice input stays disabled.
}

const SPEECH_AVAILABLE = !!(ExpoSpeechRecognitionModule && nativeUseSpeechRecognitionEvent);

// Stable reference: chosen once at module load. Either the real hook (which
// itself uses hooks internally) or a no-op. Either way the call site below
// invokes the same function in the same order on every render, so React's
// rules-of-hooks invariant is preserved across the component's lifetime.
const useSpeechRecognitionEvent = nativeUseSpeechRecognitionEvent || (() => {});

/**
 * React Native hook for voice-to-text using expo-speech-recognition.
 * Cihazın native ses tanıma motorunu kullanır (Android'de Google Speech
 * Services, iOS'te Siri/SFSpeechRecognizer).
 *
 * @param {Object} options
 * @param {string} options.lang - Dil kodu (varsayılan: 'tr-TR')
 * @param {boolean} options.continuous - Cümle sonunda durmayıp dinlemeye
 *   devam etsin mi (chatbot/uzun metin için true). Varsayılan: true.
 * @param {boolean} options.interimResults - Konuşurken anlık transkript göster.
 *   Varsayılan: true.
 * @param {function} options.onResult - Her tanınan metin parçası için callback.
 *   Sadece final sonuçlar gönderilir (interim sonuçlar burada üretilmez).
 * @param {function} options.onError - Hata callback'i
 */
export default function useVoiceInput({
  lang = 'tr-TR',
  continuous = true,
  interimResults = true,
  onResult,
  onError,
} = {}) {
  const [isListening, setIsListening] = useState(false);
  // Native modül linklendiyse mikrofonu en azından dene; isRecognitionAvailable
  // bazı cihazlarda false dönüp start()'ın aslında çalıştığı durumlar var,
  // o yüzden gating'i sadece SPEECH_AVAILABLE üzerinden yapıyoruz. Buton
  // gizlenmesin diye `isSupported` aliası SPEECH_AVAILABLE'e set edilir.
  const [isAvailable, setIsAvailable] = useState(SPEECH_AVAILABLE);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  // Cümle bittiğinde son final transcript'i tekrar göndermeyelim diye guard.
  const lastFinalRef = useRef('');

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Cihazda speech recognition mevcudiyetini sor — false dönerse de
  // butonu yok etmek yerine kullanıcının denemesine izin ver; gerçek
  // hata mesajı start() tetiklendiğinde gösterilecek.
  useEffect(() => {
    if (!SPEECH_AVAILABLE) {
      setIsAvailable(false);
      return undefined;
    }
    let cancelled = false;
    try {
      ExpoSpeechRecognitionModule.isRecognitionAvailable()
        .then((available) => { if (!cancelled && available) setIsAvailable(true); })
        .catch(() => { /* check başarısız → buton görünür kalır, start() denenir */ });
    } catch {
      // sessizce geç — buton görünür kalır
    }
    return () => { cancelled = true; };
  }, []);

  // Unmount olursa mikrofonu kesin durdur — aksi halde ekrandan çıkılsa
  // bile native recognizer açık kalabilir (pil + privacy sorunu).
  useEffect(() => {
    return () => {
      if (!SPEECH_AVAILABLE) return;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // zaten kapalıysa sessizce geç
      }
    };
  }, []);

  // Event listeners (no-op if module unavailable)
  useSpeechRecognitionEvent('result', (event) => {
    if (!event?.results?.length) return;
    const transcript = event.results[0]?.transcript;
    if (!transcript) return;
    if (event.isFinal) {
      // continuous=true modunda native motor "result" final + ardından "end"
      // göndermez; sadece final result gönderir ve dinlemeye devam eder.
      // Aynı transcript birden fazla kez tetiklenirse mükerrer eklemeyi engelle.
      if (transcript === lastFinalRef.current) return;
      lastFinalRef.current = transcript;
      onResultRef.current?.(transcript);
    }
  });

  useSpeechRecognitionEvent('start', () => {
    lastFinalRef.current = '';
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => setIsListening(false));

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (onErrorRef.current) {
      const messages = {
        'not-allowed': 'Mikrofon izni reddedildi. Telefon ayarlarından izin verin.',
        'service-not-allowed': 'Ses tanıma izni reddedildi. Telefon ayarlarından izin verin.',
        'no-speech': 'Konuşma algılanamadı. Tekrar deneyin.',
        'audio-capture': 'Mikrofon bulunamadı veya başka bir uygulama tarafından kullanılıyor.',
        'network': 'Ağ hatası. İnternet bağlantınızı kontrol edin.',
        'aborted': null, // kullanıcı kendisi durdurdu — sessiz geç
        'language-not-supported': 'Türkçe ses tanıma bu cihazda desteklenmiyor.',
      };
      const msg = messages[event.error];
      if (msg !== null) {
        onErrorRef.current(msg || `Ses tanıma hatası: ${event.error || 'bilinmeyen'}`);
      }
    }
  });

  const startListening = useCallback(async () => {
    if (!SPEECH_AVAILABLE) {
      onErrorRef.current?.('Bu sürümde ses tanıma desteklenmiyor.');
      return;
    }

    try {
      // İzin akışı: önce mikrofon + ses tanıma izinlerini iste. Android 13+
      // RECORD_AUDIO runtime izni ister; iOS hem NSMicrophoneUsage hem
      // NSSpeechRecognitionUsage izni ister.
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result?.granted) {
        onErrorRef.current?.(
          'Mikrofon ve ses tanıma izni gereklidir. Lütfen telefon ayarlarından izin verin.'
        );
        return;
      }

      lastFinalRef.current = '';

      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults,
        continuous,
        // iOS'te otomatik noktalama
        addsPunctuation: true,
        // Android: cihaz dahili modeli tercih et (offline çalışabilir);
        // yoksa native motor online'a fallback eder.
        ...(Platform.OS === 'android'
          ? {
              requiresOnDeviceRecognition: false,
              androidIntentOptions: {
                EXTRA_LANGUAGE_PREFERENCE: lang,
                // Daha uzun konuşmalar için sessizlik toleransı
                EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
                EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
              },
            }
          : {}),
      });
    } catch (err) {
      onErrorRef.current?.(
        `Ses tanıma başlatılamadı: ${err?.message || err}`
      );
    }
  }, [lang, continuous, interimResults]);

  const stopListening = useCallback(() => {
    if (!SPEECH_AVAILABLE) return;
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

  // isSupported ve isAvailable iki ayrı isim altında dön: çağıran ekranlar
  // ya birini ya diğerini kullanıyor (web frontend `isSupported`, mobile
  // `isAvailable` bekliyor).
  return {
    isListening,
    isAvailable: SPEECH_AVAILABLE,
    isSupported: SPEECH_AVAILABLE,
    isRecognitionAvailable: isAvailable,
    startListening,
    stopListening,
    toggleListening,
  };
}
