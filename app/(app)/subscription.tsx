import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Linking, Alert } from 'react-native';
import { Text, Appbar, Card, Button, TextInput, Chip, ActivityIndicator, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { subscriptionService, type SubscriptionStatus } from '../../src/services/subscription';
import { getBusinessInfo } from '../../src/db/settings';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

type PayMethod = 'mpesa' | 'card' | 'bank';
type PayState = 'idle' | 'loading' | 'waiting' | 'success' | 'error';

const FEATURES = [
  'Unlimited products & sales',
  'Smart Insights engine',
  'Purchase orders & suppliers',
  'Customer accounts & layaway',
  'Expenses & stock tracking',
  'Receipt printing',
  'Quotations & vendor bills',
  'Priority support',
];

const BANK_DETAILS = {
  bank: 'Equity Bank',
  account: '0123456789',
  name: 'Nexora Technologies Ltd',
  paybill: '247247',
  accNo: '0712345678',
};

export default function SubscriptionScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [method, setMethod] = useState<PayMethod>('mpesa');
  const [payState, setPayState] = useState<PayState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentStatus, setCurrentStatus] = useState<SubscriptionStatus | null>(null);

  // M-Pesa fields
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaName, setMpesaName] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Card fields
  const [cardName, setCardName] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [cardPhone, setCardPhone] = useState('');

  const { data: bizInfo } = useQuery({
    queryKey: ['biz-info'],
    queryFn: getBusinessInfo,
  });

  // Pre-fill name/phone from business settings
  useEffect(() => {
    if (bizInfo) {
      if (bizInfo.name && !mpesaName) setMpesaName(bizInfo.name);
      if (bizInfo.phone && !mpesaPhone) setMpesaPhone(bizInfo.phone);
      if (bizInfo.phone && !cardPhone) setCardPhone(bizInfo.phone);
    }
  }, [bizInfo]);

  // Check current status on mount
  useEffect(() => {
    if (bizInfo?.phone) {
      subscriptionService.checkStatus(bizInfo.phone).then(setCurrentStatus).catch(() => {});
    }
  }, [bizInfo?.phone]);

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  const handleMpesaPay = async () => {
    const phone = mpesaPhone.trim();
    const name = mpesaName.trim();
    if (!phone) { Alert.alert('Required', 'Enter your M-Pesa phone number.'); return; }
    if (!name) { Alert.alert('Required', 'Enter your name.'); return; }

    setPayState('loading');
    setErrorMsg('');
    try {
      await subscriptionService.initiateMpesa(phone, name);
      setPayState('waiting');
      startPolling(phone);
    } catch (e: any) {
      setPayState('error');
      setErrorMsg(e?.response?.data?.error ?? 'Could not connect. Check your internet and try again.');
    }
  };

  const handleCardPay = async () => {
    const name = cardName.trim();
    const email = cardEmail.trim();
    if (!name) { Alert.alert('Required', 'Enter your name.'); return; }
    if (!email || !email.includes('@')) { Alert.alert('Required', 'Enter a valid email address.'); return; }

    setPayState('loading');
    setErrorMsg('');
    try {
      const { paymentLink, txRef } = await subscriptionService.initiateCard(name, email, cardPhone.trim() || undefined);
      await Linking.openURL(paymentLink);
      setPayState('waiting');
      // Poll using email as identifier (phone may not be set)
      const identifier = cardPhone.trim() || email;
      startPolling(identifier);
    } catch (e: any) {
      setPayState('error');
      setErrorMsg(e?.response?.data?.error ?? 'Could not connect. Check your internet and try again.');
    }
  };

  const startPolling = (identifier: string) => {
    let attempts = 0;
    const MAX = 20;

    const poll = async () => {
      if (attempts >= MAX) {
        setPayState('error');
        setErrorMsg("Payment not detected after 60 seconds. If you paid, the app will update automatically within a few minutes.");
        return;
      }
      try {
        const status = await subscriptionService.checkStatus(identifier);
        if (status.active) {
          setCurrentStatus(status);
          setPayState('success');
          return;
        }
      } catch {}
      attempts++;
      pollRef.current = setTimeout(poll, 3000);
    };
    pollRef.current = setTimeout(poll, 3000);
  };

  const reset = () => {
    setPayState('idle');
    setErrorMsg('');
    if (pollRef.current) clearTimeout(pollRef.current);
  };

  const isActive = currentStatus?.active ?? false;
  const daysLeft = currentStatus?.daysLeft ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color="#fff" onPress={() => router.back()} />
        <Appbar.Content title="Subscription" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Plan card */}
        <Card style={styles.planCard}>
          <Card.Content>
            <View style={styles.planRow}>
              <View>
                <Text style={styles.planName}>Nexora Pro</Text>
                <Text style={styles.planPrice}>KES 600 <Text style={styles.planPer}>/month</Text></Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: isActive ? '#22c55e22' : '#e5393522' }]}>
                <MaterialCommunityIcons
                  name={isActive ? 'check-circle' : 'clock-alert-outline'}
                  size={18}
                  color={isActive ? '#22c55e' : '#e53935'}
                />
                <Text style={[styles.statusText, { color: isActive ? '#22c55e' : '#e53935' }]}>
                  {isActive ? (daysLeft > 0 ? `Active · ${daysLeft}d left` : 'Active') : 'Inactive'}
                </Text>
              </View>
            </View>
            {isActive && currentStatus?.expiresAt && (
              <Text style={styles.expiry}>Renews {dayjs(currentStatus.expiresAt).format('D MMM YYYY')}</Text>
            )}
          </Card.Content>
        </Card>

        {/* Features */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>What's included</Text>
            {FEATURES.map(f => (
              <View key={f} style={styles.featureRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={C.accent} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Payment section */}
        {payState === 'success' ? (
          <Card style={[styles.card, { borderColor: '#22c55e', borderWidth: 1 }]}>
            <Card.Content style={{ alignItems: 'center', paddingVertical: 24 }}>
              <MaterialCommunityIcons name="check-circle" size={64} color="#22c55e" />
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginTop: 12 }}>Payment Received!</Text>
              <Text style={{ color: C.muted, marginTop: 6, textAlign: 'center' }}>
                Your Nexora Pro subscription is now active.{'\n'}Thank you!
              </Text>
              <Button mode="contained" style={{ marginTop: 20, borderRadius: 10 }} onPress={() => router.back()}>
                Back to App
              </Button>
            </Card.Content>
          </Card>
        ) : payState === 'waiting' ? (
          <WaitingCard method={method} onCancel={reset} C={C} />
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Pay & Activate</Text>

              {/* Method tabs */}
              <View style={styles.methodRow}>
                {(['mpesa', 'card', 'bank'] as PayMethod[]).map(m => (
                  <Chip
                    key={m}
                    selected={method === m}
                    onPress={() => { setMethod(m); reset(); }}
                    style={[styles.methodChip, method === m && { backgroundColor: C.accent + '22' }]}
                    textStyle={[styles.methodChipText, method === m && { color: C.accent, fontWeight: '700' }]}
                    icon={m === 'mpesa' ? 'cellphone' : m === 'card' ? 'credit-card' : 'bank'}
                  >
                    {m === 'mpesa' ? 'M-Pesa' : m === 'card' ? 'Card' : 'Bank'}
                  </Chip>
                ))}
              </View>

              <Divider style={{ marginVertical: 14 }} />

              {method === 'mpesa' && (
                <View>
                  <Text style={styles.methodDesc}>You'll receive an M-Pesa prompt on your phone. Enter your PIN to complete.</Text>
                  <TextInput label="Phone Number *" value={mpesaPhone} onChangeText={setMpesaPhone} mode="outlined" keyboardType="phone-pad" placeholder="07XXXXXXXX" style={styles.input} />
                  <TextInput label="Your Name *" value={mpesaName} onChangeText={setMpesaName} mode="outlined" style={styles.input} />
                  {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
                  <Button mode="contained" loading={payState === 'loading'} onPress={handleMpesaPay} style={styles.payBtn} contentStyle={{ height: 48 }} icon="cellphone">
                    Pay KES 600 via M-Pesa
                  </Button>
                </View>
              )}

              {method === 'card' && (
                <View>
                  <Text style={styles.methodDesc}>A secure payment page opens in your browser. Pay with Visa or Mastercard.</Text>
                  <TextInput label="Your Name *" value={cardName} onChangeText={setCardName} mode="outlined" style={styles.input} />
                  <TextInput label="Email Address *" value={cardEmail} onChangeText={setCardEmail} mode="outlined" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
                  <TextInput label="Phone (optional)" value={cardPhone} onChangeText={setCardPhone} mode="outlined" keyboardType="phone-pad" style={styles.input} />
                  {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
                  <Button mode="contained" loading={payState === 'loading'} onPress={handleCardPay} style={styles.payBtn} contentStyle={{ height: 48 }} icon="credit-card">
                    Open Payment Page
                  </Button>
                </View>
              )}

              {method === 'bank' && (
                <BankDetails C={C} styles={styles} />
              )}
            </Card.Content>
          </Card>
        )}

        <Text style={styles.footerNote}>
          Payments are processed securely via Flutterwave. Your subscription activates automatically within seconds of payment.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

function WaitingCard({ method, onCancel, C }: { method: PayMethod; onCancel: () => void; C: any }) {
  const msgs: Record<PayMethod, string> = {
    mpesa: 'Waiting for M-Pesa confirmation…\nEnter your PIN on the prompt sent to your phone.',
    card: 'Waiting for card payment confirmation…\nComplete the payment in your browser, then return here.',
    bank: 'Checking payment…',
  };
  return (
    <Card style={{ borderRadius: 14, marginBottom: 16 }}>
      <Card.Content style={{ alignItems: 'center', paddingVertical: 32 }}>
        <ActivityIndicator size={48} color={C.accent} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginTop: 20, textAlign: 'center' }}>
          {method === 'mpesa' ? 'Check Your Phone' : 'Processing Payment'}
        </Text>
        <Text style={{ color: C.muted, marginTop: 8, textAlign: 'center', lineHeight: 22, fontSize: 13 }}>
          {msgs[method]}
        </Text>
        <Text style={{ color: C.muted, marginTop: 16, fontSize: 12 }}>This page will update automatically</Text>
        <Button onPress={onCancel} style={{ marginTop: 20 }} textColor={C.muted}>Cancel</Button>
      </Card.Content>
    </Card>
  );
}

function BankDetails({ C, styles }: { C: any; styles: any }) {
  return (
    <View>
      <Text style={[styles.methodDesc, { marginBottom: 12 }]}>
        Make a bank transfer or use the Equity M-Pesa Paybill, then send your receipt to us for manual activation (usually within 2 hours).
      </Text>

      <View style={{ gap: 10 }}>
        <DetailRow label="Bank" value={BANK_DETAILS.bank} C={C} />
        <DetailRow label="Account Name" value={BANK_DETAILS.name} C={C} />
        <DetailRow label="Account No" value={BANK_DETAILS.account} C={C} />
      </View>

      <View style={[styles.orDivider]}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        <Text style={{ color: C.muted, marginHorizontal: 10, fontSize: 12 }}>OR via M-Pesa Paybill</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
      </View>

      <View style={{ gap: 10 }}>
        <DetailRow label="Paybill" value={BANK_DETAILS.paybill} C={C} />
        <DetailRow label="Account No" value={BANK_DETAILS.accNo} C={C} />
        <DetailRow label="Amount" value="KES 600" C={C} />
      </View>

      <Button
        mode="outlined"
        icon="whatsapp"
        style={{ marginTop: 20, borderRadius: 10 }}
        onPress={() => Linking.openURL('https://wa.me/254700000000?text=Hi%2C+I%27ve+made+a+bank+transfer+for+Nexora+POS+subscription+and+I%27m+sending+my+receipt.')}
      >
        Send Receipt via WhatsApp
      </Button>

      <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
        Your subscription will be activated within 2 hours of confirmation.
      </Text>
    </View>
  );
}

function DetailRow({ label, value, C }: { label: string; value: string; C: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ fontWeight: '700', color: C.text, fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    scroll: { padding: 16, gap: 14, paddingBottom: 40 },
    planCard: { borderRadius: 14, backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent + '33' },
    planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    planName: { fontSize: 11, fontWeight: '800', color: C.accent, textTransform: 'uppercase', letterSpacing: 1 },
    planPrice: { fontSize: 26, fontWeight: '900', color: C.text, marginTop: 2 },
    planPer: { fontSize: 14, fontWeight: '400', color: C.muted },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    statusText: { fontWeight: '700', fontSize: 12 },
    expiry: { color: C.muted, fontSize: 12, marginTop: 8 },
    card: { borderRadius: 14 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    featureText: { fontSize: 14, color: C.text },
    methodRow: { flexDirection: 'row', gap: 8 },
    methodChip: { borderRadius: 20 },
    methodChipText: { fontSize: 13 },
    methodDesc: { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 14 },
    input: { marginBottom: 10 },
    payBtn: { borderRadius: 10, marginTop: 4 },
    error: { color: '#e53935', fontSize: 12, marginBottom: 8, lineHeight: 18 },
    orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
    footerNote: { fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  });
}
