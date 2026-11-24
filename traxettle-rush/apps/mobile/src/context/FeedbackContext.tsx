import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
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

/** The toasts on screen now, for <ModalToasts />. */
const ToastListContext = createContext<ToastItem[]>([]);

/** Test id for a confirmation dialog's button, from its label: "Settle Now" -> "confirm-button-settle-now". */
export function confirmButtonTestId(text: string): string {
  return `confirm-button-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function inferToastTone(title: string): ToastTone {
  const t = (title || '').toLowerCase();
  if (t.includes('error') || t.includes('failed') || t.includes('missing')) return 'error';
  if (t.includes('success') || t.includes('created') || t.includes('restored') || t.includes('approved')) return 'success';
  return 'info';
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
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

  return (
    <FeedbackContext.Provider value={{ pushToast }}>
      <ToastListContext.Provider value={toasts}>
        {children}

        {/*
          Toasts must not block the screen beneath them. They used to sit in a full-screen Modal,
          and for the ~3 seconds a toast showed every tap was ignored.
          - iOS: FullWindowOverlay draws above everything, sheets included, and lets taps through
            wherever there's no toast. It attaches to the window when it mounts, so it's mounted
            only while a toast shows: that keeps it above a sheet opened earlier.
          - Android: a layer over the app. An open sheet (a Modal) is a separate window above it,
            so sheets render <ModalToasts /> to show toasts on top of themselves.
        */}
        {toasts.length > 0 && (Platform.OS === 'ios'
          ? <FullWindowOverlay><ToastLayer toasts={toasts} /></FullWindowOverlay>
          : <ToastLayer toasts={toasts} />)}

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
                      testID={confirmButtonTestId(btn.text)}
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
      </ToastListContext.Provider>
    </FeedbackContext.Provider>
  );
}

/** The toasts, in a layer that lets taps through to whatever is under it. */
function ToastLayer({ toasts }: { toasts: ToastItem[] }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const toneStyles = useMemo(
    () => ({
      info: { border: c.info, text: c.text },
      success: { border: c.success, text: c.text },
      error: { border: c.error, text: c.text },
    }),
    [c]
  );
  return (
    <View pointerEvents="box-none" style={styles.toastOverlay}>
      <View
        pointerEvents="box-none"
        style={[
          styles.toastHost,
          { top: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 8 },
        ]}
      >
        {toasts.map((toast) => (
          <View
            key={toast.id}
            testID="app-toast"
            style={[styles.toastCard, { borderLeftColor: toneStyles[toast.tone].border, backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Text style={[styles.toastTitle, { color: toneStyles[toast.tone].text }]} numberOfLines={2}>{toast.title}</Text>
            {!!toast.message && (
              <Text style={[styles.toastMsg, { color: c.textSecondary }]} numberOfLines={3}>
                {toast.message}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Put this last inside a sheet (a Modal) where an action can show a toast. On Android a Modal is a
 * separate window above the app's toast layer, so without this its toasts would be hidden behind
 * the sheet. Draws nothing on iOS, where toasts already show above sheets.
 */
export function ModalToasts() {
  const toasts = useContext(ToastListContext);
  if (Platform.OS === 'ios' || toasts.length === 0) return null;
  return <ToastLayer toasts={toasts} />;
}

export function useFeedback() {
  return useContext(FeedbackContext);
}

const styles = StyleSheet.create({
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999, // Android draws by elevation: keep the layer above the screens
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
