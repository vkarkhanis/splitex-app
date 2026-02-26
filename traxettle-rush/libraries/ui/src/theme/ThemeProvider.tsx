'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as StyledThemeProvider, createGlobalStyle } from 'styled-components';
import type { TraxettleThemeName, TraxettleTheme } from './themes';
import { themes } from './themes';

function readCookieTheme(): TraxettleThemeName | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )traxettle\.theme=([^;]+)/);
  if (!m) return null;
  const value = decodeURIComponent(m[1]) as TraxettleThemeName;
  return themes[value] ? value : null;
}

type ThemeContextValue = {
  themeName: TraxettleThemeName;
  setThemeName: (name: TraxettleThemeName) => void;
  theme: TraxettleTheme;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTraxettleTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTraxettleTheme must be used within TraxettleThemeProvider');
  return ctx;
}

const GlobalStyle = createGlobalStyle<{ $t: TraxettleTheme }>`
  :root {
    color-scheme: ${(p) => (p.$t.name === 'light' ? 'light' : 'dark')};
  }

  html {
    scroll-behavior: smooth;
  }

  html, body {
    padding: 0;
    margin: 0;
    background: ${(p) => p.$t.colors.background};
    color: ${(p) => p.$t.colors.text};
    font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  ::selection {
    background: ${(p) => p.$t.colors.primary};
    color: #fff;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: ${(p) => p.$t.colors.border};
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${(p) => p.$t.colors.borderHover};
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

export function TraxettleThemeProvider(props: { children: React.ReactNode; defaultTheme?: TraxettleThemeName }) {
  const { children, defaultTheme = 'light' } = props;
  const [themeName, setThemeName] = useState<TraxettleThemeName>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const fromCookie = readCookieTheme();
    if (fromCookie) return fromCookie;
    const saved = localStorage.getItem('traxettle.theme') as TraxettleThemeName | null;
    if (saved && themes[saved]) return saved;
    return defaultTheme;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('traxettle.theme', themeName);
      document.cookie = `traxettle.theme=${encodeURIComponent(themeName)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [themeName]);

  const theme = useMemo(() => themes[themeName], [themeName]);

  const value: ThemeContextValue = useMemo(
    () => ({ themeName, setThemeName, theme }),
    [themeName, theme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <StyledThemeProvider theme={theme}>
        <GlobalStyle $t={theme} />
        {children}
      </StyledThemeProvider>
    </ThemeContext.Provider>
  );
}
