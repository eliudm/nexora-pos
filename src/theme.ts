import { MD3DarkTheme } from 'react-native-paper';

export const paperTheme = {
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
    error: '#ff4d4d',
    outline: '#262635',
    onSurface: '#e8e8f2',
    onBackground: '#e8e8f2',
  },
};

export const brand = {
  primary: '#1db8a0',
  secondary: '#6f67ff',
  gradientStart: '#6f67ff',
  gradientEnd: '#1db8a0',
  textDark: '#e8e8f2',
  textMuted: '#8888aa',
  danger: '#ff4d4d',
  warning: '#f59e0b',
  success: '#22c55e',
  surface: '#16161f',
  surfaceElevated: '#1e1e2a',
  border: '#262635',
  bg: '#0d0d14',
};
