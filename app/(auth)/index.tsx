import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Vibration } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getDb } from '../../src/db/database';
import { getSetting } from '../../src/db/settings';
import { brand } from '../../src/theme';

const PIN_LENGTH = 4;

export default function PinLoginScreen() {
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getSetting('business_name').then((n) => setBusinessName(n ?? 'Nexora POS'));
  }, []);

  const handlePress = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === PIN_LENGTH) verifyPin(next);
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const verifyPin = async (entered: string) => {
    setVerifying(true);
    try {
      const db = await getDb();
      const user = await db.getFirstAsync<{ id: number; name: string; role: string }>(
        "SELECT id, name, role FROM users WHERE pin_hash = ? AND is_active = 1",
        [entered],
      );
      if (user) {
        router.replace('/(app)');
      } else {
        Vibration.vibrate(400);
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    } finally {
      setVerifying(false);
    }
  };

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <LinearGradient colors={[brand.gradientStart, brand.gradientEnd]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.bizName}>{businessName}</Text>
          <Text style={styles.subtitle}>Enter your PIN to continue</Text>

          <View style={styles.dots}>
            {dots.map((filled, i) => (
              <View key={i} style={[styles.dot, filled && styles.dotFilled]} />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.keypad}>
            {keys.map((row, ri) => (
              <View key={ri} style={styles.row}>
                {row.map((k, ki) => (
                  <Pressable
                    key={ki}
                    style={({ pressed }) => [styles.key, k === '' && styles.keyEmpty, pressed && k && styles.keyPressed]}
                    onPress={() => {
                      if (k === 'del') handleDelete();
                      else if (k) handlePress(k);
                    }}
                    disabled={verifying}
                  >
                    {k === 'del' ? (
                      <IconButton icon="backspace-outline" iconColor="#fff" size={24} />
                    ) : (
                      <Text style={styles.keyText}>{k}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  bizName: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 40 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#fff' },
  error: { color: '#ffcdd2', fontSize: 14, marginBottom: 16 },
  keypad: { width: '100%', maxWidth: 280, marginTop: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  key: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  keyEmpty: { backgroundColor: 'transparent' },
  keyPressed: { backgroundColor: 'rgba(255,255,255,0.4)' },
  keyText: { color: '#fff', fontSize: 24, fontWeight: '600' },
});
