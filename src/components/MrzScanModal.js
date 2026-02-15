/**
 * MrzScanModal — camera modal with on-device OCR to read the MRZ from
 * the back of a Turkish ID card. Auto-scans: while open, the component
 * keeps taking photos every ~1.2s and running OCR on each until it finds
 * valid TD1 MRZ lines. Stops automatically on success.
 *
 * Falls back gracefully when the camera or OCR module is unavailable
 * (Expo Go, no permission, etc.) so the user always has the manual-entry
 * path on the data-entry screen.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../styles/tokens';
import { recognizeMrzFromImage, OCR_AVAILABLE } from '../utils/mrz-ocr';

// Guarded camera import (Expo Go / missing module)
let CameraView = null;
let useCameraPermissions = null;
try {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  // expo-camera not available
}

const CAMERA_AVAILABLE = !!CameraView;
const SCAN_INTERVAL_MS = 1200;

export default function MrzScanModal({ visible, onClose, onResult }) {
  const [permission, requestPermission] =
    useCameraPermissions?.() || [null, async () => null];
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Kimliğin arka yüzünü çerçeveye yerleştirin');
  const [isError, setIsError] = useState(false);
  const cameraRef = useRef(null);
  const scanLoopRef = useRef(null);
  const cancelledRef = useRef(false);

  // Auto-request permission on open
  useEffect(() => {
    if (visible && CAMERA_AVAILABLE && !permission?.granted) {
      requestPermission?.();
    }
  }, [visible, permission?.granted]);

  // When the modal closes, cancel any in-flight scan loop
  useEffect(() => {
    if (!visible) {
      cancelledRef.current = true;
      if (scanLoopRef.current) {
        clearTimeout(scanLoopRef.current);
        scanLoopRef.current = null;
      }
      setBusy(false);
      setStatus('Kimliğin arka yüzünü çerçeveye yerleştirin');
      setIsError(false);
    } else {
      cancelledRef.current = false;
    }
  }, [visible]);

  const runOneScan = useCallback(async () => {
    if (cancelledRef.current) return false;
    if (!cameraRef.current) return false;

    setBusy(true);
    setIsError(false);
    setStatus('Taranıyor...');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        skipProcessing: true,
      });
      if (cancelledRef.current) return false;
      if (!photo?.uri) throw new Error('Fotoğraf alınamadı');

      const mrz = await recognizeMrzFromImage(photo.uri);
      if (cancelledRef.current) return false;

      if (mrz) {
        setStatus('MRZ bulundu!');
        onResult(mrz);
        return true;
      }
      setStatus('MRZ bulunamadı, tekrar deneniyor...');
      setIsError(true);
      return false;
    } catch (err) {
      if (cancelledRef.current) return false;
      setStatus(`Tanıma hatası: ${err?.message || 'bilinmeyen'}`);
      setIsError(true);
      return false;
    } finally {
      if (!cancelledRef.current) setBusy(false);
    }
  }, [onResult]);

  // Auto-scan loop: keep scanning until MRZ is found or modal closes
  useEffect(() => {
    if (!visible || !CAMERA_AVAILABLE || !permission?.granted || !OCR_AVAILABLE) return;

    let stopped = false;
    const tick = async () => {
      if (stopped || cancelledRef.current) return;
      const found = await runOneScan();
      if (found || stopped || cancelledRef.current) return;
      scanLoopRef.current = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    // Give the camera ~800ms to warm up before the first shot
    scanLoopRef.current = setTimeout(tick, 800);

    return () => {
      stopped = true;
      if (scanLoopRef.current) {
        clearTimeout(scanLoopRef.current);
        scanLoopRef.current = null;
      }
    };
  }, [visible, permission?.granted, runOneScan]);

  // ── Render ──────────────────────────────────────────────────────────

  const renderBody = () => {
    if (!CAMERA_AVAILABLE) {
      return (
        <View style={styles.fallback}>
          <Ionicons name="camera-outline" size={48} color="#fff" />
          <Text style={styles.fallbackTitle}>Kamera kullanılamıyor</Text>
          <Text style={styles.fallbackText}>
            Kamera modülü bu yapıda yok. MRZ bilgilerini elle girebilirsiniz.
          </Text>
        </View>
      );
    }

    if (!OCR_AVAILABLE) {
      return (
        <View style={styles.fallback}>
          <Ionicons name="document-text-outline" size={48} color="#fff" />
          <Text style={styles.fallbackTitle}>OCR yüklü değil</Text>
          <Text style={styles.fallbackText}>
            Otomatik tarama için uygulamayı EAS/prebuild ile yeniden derleyin.
            Şimdilik MRZ bilgilerini elle girebilirsiniz.
          </Text>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.fallback}>
          <ActivityIndicator color="#fff" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.fallback}>
          <Ionicons name="lock-closed-outline" size={40} color="#fff" />
          <Text style={styles.fallbackTitle}>Kamera izni gerekli</Text>
          <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
            <Text style={styles.permButtonText}>İzin Ver</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />
        {/* Guidance overlay */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.mrzZone}>
              <Text style={styles.mrzZoneLabel}>MRZ ALANI</Text>
            </View>
          </View>
        </View>

        {/* Status banner */}
        <View style={[styles.statusBar, isError && styles.statusBarError]}>
          {busy && <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />}
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* Manual capture button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.manualButton}
            onPress={runOneScan}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="scan-outline" size={26} color="#fff" />
            )}
          </TouchableOpacity>
          <Text style={styles.hintBottom}>Otomatik tarıyor — dokunarak da deneyebilirsiniz</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MRZ Tarama</Text>
          <TouchableOpacity onPress={onClose} style={styles.headerClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        {renderBody()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12,
    backgroundColor: '#000',
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: '#fff',
  },
  headerClose: { padding: 6 },

  cameraWrap: { flex: 1, backgroundColor: '#000' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: '85%',
    aspectRatio: 1.58, // ID-1 card aspect ratio
    borderRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },

  mrzZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '8%',
    height: '30%',
    borderWidth: 2,
    borderColor: 'rgba(200,150,62,0.9)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(200,150,62,0.12)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  mrzZoneLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
  },

  statusBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  statusBarError: {
    backgroundColor: 'rgba(185, 28, 28, 0.75)',
  },
  statusText: {
    color: '#fff',
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    flex: 1,
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
  },
  manualButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  hintBottom: {
    color: '#fff',
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  fallbackTitle: {
    color: '#fff',
    fontFamily: fonts.headingMedium,
    fontSize: 16,
  },
  fallbackText: {
    color: '#ddd',
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  permButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: 8,
  },
  permButtonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
});
