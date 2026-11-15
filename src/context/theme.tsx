import React, { createContext, useContext, useState, useEffect } from 'react';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { getSetting, setSetting } from '../db/settings';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  danger: string;
  warning: string;
  success: string;
}

export const darkColors: ThemeColors = {
  bg: '#0d0d14',
  surface: '#16161f',
  elevated: '#1e1e2a',
  border: '#2a2a3d',
  text: '#e8e8f2',
  muted: '#9090b0',
  accent: '#1db8a0',
  accent2: '#6f67ff',
  danger: '#ff5555',
  warning: '#f59e0b',
  success: '#22c55e',
};

export const lightColors: ThemeColors = {
  bg: '#f4f6fb',
  surface: '#ffffff',
  elevated: '#eef1f8',
  border: '#dde1ee',
  text: '#111827',
  muted: '#6b7280',
  accent: '#0ea894',
  accent2: '#5b54f0',
  danger: '#dc2626',
  warning: '#d97706',
  success: '#16a34a',
};

export const darkPaperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#1db8a0',
    onPrimary: '#ffffff',
    primaryContainer: '#0d3d36',
    secondary: '#6f67ff',
    onSecondary: '#ffffff',
    secondaryContainer: '#1e1c3a',
    background: '#0d0d14',
    surface: '#16161f',
    surfaceVariant: '#1e1e2a',
    error: '#ff5555',
    outline: '#2a2a3d',
    onSurface: '#e8e8f2',
    onBackground: '#e8e8f2',
    onSurfaceVariant: '#9090b0',
  },
};

export const lightPaperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#0ea894',
    onPrimary: '#ffffff',
    primaryContainer: '#ccf7f0',
    secondary: '#5b54f0',
    onSecondary: '#ffffff',
    secondaryContainer: '#e8e7ff',
    background: '#f4f6fb',
    surface: '#ffffff',
    surfaceVariant: '#eef1f8',
    error: '#dc2626',
    outline: '#dde1ee',
    onSurface: '#111827',
    onBackground: '#111827',
    onSurfaceVariant: '#6b7280',
  },
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  paperTheme: typeof darkPaperTheme;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkColors,
  paperTheme: darkPaperTheme,
  toggleTheme: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    getSetting('theme_mode').then((v) => {
      if (v === 'light' || v === 'dark') setMode(v);
    });
  }, []);

  const toggleTheme = async () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    await setSetting('theme_mode', next);
  };

  return (
    <ThemeContext.Provider value={{
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      paperTheme: mode === 'dark' ? darkPaperTheme : lightPaperTheme,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
