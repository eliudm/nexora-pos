import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { brand } from '../theme';

export const AppSplashScreen: React.FC = () => (
  <LinearGradient colors={[brand.gradientStart, brand.gradientEnd]} style={styles.container}>
    <Text variant="headlineMedium" style={styles.title}>Nexora POS</Text>
    <ActivityIndicator color="#fff" size="large" style={{ marginTop: 32 }} />
  </LinearGradient>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontWeight: '700', letterSpacing: 1 },
});
