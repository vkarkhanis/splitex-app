import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Theme Types ──

export type ThemeName = 'light' | 'dark' | 'ocean' | 'forest' | 'midnight';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
  white: string;
  black: string;
}

export interface TraxettleTheme {
  name: ThemeName;
  colors: ThemeColors;
  isDark: boolean;
}

// ── Theme Definitions (matching web themes) ──

const themes: Record<ThemeName, TraxettleTheme> = {
  light: {
    name: 'light',
    isDark: false,
    colors: {
      primary: '#3b82f6',
      primaryDark: '#2563eb',
      secondary: '#8b5cf6',
      accent: '#0ea5e9',
      background: '#f8fafc',
      surface: '#ffffff',
      surfaceAlt: '#f1f5f9',
      text: '#0f172a',
      textSecondary: '#475569',
      muted: '#64748b',
      border: '#e2e8f0',
      error: '#ef4444',
      errorBg: 'rgba(239,68,68,0.08)',
      success: '#22c55e',
      successBg: 'rgba(34,197,94,0.08)',
      warning: '#f59e0b',
      warningBg: 'rgba(245,158,11,0.08)',
      info: '#3b82f6',
      infoBg: 'rgba(59,130,246,0.08)',
      white: '#ffffff',
      black: '#000000',
    },
  },
  dark: {
    name: 'dark',
    isDark: true,
    colors: {
      primary: '#60a5fa',
      primaryDark: '#93bbfd',
      secondary: '#818cf8',
      accent: '#38bdf8',
      background: '#0a0f1e',
      surface: '#111827',
      surfaceAlt: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      muted: '#94a3b8',
      border: '#1e293b',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#60a5fa',
      infoBg: 'rgba(96,165,250,0.1)',
      white: '#ffffff',
      black: '#000000',
    },
  },
  ocean: {
    name: 'ocean',
    isDark: true,
    colors: {
      primary: '#0ea5e9',
      primaryDark: '#38bdf8',
      secondary: '#06b6d4',
      accent: '#22d3ee',
      background: '#020c14',
      surface: '#0a1929',
      surfaceAlt: '#0f2640',
      text: '#e0f2fe',
      textSecondary: '#7dd3fc',
      muted: '#7dd3fc',
      border: '#0c3553',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#38bdf8',
      infoBg: 'rgba(56,189,248,0.1)',
      white: '#ffffff',
      black: '#000000',
    },
  },
  forest: {
    name: 'forest',
    isDark: true,
    colors: {
      primary: '#10b981',
      primaryDark: '#34d399',
      secondary: '#84cc16',
      accent: '#34d399',
      background: '#040e08',
      surface: '#0a1f12',
      surfaceAlt: '#133a20',
      text: '#ecfdf5',
      textSecondary: '#a7f3d0',
      muted: '#a7f3d0',
      border: '#194c2e',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#34d399',
      infoBg: 'rgba(52,211,153,0.1)',
      white: '#ffffff',
      black: '#000000',
    },
  },
  midnight: {
    name: 'midnight',
    isDark: true,
    colors: {
      primary: '#8b5cf6',
      primaryDark: '#a78bfa',
      secondary: '#6366f1',
      accent: '#a855f7',
      background: '#050510',
      surface: '#0c0c20',
      surfaceAlt: '#161636',
      text: '#ede9fe',
      textSecondary: '#c4b5fd',
      muted: '#c4b5fd',
      border: '#24264a',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#a78bfa',
      infoBg: 'rgba(167,139,250,0.1)',
      white: '#ffffff',
      black: '#000000',
    },
  },
};

export const THEME_NAMES: { key: ThemeName; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'ocean', label: 'Ocean' },
  { key: 'forest', label: 'Forest' },
  { key: 'midnight', label: 'Midnight' },
];

// ── Context ──

interface ThemeContextValue {
  theme: TraxettleTheme;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.light,
  themeName: 'light',
  setThemeName: () => {},
});

const STORAGE_KEY = '@traxettle_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved && themes[saved as ThemeName]) {
        setThemeNameState(saved as ThemeName);
      }
    }).catch(() => {});
  }, []);

  const setThemeName = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  };

  const theme = useMemo(() => themes[themeName], [themeName]);

  const value = useMemo(() => ({ theme, themeName, setThemeName }), [theme, themeName]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
