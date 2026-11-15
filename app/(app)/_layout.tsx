import React from 'react';
import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="purchase-orders" />
      <Stack.Screen name="vendor-bills" />
      <Stack.Screen name="suppliers" />
      <Stack.Screen name="expenses" />
      <Stack.Screen name="stocktake" />
      <Stack.Screen name="quotations" />
      <Stack.Screen name="layaway" />
      <Stack.Screen name="help" />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}
