/**
 * FeedbackContext replaces Alert.alert: a one-button alert becomes a toast, an alert with choices
 * becomes a dialog. Toasts must not block taps on the screen beneath them (they used to sit in a
 * full-screen Modal, which ignored every tap for ~3 seconds).
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    Modal: host('Modal'),
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    StatusBar: { currentHeight: 24 },
    StyleSheet: { create: (s: any) => s, absoluteFillObject: {} },
  };
});
jest.mock('react-native-screens', () => {
  const R = require('react');
  return { FullWindowOverlay: (props: any) => R.createElement('FullWindowOverlay', props, props.children) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }),
}));

import { Alert, Platform } from 'react-native';
import { FeedbackProvider, ModalToasts, confirmButtonTestId } from '../../context/FeedbackContext';

const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : text(c))).join('');
const toasts = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.testID === 'app-toast' && typeof n.type === 'string');
const within = (r: ReactTestRenderer, type: string) => r.root.findAll((n) => n.type === type);

describe('FeedbackContext', () => {
  let renderer: ReactTestRenderer;

  // `inSheet` stands for a screen's open sheet, which renders <ModalToasts /> last.
  const render = async (inSheet: React.ReactNode = <></>) => {
    await act(async () => {
      renderer = create(<FeedbackProvider>{inSheet}</FeedbackProvider>);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    (Platform as any).OS = 'ios';
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.useRealTimers();
  });

  it('names dialog buttons from their labels', () => {
    expect(confirmButtonTestId('Settle Now')).toBe('confirm-button-settle-now');
    expect(confirmButtonTestId('Not paid (write off)')).toBe('confirm-button-not-paid-write-off');
    expect(confirmButtonTestId('OK')).toBe('confirm-button-ok');
  });

  describe('on iOS', () => {
    it('shows a one-button alert as a toast in a window overlay, not a modal', async () => {
      await render();
      expect(within(renderer, 'FullWindowOverlay')).toHaveLength(0);

      await act(async () => Alert.alert('Success', 'Switched to PRO tier.'));

      const overlay = within(renderer, 'FullWindowOverlay');
      expect(overlay).toHaveLength(1);
      expect(toasts(renderer)).toHaveLength(1);
      expect(text(toasts(renderer)[0])).toBe('SuccessSwitched to PRO tier.');
      // No Modal holds the toast: a full-screen Modal is what blocked taps.
      within(renderer, 'Modal').forEach((m) => expect(m.findAll((n) => n.props.testID === 'app-toast')).toHaveLength(0));
      // The layer lets taps through wherever there's no toast.
      expect(overlay[0].findAll((n) => n.props.pointerEvents === 'box-none').length).toBeGreaterThan(0);
    });

    it('removes the toast and the overlay after about 3 seconds', async () => {
      await render();
      await act(async () => Alert.alert('Recorded', 'Paid from the kitty.'));
      expect(toasts(renderer)).toHaveLength(1);

      await act(async () => jest.advanceTimersByTime(3300));

      expect(toasts(renderer)).toHaveLength(0);
      expect(within(renderer, 'FullWindowOverlay')).toHaveLength(0);
    });

    it('stacks up to four toasts', async () => {
      await render();
      await act(async () => {
        ['One', 'Two', 'Three', 'Four', 'Five'].forEach((t) => Alert.alert(t));
      });
      expect(toasts(renderer).map(text)).toEqual(['Two', 'Three', 'Four', 'Five']);
      expect(within(renderer, 'FullWindowOverlay')).toHaveLength(1);
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it('shows a toast in a layer over the app that lets taps through, not a modal', async () => {
      await render();
      await act(async () => Alert.alert('Error', 'Unable to reach server.'));

      expect(toasts(renderer)).toHaveLength(1);
      expect(within(renderer, 'FullWindowOverlay')).toHaveLength(0);
      within(renderer, 'Modal').forEach((m) => expect(m.findAll((n) => n.props.testID === 'app-toast')).toHaveLength(0));
      const layer = renderer.root.find((n) => (n.type as unknown) === 'View' && n.props.pointerEvents === 'box-none' && n.props.style?.elevation === 9999);
      expect(layer.findAll((n) => n.props.testID === 'app-toast' && typeof n.type === 'string')).toHaveLength(1);
    });

    it('also shows toasts inside an open sheet, which is a window above the app', async () => {
      await render(<ModalToasts />);
      expect(toasts(renderer)).toHaveLength(0);

      await act(async () => Alert.alert('Proof uploaded', 'Proof attached successfully.'));

      // Once over the app, once inside the sheet.
      expect(toasts(renderer)).toHaveLength(2);
      await act(async () => jest.advanceTimersByTime(3300));
      expect(toasts(renderer)).toHaveLength(0);
    });
  });

  it('draws nothing extra inside sheets on iOS', async () => {
    await render(<ModalToasts />);
    await act(async () => Alert.alert('Proof uploaded'));
    expect(toasts(renderer)).toHaveLength(1);
  });

  it('shows an alert with choices as a dialog whose buttons work', async () => {
    await render();
    const onClose = jest.fn();
    await act(async () =>
      Alert.alert('Close Event', 'Close this event?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Close', onPress: onClose }]),
    );

    const dialog = within(renderer, 'Modal').find((m) => m.props.visible && m.findAll((n) => n.props.testID === 'confirm-button-close').length);
    expect(dialog).toBeDefined();
    expect(toasts(renderer)).toHaveLength(0);

    await act(async () => renderer.root.find((n) => n.props.testID === 'confirm-button-close' && typeof n.type === 'string').props.onPress());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(within(renderer, 'Modal').filter((m) => m.props.visible)).toHaveLength(0);
  });
});
