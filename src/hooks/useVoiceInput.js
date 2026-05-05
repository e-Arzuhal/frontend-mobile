import { useState, useCallback, useRef, useEffect } from 'react';

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
    if (!SPEECH_AVAILABLE) {
      setIsAvailable(false);
      return undefined;
    }
    let cancelled = false;
    try {
      ExpoSpeechRecognitionModule.isRecognitionAvailable()
        .then((available) => { if (!cancelled) setIsAvailable(available); })
        .catch(() => { if (!cancelled) setIsAvailable(false); });
    } catch {
      setIsAvailable(false);
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
    if (!SPEECH_AVAILABLE || !isAvailable) return;

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

  return { isListening, isAvailable, startListening, stopListening, toggleListening };
}
