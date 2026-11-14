import { MD3LightTheme } from 'react-native-paper';

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1db8a0',
    onPrimary: '#ffffff',
    primaryContainer: '#d6f3ee',
    secondary: '#6f67ff',
    onSecondary: '#ffffff',
    secondaryContainer: '#e6e4ff',
    background: '#f5f5f5',
    surface: '#ffffff',
    surfaceVariant: '#f0eef7',
    error: '#d4380d',
    outline: '#d9d4e8',
  },
};

export const brand = {
  primary: '#1db8a0',
  secondary: '#6f67ff',
  gradientStart: '#6f67ff',
  gradientEnd: '#1db8a0',
  textDark: '#2f2749',
  textMuted: '#6b6485',
  danger: '#d4380d',
  warning: '#fa8c16',
  success: '#52c41a',
  surface: '#ffffff',
  bg: '#f5f5f5',
};
