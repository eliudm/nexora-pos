import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { router } from 'expo-router';
import { brand } from '../src/theme';

export default function SubscriptionScreen() {
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;
      setPkg(monthly ?? null);
    } catch {
      // RC not configured in dev
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!pkg) {
      Alert.alert('Error', 'No subscription package available. Please try again later.');
      return;
    }
    setPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        router.replace('/setup');
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', e.message ?? 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const info = await Purchases.restorePurchases();
      if (Object.keys(info.entitlements.active).length > 0) {
        router.replace('/setup');
      } else {
        Alert.alert('No Subscription Found', 'No active subscription found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message ?? 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const features = [
    'Unlimited sales transactions',
    'Product & inventory management',
    'Customer accounts & credit',
    'Cash & M-Pesa payments',
    'Daily/weekly/monthly reports',
    'Receipt printing support',
    'Works 100% offline',
    'eTIMS KRA compliance ready',
  ];

  return (
    <LinearGradient colors={[brand.gradientStart, brand.gradientEnd]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.appName}>Nexora POS</Text>
          <Text style={styles.tagline}>Professional Point of Sale for Kenya</Text>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="headlineSmall" style={styles.planTitle}>Monthly Subscription</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currency}>KES</Text>
                <Text style={styles.price}>600</Text>
                <Text style={styles.period}>/month</Text>
              </View>

              <View style={styles.divider} />

              {features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </Card.Content>
          </Card>

          {loading ? (
            <ActivityIndicator color="#fff" size="large" style={{ marginTop: 32 }} />
          ) : (
            <>
              <Button
                mode="contained"
                onPress={handleSubscribe}
                loading={purchasing}
                disabled={purchasing}
                style={styles.subscribeBtn}
                contentStyle={styles.btnContent}
                labelStyle={styles.btnLabel}
              >
                Subscribe — KES 600/month
              </Button>

              <Button
                mode="text"
                onPress={handleRestore}
                disabled={purchasing}
                textColor="#fff"
                style={{ marginTop: 8 }}
              >
                Restore Purchase
              </Button>

              <Text style={styles.legal}>
                Payment processed securely via Google Play. Cancel anytime.
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  appName: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center', marginTop: 24 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', marginTop: 4, marginBottom: 32 },
  card: { borderRadius: 16, elevation: 4 },
  planTitle: { textAlign: 'center', fontWeight: '700', color: brand.primary, marginBottom: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 16 },
  currency: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 6, marginRight: 2 },
  price: { fontSize: 52, fontWeight: '800', color: '#111', lineHeight: 60 },
  period: { fontSize: 16, color: '#666', marginBottom: 10, marginLeft: 4 },
  divider: { height: 1, backgroundColor: '#eee', marginBottom: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkmark: { color: brand.primary, fontSize: 18, fontWeight: '700', marginRight: 10 },
  featureText: { fontSize: 15, color: '#333', flex: 1 },
  subscribeBtn: { marginTop: 32, borderRadius: 12, backgroundColor: '#fff' },
  btnContent: { height: 52 },
  btnLabel: { color: brand.primary, fontSize: 16, fontWeight: '700' },
  legal: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
