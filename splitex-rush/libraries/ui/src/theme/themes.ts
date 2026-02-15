export type SplitexThemeName = 'light' | 'dark' | 'ocean' | 'forest' | 'midnight';

export type SplitexTheme = {
  name: SplitexThemeName;
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    background: string;
    surface: string;
    surfaceHover: string;
    text: string;
    textSecondary: string;
    border: string;
    borderHover: string;
    muted: string;
    accent: string;
    error: string;
    errorBg: string;
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    info: string;
    infoBg: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    glow: string;
  };
  radii: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
};

export const themes: Record<SplitexThemeName, SplitexTheme> = {
  light: {
    name: 'light',
    colors: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      secondary: '#8b5cf6',
      background: '#f8fafc',
      surface: '#ffffff',
      surfaceHover: '#f1f5f9',
      text: '#0f172a',
      textSecondary: '#475569',
      border: '#e2e8f0',
      borderHover: '#cbd5e1',
      muted: '#64748b',
      accent: '#0ea5e9',
      error: '#ef4444',
      errorBg: 'rgba(239,68,68,0.08)',
      success: '#22c55e',
      successBg: 'rgba(34,197,94,0.08)',
      warning: '#f59e0b',
      warningBg: 'rgba(245,158,11,0.08)',
      info: '#3b82f6',
      infoBg: 'rgba(59,130,246,0.08)',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.05)',
      md: '0 4px 12px rgba(0,0,0,0.08)',
      lg: '0 12px 40px rgba(0,0,0,0.12)',
      xl: '0 24px 80px rgba(0,0,0,0.16)',
      glow: '0 0 20px rgba(59,130,246,0.15)',
    },
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
  },
  dark: {
    name: 'dark',
    colors: {
      primary: '#60a5fa',
      primaryHover: '#93bbfd',
      secondary: '#818cf8',
      background: '#0a0f1e',
      surface: '#111827',
      surfaceHover: '#1e293b',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#1e293b',
      borderHover: '#334155',
      muted: '#94a3b8',
      accent: '#38bdf8',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#60a5fa',
      infoBg: 'rgba(96,165,250,0.1)',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 4px 12px rgba(0,0,0,0.4)',
      lg: '0 12px 40px rgba(0,0,0,0.5)',
      xl: '0 24px 80px rgba(0,0,0,0.6)',
      glow: '0 0 20px rgba(96,165,250,0.2)',
    },
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
  },
  ocean: {
    name: 'ocean',
    colors: {
      primary: '#0ea5e9',
      primaryHover: '#38bdf8',
      secondary: '#06b6d4',
      background: '#020c14',
      surface: '#0a1929',
      surfaceHover: '#0f2640',
      text: '#e0f2fe',
      textSecondary: '#7dd3fc',
      border: '#0c3553',
      borderHover: '#155e8a',
      muted: '#7dd3fc',
      accent: '#22d3ee',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#38bdf8',
      infoBg: 'rgba(56,189,248,0.1)',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 4px 12px rgba(0,0,0,0.4)',
      lg: '0 12px 40px rgba(0,0,0,0.5)',
      xl: '0 24px 80px rgba(0,0,0,0.6)',
      glow: '0 0 20px rgba(14,165,233,0.2)',
    },
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
  },
  forest: {
    name: 'forest',
    colors: {
      primary: '#10b981',
      primaryHover: '#34d399',
      secondary: '#84cc16',
      background: '#040e08',
      surface: '#0a1f12',
      surfaceHover: '#133a20',
      text: '#ecfdf5',
      textSecondary: '#a7f3d0',
      border: '#194c2e',
      borderHover: '#22714a',
      muted: '#a7f3d0',
      accent: '#34d399',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#34d399',
      infoBg: 'rgba(52,211,153,0.1)',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 4px 12px rgba(0,0,0,0.4)',
      lg: '0 12px 40px rgba(0,0,0,0.5)',
      xl: '0 24px 80px rgba(0,0,0,0.6)',
      glow: '0 0 20px rgba(16,185,129,0.2)',
    },
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
  },
  midnight: {
    name: 'midnight',
    colors: {
      primary: '#8b5cf6',
      primaryHover: '#a78bfa',
      secondary: '#6366f1',
      background: '#050510',
      surface: '#0c0c20',
      surfaceHover: '#161636',
      text: '#ede9fe',
      textSecondary: '#c4b5fd',
      border: '#24264a',
      borderHover: '#3b3d6e',
      muted: '#c4b5fd',
      accent: '#a855f7',
      error: '#f87171',
      errorBg: 'rgba(248,113,113,0.1)',
      success: '#4ade80',
      successBg: 'rgba(74,222,128,0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251,191,36,0.1)',
      info: '#a78bfa',
      infoBg: 'rgba(167,139,250,0.1)',
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 4px 12px rgba(0,0,0,0.4)',
      lg: '0 12px 40px rgba(0,0,0,0.5)',
      xl: '0 24px 80px rgba(0,0,0,0.6)',
      glow: '0 0 20px rgba(139,92,246,0.2)',
    },
    radii: {
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      full: '9999px',
    },
  },
};
