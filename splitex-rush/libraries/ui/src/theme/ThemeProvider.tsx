'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as StyledThemeProvider, createGlobalStyle } from 'styled-components';
import type { SplitexThemeName, SplitexTheme } from './themes';
import { themes } from './themes';

function readCookieTheme(): SplitexThemeName | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )splitex\.theme=([^;]+)/);
  if (!m) return null;
  const value = decodeURIComponent(m[1]) as SplitexThemeName;
  return themes[value] ? value : null;
}

type ThemeContextValue = {
  themeName: SplitexThemeName;
  setThemeName: (name: SplitexThemeName) => void;
  theme: SplitexTheme;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useSplitexTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useSplitexTheme must be used within SplitexThemeProvider');
  return ctx;
}

const GlobalStyle = createGlobalStyle<{ $t: SplitexTheme }>`
  :root {
    color-scheme: ${(p) => (p.$t.name === 'light' ? 'light' : 'dark')};
  }

  html, body {
    padding: 0;
    margin: 0;
    background: ${(p) => p.$t.colors.background};
    color: ${(p) => p.$t.colors.text};
    font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
`;

export function SplitexThemeProvider(props: { children: React.ReactNode; defaultTheme?: SplitexThemeName }) {
  const { children, defaultTheme = 'light' } = props;
  const [themeName, setThemeName] = useState<SplitexThemeName>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const fromCookie = readCookieTheme();
    if (fromCookie) return fromCookie;
    const saved = localStorage.getItem('splitex.theme') as SplitexThemeName | null;
    if (saved && themes[saved]) return saved;
    return defaultTheme;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('splitex.theme', themeName);
      document.cookie = `splitex.theme=${encodeURIComponent(themeName)}; path=/; max-age=31536000; samesite=lax`;
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
