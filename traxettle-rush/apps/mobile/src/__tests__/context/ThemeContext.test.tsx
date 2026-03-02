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
    await AsyncStorage.setItem('@traxettle_theme', 'forest');

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
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@traxettle_theme', 'midnight');
  });

  it('default context setThemeName is a no-op', () => {
    const DefaultProbe = () => {
      captured = useTheme();
      return null;
    };

    let defaultRenderer: ReactTestRenderer;
    act(() => {
      defaultRenderer = create(<DefaultProbe />);
    });

    // Should not throw; it's the default no-op
    expect(() => captured?.setThemeName('dark')).not.toThrow();
    expect(captured?.themeName).toBe('light');

    act(() => {
      defaultRenderer.unmount();
    });
  });

  it('handles AsyncStorage.getItem error gracefully in useEffect', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage read fail'));

    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });

    await flush();

    // Should fall back to default light theme
    expect(captured?.themeName).toBe('light');
  });

  it('handles AsyncStorage.setItem error gracefully in setThemeName', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage write fail'));

    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
    });

    await flush();

    // Should not throw, just swallow the error
    await act(async () => {
      captured?.setThemeName('ocean');
    });

    expect(captured?.themeName).toBe('ocean');
  });
});
