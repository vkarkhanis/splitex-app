import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { fontSizes, radii, spacing } from '../theme';

type ToastTone = 'info' | 'success' | 'error';

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
};

type ConfirmButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type ConfirmState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ConfirmButton[];
};

interface FeedbackContextType {
  pushToast: (tone: ToastTone, title: string, message?: string) => void;
}

const FeedbackContext = createContext<FeedbackContextType>({
  pushToast: () => {},
});

function inferToastTone(title: string): ToastTone {
  const t = (title || '').toLowerCase();
  if (t.includes('error') || t.includes('failed') || t.includes('missing')) return 'error';
  if (t.includes('success') || t.includes('created') || t.includes('restored') || t.includes('approved')) return 'success';
  return 'info';
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });
  const toastTimers = useRef<Record<string, any>>({});

  const pushToast = (tone: ToastTone, title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, tone, title, message }].slice(-4));
    toastTimers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete toastTimers.current[id];
    }, 3200);
  };

  useEffect(() => {
    const original = Alert.alert;
    (Alert as any).alert = (
      title?: string,
      message?: string,
      buttons?: Array<{ text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>
    ) => {
      const normalizedButtons: ConfirmButton[] =
        Array.isArray(buttons) && buttons.length > 0
          ? buttons.map((b) => ({ text: b?.text || 'OK', onPress: b?.onPress, style: b?.style }))
          : [{ text: 'OK' }];
      const hasDecisionButtons =
        normalizedButtons.length > 1 ||
        normalizedButtons.some((b) => b.style === 'cancel' || b.style === 'destructive');

      if (hasDecisionButtons) {
        setConfirm({
          visible: true,
          title: title || 'Confirm Action',
          message: message || '',
          buttons: normalizedButtons,
        });
        return;
      }

      const tone = inferToastTone(title || '');
      pushToast(tone, title || 'Notice', message || undefined);
    };

    return () => {
      (Alert as any).alert = original;
      Object.values(toastTimers.current).forEach((t) => clearTimeout(t));
      toastTimers.current = {};
    };
  }, []);

  const toastToneStyles = useMemo(
    () => ({
      info: { border: c.info, bg: c.infoBg, text: c.text },
      success: { border: c.success, bg: c.successBg, text: c.text },
      error: { border: c.error, bg: c.errorBg, text: c.text },
    }),
    [c]
  );

  const toastLayer = (
    <View pointerEvents="box-none" style={styles.toastOverlay}>
      <View
        pointerEvents="box-none"
        style={[
          styles.toastHost,
          {
            top: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 8,
          },
        ]}
      >
        {toasts.map((toast) => {
          const tone = toastToneStyles[toast.tone];
          return (
            <View
              key={toast.id}
              style={[
                styles.toastCard,
                {
                  borderLeftColor: tone.border,
                  backgroundColor: c.surface,
                  borderColor: c.border,
                },
              ]}
            >
              <Text style={[styles.toastTitle, { color: tone.text }]} numberOfLines={2}>{toast.title}</Text>
              {!!toast.message && (
                <Text style={[styles.toastMsg, { color: c.textSecondary }]} numberOfLines={3}>
                  {toast.message}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
      <FeedbackContext.Provider value={{ pushToast }}>
      {children}

      {Platform.OS === 'android' ? (
        <Modal
          visible={toasts.length > 0}
          transparent
          statusBarTranslucent
          presentationStyle="fullScreen"
          animationType="fade"
        >
          {toastLayer}
        </Modal>
      ) : (
        toasts.length > 0 ? toastLayer : null
      )}

      <Modal visible={confirm.visible} transparent animationType="fade" onRequestClose={() => setConfirm((s) => ({ ...s, visible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>{confirm.title}</Text>
            {!!confirm.message && <Text style={[styles.modalMessage, { color: c.textSecondary }]}>{confirm.message}</Text>}
            <View style={styles.modalActions}>
              {confirm.buttons.map((btn, idx) => {
                const variant = btn.style === 'destructive'
                  ? { bg: c.errorBg, text: c.error, border: c.error + '50' }
                  : btn.style === 'cancel'
                    ? { bg: c.surfaceAlt, text: c.textSecondary, border: c.border }
                    : { bg: c.primary, text: c.white, border: c.primary };
                return (
                  <TouchableOpacity
                    key={`${btn.text}-${idx}`}
                    style={[styles.modalBtn, { backgroundColor: variant.bg, borderColor: variant.border }]}
                    onPress={() => {
                      setConfirm((s) => ({ ...s, visible: false }));
                      btn.onPress?.();
                    }}
                  >
                    <Text style={[styles.modalBtnText, { color: variant.text }]}>{btn.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}

const styles = StyleSheet.create({
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  toastHost: {
    position: 'absolute',
    left: 12,
    right: 12,
    gap: spacing.sm,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    opacity: 1,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastTitle: { fontSize: fontSizes.md, fontWeight: '700' },
  toastMsg: { fontSize: fontSizes.sm, marginTop: 4, lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.44)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalTitle: { fontSize: fontSizes.lg, fontWeight: '700', marginBottom: spacing.xs },
  modalMessage: { fontSize: fontSizes.sm, lineHeight: 20, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  modalBtn: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modalBtnText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
