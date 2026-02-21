import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ThemeProvider, useTheme } from '../../context/ThemeContext';

describe('ThemeContext', () => {
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  let captured: ReturnType<typeof useTheme> | null = null;

  const Probe = () => {
    captured = useTheme();
    return null;
  };

  let renderer: ReactTestRenderer;

  beforeEach(() => {
    captured = null;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (!renderer) return;
    await act(async () => {
      renderer.unmount();
    });
  });

  it('defaults to light theme when storage has no value', async () => {
    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });

    await flush();

    expect(captured?.themeName).toBe('light');
    expect(captured?.theme.isDark).toBe(false);
  });

  it('loads saved theme name from AsyncStorage', async () => {
    await AsyncStorage.setItem('@splitex_theme', 'forest');

    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });

    await flush();

    expect(captured?.themeName).toBe('forest');
    expect(captured?.theme.isDark).toBe(true);
  });

  it('persists theme updates', async () => {
    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });

    await flush();

    await act(async () => {
      captured?.setThemeName('midnight');
    });

    expect(captured?.themeName).toBe('midnight');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@splitex_theme', 'midnight');
  });
});
