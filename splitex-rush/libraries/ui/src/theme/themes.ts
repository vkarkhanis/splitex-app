export type SplitexThemeName = 'light' | 'dark' | 'ocean' | 'forest' | 'midnight';

export type SplitexTheme = {
  name: SplitexThemeName;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    border: string;
    muted: string;
    accent: string;
  };
};

export const themes: Record<SplitexThemeName, SplitexTheme> = {
  light: {
    name: 'light',
    colors: {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#1f2937',
      border: '#e2e8f0',
      muted: '#475569',
      accent: '#0ea5e9',
    },
  },
  dark: {
    name: 'dark',
    colors: {
      primary: '#60a5fa',
      secondary: '#818cf8',
      background: '#0f172a',
      surface: '#111c33',
      text: '#e5e7eb',
      border: '#22304e',
      muted: '#94a3b8',
      accent: '#38bdf8',
    },
  },
  ocean: {
    name: 'ocean',
    colors: {
      primary: '#0ea5e9',
      secondary: '#06b6d4',
      background: '#03111c',
      surface: '#062033',
      text: '#e0f2fe',
      border: '#0b3755',
      muted: '#7dd3fc',
      accent: '#22d3ee',
    },
  },
  forest: {
    name: 'forest',
    colors: {
      primary: '#10b981',
      secondary: '#84cc16',
      background: '#06130c',
      surface: '#0c2315',
      text: '#ecfdf5',
      border: '#194c2e',
      muted: '#a7f3d0',
      accent: '#34d399',
    },
  },
  midnight: {
    name: 'midnight',
    colors: {
      primary: '#8b5cf6',
      secondary: '#6366f1',
      background: '#070816',
      surface: '#0e1027',
      text: '#ede9fe',
      border: '#24264a',
      muted: '#c4b5fd',
      accent: '#a855f7',
    },
  },
};
