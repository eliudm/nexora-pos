import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Appbar, Card, Button, Portal, Dialog, TextInput, Chip, Divider, RadioButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { layawayQueries, Layaway, LayawayPayment } from '../../src/db/layaway';
import { customerQueries, Customer } from '../../src/db/customers';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

const STATUS_COLOR: Record<string, string> = {
  OPEN: '#3b82f6',
  COMPLETED: '#22c55e',
  CANCELLED: '#aaa',
};

const PAY_METHODS = ['CASH', 'MPESA', 'BANK'] as const;

export default function LayawayScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailLayaway, setDetailLayaway] = useState<Layaway | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Create form
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [createPayMethod, setCreatePayMethod] = useState<'CASH' | 'MPESA' | 'BANK'>('CASH');
  const [createMpesaRef, setCreateMpesaRef] = useState('');

  // Add payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'MPESA' | 'BANK'>('CASH');
  const [payMpesaRef, setPayMpesaRef] = useState('');
  const [payments, setPayments] = useState<LayawayPayment[]>([]);

  const { data: layaways, refetch } = useQuery({
    queryKey: ['layaways'],
    queryFn: () => layawayQueries.getAll(100),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-layaway', customerSearch],
    queryFn: () => customerQueries.getAll(customerSearch),
    enabled: customerPickerOpen,
  });

  const createMutation = useMutation({
    mutationFn: () => layawayQueries.create({
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      description: description.trim() || undefined,
      totalAmount: parseFloat(totalAmount) || 0,
      depositAmount: parseFloat(depositAmount) || 0,
      paymentMethod: createPayMethod,
      mpesaRef: createMpesaRef.trim() || undefined,
      cashierId: user?.id,
      cashierName: user?.name,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layaways'] });
      setCreateOpen(false);
      setSelectedCustomer(null);
      setDescription('');
      setTotalAmount('');
      setDepositAmount('');
      setCreateMpesaRef('');
      refetch();
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: () => layawayQueries.addPayment(detailLayaway!.id, {
      amount: parseFloat(payAmount) || 0,
      paymentMethod: payMethod,
      mpesaRef: payMpesaRef.trim() || undefined,
      cashierId: user?.id,
      cashierName: user?.name,
    }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['layaways'] });
      const updated = await layawayQueries.getById(detailLayaway!.id);
      setDetailLayaway(updated);
      setPaymentOpen(false);
      setPayAmount('');
      setPayMpesaRef('');
      refetch();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => layawayQueries.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layaways'] });
      setDetailLayaway(null);
      refetch();
    },
  });

  const openDetail = async (lay: Layaway) => {
    setDetailLayaway(lay);
    const pList = await layawayQueries.getPayments(lay.id);
    setPayments(pList);
  };

  const confirmCreate = () => {
    if (!totalAmount || parseFloat(totalAmount) <= 0) { Alert.alert('Required', 'Enter the total amount.'); return; }
    const dep = parseFloat(depositAmount) || 0;
    const tot = parseFloat(totalAmount) || 0;
    if (dep > tot) { Alert.alert('Invalid', 'Deposit cannot exceed total amount.'); return; }
    createMutation.mutate();
  };

  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color="#fff" onPress={() => router.back()} />
        <Appbar.Content title="Layaway / Deposits" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color="#fff" onPress={() => setCreateOpen(true)} />
      </Appbar.Header>

      <FlatList
        data={layaways ?? []}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <MaterialCommunityIcons name="package-down" size={48} color="#ccc" />
            <Text style={{ color: '#aaa', marginTop: 12 }}>No layaways yet</Text>
            <Button mode="outlined" style={{ marginTop: 16 }} onPress={() => setCreateOpen(true)}>Create First Layaway</Button>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => openDetail(item)}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.layNo}>{item.layaway_no}</Text>
                  {item.customer_name && <Text style={styles.customer}>{item.customer_name}</Text>}
                  {item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
                </View>
                <Chip compact style={{ backgroundColor: STATUS_COLOR[item.status] + '22' }} textStyle={{ color: STATUS_COLOR[item.status], fontWeight: '700', fontSize: 11 }}>
                  {item.status}
                </Chip>
              </View>
              <View style={styles.amtRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amtLabel}>Total</Text>
                  <Text style={styles.amtVal}>{fmt(item.total_amount)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amtLabel}>Paid</Text>
                  <Text style={[styles.amtVal, { color: '#22c55e' }]}>{fmt(item.deposit_paid)}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.amtLabel}>Balance</Text>
                  <Text style={[styles.amtVal, { color: item.balance_due > 0 ? '#e53935' : '#22c55e' }]}>{fmt(item.balance_due)}</Text>
                </View>
              </View>
              <Text style={styles.date}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
            </Card.Content>
          </Card>
        )}
      />

      <Portal>
        {/* Create Layaway */}
        <Dialog visible={createOpen} onDismiss={() => setCreateOpen(false)}>
          <Dialog.ScrollArea style={{ maxHeight: 520 }}>
            <Dialog.Title>New Layaway</Dialog.Title>
            <View style={{ padding: 16 }}>
              <Button mode="outlined" icon="account" onPress={() => setCustomerPickerOpen(true)} style={{ marginBottom: 10 }}>
                {selectedCustomer ? selectedCustomer.name : 'Select Customer (optional)'}
              </Button>
              <TextInput label="Description / Item" value={description} onChangeText={setDescription} mode="outlined" style={styles.input} />
              <TextInput label="Total Amount (KES) *" value={totalAmount} onChangeText={setTotalAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} />
              <TextInput label="Initial Deposit (KES)" value={depositAmount} onChangeText={setDepositAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} />
              <Text style={styles.pmLabel}>Payment Method</Text>
              <View style={styles.pmRow}>
                {PAY_METHODS.map((m) => (
                  <Chip key={m} selected={createPayMethod === m} onPress={() => setCreatePayMethod(m)} compact style={{ marginRight: 6 }}>{m}</Chip>
                ))}
              </View>
              {createPayMethod === 'MPESA' && (
                <TextInput label="M-Pesa Ref" value={createMpesaRef} onChangeText={setCreateMpesaRef} mode="outlined" style={styles.input} autoCapitalize="characters" />
              )}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmCreate} loading={createMutation.isPending}>Create</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Picker */}
        <Dialog visible={customerPickerOpen} onDismiss={() => setCustomerPickerOpen(false)}>
          <Dialog.Title>Select Customer</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Search" value={customerSearch} onChangeText={setCustomerSearch} mode="outlined" dense />
            {(customers ?? []).slice(0, 6).map((c) => (
              <View key={c.id}>
                <Text onPress={() => { setSelectedCustomer(c); setCustomerPickerOpen(false); }}
                  style={{ paddingVertical: 10, fontSize: 14 }}>{c.name} {c.phone ? `· ${c.phone}` : ''}</Text>
                <Divider />
              </View>
            ))}
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setCustomerPickerOpen(false)}>Close</Button></Dialog.Actions>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog visible={!!detailLayaway} onDismiss={() => setDetailLayaway(null)}>
          <Dialog.ScrollArea style={{ maxHeight: 500 }}>
            <Dialog.Title>{detailLayaway?.layaway_no}</Dialog.Title>
            <View style={{ padding: 16 }}>
              {detailLayaway?.customer_name && <Text style={{ color: '#555', marginBottom: 4 }}>Customer: {detailLayaway.customer_name}</Text>}
              {detailLayaway?.description && <Text style={{ color: '#555', marginBottom: 8 }}>{detailLayaway.description}</Text>}
              <View style={styles.amtRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amtLabel}>Total</Text>
                  <Text style={styles.amtVal}>{fmt(detailLayaway?.total_amount ?? 0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amtLabel}>Paid</Text>
                  <Text style={[styles.amtVal, { color: '#22c55e' }]}>{fmt(detailLayaway?.deposit_paid ?? 0)}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.amtLabel}>Balance</Text>
                  <Text style={[styles.amtVal, { color: '#e53935' }]}>{fmt(detailLayaway?.balance_due ?? 0)}</Text>
                </View>
              </View>
              <Divider style={{ marginVertical: 12 }} />
              <Text style={styles.pmLabel}>Payments</Text>
              {payments.map((p) => (
                <View key={p.id} style={styles.payRow}>
                  <Text style={{ flex: 1, fontSize: 13, color: '#333' }}>{dayjs(p.created_at).format('D MMM HH:mm')} · {p.payment_method}</Text>
                  <Text style={{ fontWeight: '700', color: '#22c55e' }}>{fmt(p.amount)}</Text>
                </View>
              ))}
              {payments.length === 0 && <Text style={{ color: '#aaa', fontSize: 12 }}>No payments recorded</Text>}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailLayaway(null)}>Close</Button>
            {detailLayaway?.status === 'OPEN' && (
              <Button textColor="#e53935" onPress={() => Alert.alert('Cancel Layaway', 'Mark this layaway as cancelled?', [
                { text: 'No' },
                { text: 'Yes', style: 'destructive', onPress: () => cancelMutation.mutate(detailLayaway.id) },
              ])}>Cancel</Button>
            )}
            {detailLayaway?.status === 'OPEN' && detailLayaway.balance_due > 0 && (
              <Button mode="contained" onPress={() => setPaymentOpen(true)}>Add Payment</Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Add Payment Dialog */}
        <Dialog visible={paymentOpen} onDismiss={() => setPaymentOpen(false)}>
          <Dialog.Title>Add Payment — {fmt(detailLayaway?.balance_due ?? 0)} due</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Amount (KES)" value={payAmount} onChangeText={setPayAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} autoFocus />
            <Text style={styles.pmLabel}>Method</Text>
            <View style={styles.pmRow}>
              {PAY_METHODS.map((m) => (
                <Chip key={m} selected={payMethod === m} onPress={() => setPayMethod(m)} compact style={{ marginRight: 6 }}>{m}</Chip>
              ))}
            </View>
            {payMethod === 'MPESA' && (
              <TextInput label="M-Pesa Ref" value={payMpesaRef} onChangeText={setPayMpesaRef} mode="outlined" style={styles.input} autoCapitalize="characters" />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => addPaymentMutation.mutate()} loading={addPaymentMutation.isPending}>Record Payment</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    card: { borderRadius: 12 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    layNo: { fontSize: 13, fontWeight: '700', color: C.text },
    customer: { fontSize: 12, color: C.accent, marginTop: 2 },
    desc: { fontSize: 12, color: C.muted, marginTop: 2 },
    amtRow: { flexDirection: 'row', marginTop: 4 },
    amtLabel: { fontSize: 10, color: C.muted, textTransform: 'uppercase' },
    amtVal: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 2 },
    date: { fontSize: 10, color: C.muted, marginTop: 8 },
    input: { marginBottom: 10 },
    pmLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 4, marginBottom: 6 },
    pmRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    payRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  });
}
