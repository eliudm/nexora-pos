import React, { useEffect, useState } from 'react';
import { View, Modal, StyleSheet, Pressable } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Stack, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { subscriptionService } from '../../src/services/subscription';
import { getSetting } from '../../src/db/settings';
import { useTheme } from '../../src/context/theme';

export default function AppLayout() {
  const { colors: C } = useTheme();
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    initAccess();
  }, []);

  const initAccess = async () => {
    // Record first launch (no-op on subsequent launches)
    await subscriptionService.startTrial();

    const trial = await subscriptionService.getTrialInfo();
    if (!trial.expired) return; // still in trial, no paywall

    // Trial expired — check if they have a paid subscription
    const phone = await getSetting('phone');
    if (phone) {
      const sub = await subscriptionService.isActive(phone);
      if (sub.active) return; // paid subscriber, no paywall
    }

    // Show paywall unless dismissed for today
    const dismissed = await subscriptionService.isPaywallDismissed();
    if (!dismissed) setPaywallVisible(true);
  };

  const handleSubscribe = () => {
    setPaywallVisible(false);
    router.push('/(app)/subscription');
  };

  const handleDismiss = async () => {
    await subscriptionService.dismissPaywall();
    setPaywallVisible(false);
  };

  return (
    <View style={{ flex: 1 }}>
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

      <Modal visible={paywallVisible} animationType="slide" transparent={false} statusBarTranslucent>
        <View style={[styles.paywall, { backgroundColor: C.bg }]}>
          <View style={styles.paywallInner}>
            <View style={[styles.iconWrap, { backgroundColor: C.accent + '18' }]}>
              <MaterialCommunityIcons name="star-circle" size={56} color={C.accent} />
            </View>

            <Text style={[styles.paywallTitle, { color: C.text }]}>Your Free Trial Has Ended</Text>
            <Text style={[styles.paywallSub, { color: C.muted }]}>
              Subscribe to continue using Nexora POS and keep all your data.
            </Text>

            <View style={[styles.featureBox, { backgroundColor: C.elevated, borderColor: C.border }]}>
              {[
                'Unlimited products & sales',
                'Smart Insights & reports',
                'Customer accounts & layaway',
                'Receipt printing & export',
                'Full offline access',
              ].map(f => (
                <View key={f} style={styles.featureRow}>
                  <MaterialCommunityIcons name="check-circle-outline" size={16} color={C.accent} />
                  <Text style={[styles.featureText, { color: C.text }]}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.priceRow, { borderColor: C.accent + '44' }]}>
              <Text style={[styles.price, { color: C.text }]}>KES 600</Text>
              <Text style={[styles.pricePer, { color: C.muted }]}> / month</Text>
            </View>

            <Button
              mode="contained"
              onPress={handleSubscribe}
              buttonColor={C.accent}
              style={styles.subscribeBtn}
              contentStyle={{ height: 52 }}
              labelStyle={{ fontSize: 16, fontWeight: '800' }}
              icon="star-circle"
            >
              Subscribe Now
            </Button>

            <Pressable onPress={handleDismiss} style={styles.laterBtn}>
              <Text style={[styles.laterText, { color: C.muted }]}>Continue for today</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  paywall: { flex: 1, justifyContent: 'center', padding: 24 },
  paywallInner: { alignItems: 'center', maxWidth: 400, alignSelf: 'center', width: '100%' },
  iconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  paywallTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  paywallSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 8 },
  featureBox: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 16, gap: 10, marginBottom: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', borderWidth: 2, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 20 },
  price: { fontSize: 32, fontWeight: '900' },
  pricePer: { fontSize: 16 },
  subscribeBtn: { width: '100%', borderRadius: 12, marginBottom: 12 },
  laterBtn: { paddingVertical: 10 },
  laterText: { fontSize: 14, textDecorationLine: 'underline' },
});
