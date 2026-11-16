import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, Switch } from 'react-native';
import { Text, Appbar, Card, Button, Portal, Dialog, TextInput, Chip, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { layawayQueries, Layaway, LayawayPayment, LayawayItem } from '../../src/db/layaway';
import { customerQueries, Customer } from '../../src/db/customers';
import { getBusinessInfo } from '../../src/db/settings';
import { printerService } from '../../src/services/printer';
import { buildLayawayReceiptText, buildLayawayReceiptHtml, type LayawayReceiptData, type BusinessInfo } from '../../src/services/receipt';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

const STATUS_COLOR: Record<string, string> = {
  OPEN: '#3b82f6',
  RESERVED: '#8b5cf6',
  COMPLETED: '#22c55e',
  CANCELLED: '#aaa',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'IN PROGRESS',
  RESERVED: 'PAID · AWAITING COLLECTION',
  COMPLETED: 'COLLECTED',
  CANCELLED: 'CANCELLED',
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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerKraPin, setCustomerKraPin] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [createPayMethod, setCreatePayMethod] = useState<'CASH' | 'MPESA' | 'BANK'>('CASH');
  const [createMpesaRef, setCreateMpesaRef] = useState('');
  const [collectLater, setCollectLater] = useState(false);

  // Add payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'MPESA' | 'BANK'>('CASH');
  const [payMpesaRef, setPayMpesaRef] = useState('');
  const [payments, setPayments] = useState<LayawayPayment[]>([]);

  // Completion / post-as-sale
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completedLayaway, setCompletedLayaway] = useState<Layaway | null>(null);
  const [postingSale, setPostingSale] = useState(false);

  const { data: layaways, refetch } = useQuery({
    queryKey: ['layaways'],
    queryFn: () => layawayQueries.getAll(100),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-layaway', customerName],
    queryFn: () => customerQueries.getAll(customerName),
    enabled: createOpen && customerName.length > 0 && !selectedCustomer,
  });

  const { data: bizInfo } = useQuery({
    queryKey: ['biz-info'],
    queryFn: getBusinessInfo,
  });

  const resetCreateForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerKraPin('');
    setSelectedCustomer(null);
    setDescription('');
    setTotalAmount('');
    setDepositAmount('');
    setCreateMpesaRef('');
    setCollectLater(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Save new customer if phone/email provided and not already linked
      let custId = selectedCustomer?.id ?? null;
      const phone = customerPhone.trim();
      const email = customerEmail.trim();
      if (!selectedCustomer && customerName.trim() && (phone || email)) {
        custId = await customerQueries.create({
          name: customerName.trim(),
          phone: phone || null,
          email: email || null,
          kra_pin: customerKraPin.trim() || null,
          credit_balance: 0,
        });
        qc.invalidateQueries({ queryKey: ['customers'] });
      }
      return layawayQueries.create({
        customerId: custId,
        customerName: customerName.trim(),
        description: description.trim() || undefined,
        totalAmount: parseFloat(totalAmount) || 0,
        depositAmount: collectLater ? (parseFloat(totalAmount) || 0) : (parseFloat(depositAmount) || 0),
        paymentMethod: createPayMethod,
        mpesaRef: createMpesaRef.trim() || undefined,
        cashierId: user?.id,
        cashierName: user?.name,
        collectLater,
      });
    },
    onSuccess: async (layawayId) => {
      qc.invalidateQueries({ queryKey: ['layaways'] });
      const dep = collectLater ? (parseFloat(totalAmount) || 0) : (parseFloat(depositAmount) || 0);
      const tot = parseFloat(totalAmount) || 0;
      setCreateOpen(false);
      resetCreateForm();
      refetch();
      // Print layaway receipt
      if (bizInfo) {
        const items = await layawayQueries.getItems(layawayId);
        await printLayawayReceipt({
          layawayNo: '', // will be filled from DB; use description as fallback
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || null,
          description: description.trim() || undefined,
          items: items.map(i => ({ product_name: i.product_name, qty: i.qty, unit_price: i.unit_price })),
          totalAmount: tot,
          depositPaid: dep,
          balanceDue: tot - dep,
          paymentMethod: createPayMethod,
          mpesaRef: createMpesaRef.trim() || null,
          cashierName: user?.name ?? null,
          createdAt: new Date().toISOString(),
          eventLabel: collectLater ? 'RESERVED' : 'CREATED',
        }, bizInfo);
      }
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
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      const updated = await layawayQueries.getById(detailLayaway!.id);
      setDetailLayaway(updated);
      setPaymentOpen(false);
      const paidNow = parseFloat(payAmount) || 0;
      const usedMethod = payMethod;
      const usedRef = payMpesaRef.trim() || null;
      setPayAmount('');
      setPayMpesaRef('');
      refetch();
      if (updated && updated.balance_due <= 0) {
        setCompletedLayaway(updated);
        setCompletionOpen(true);
        // Receipt is handled by handlePostAsSale (collect now) or the
        // "Will Collect Later" button — don't print here or the Alert
        // collides with the completion dialog.
      } else if (updated && bizInfo) {
        // Partial payment only — print a progress receipt
        const items = await layawayQueries.getItems(updated.id);
        await printLayawayReceipt({
          layawayNo: updated.layaway_no,
          customerName: updated.customer_name ?? '',
          customerPhone: null,
          description: updated.description,
          items: items.map(i => ({ product_name: i.product_name, qty: i.qty, unit_price: i.unit_price })),
          totalAmount: updated.total_amount,
          depositPaid: updated.deposit_paid,
          balanceDue: updated.balance_due,
          paymentMethod: usedMethod,
          mpesaRef: usedRef,
          cashierName: user?.name ?? null,
          createdAt: new Date().toISOString(),
          eventLabel: 'PAYMENT RECEIVED',
        }, bizInfo);
      }
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
    if (!customerName.trim()) { Alert.alert('Required', 'Enter the customer name.'); return; }
    if (!totalAmount || parseFloat(totalAmount) <= 0) { Alert.alert('Required', 'Enter the total amount.'); return; }
    const dep = collectLater ? parseFloat(totalAmount) : (parseFloat(depositAmount) || 0);
    const tot = parseFloat(totalAmount) || 0;
    if (!collectLater && dep > tot) { Alert.alert('Invalid', 'Deposit cannot exceed the total amount.'); return; }
    if (createPayMethod === 'MPESA' && dep > 0 && !createMpesaRef.trim()) {
      Alert.alert('Required', 'Enter the M-Pesa transaction code.');
      return;
    }
    createMutation.mutate();
  };

  const confirmAddPayment = () => {
    const amount = parseFloat(payAmount) || 0;
    const balance = detailLayaway?.balance_due ?? 0;
    if (amount <= 0) { Alert.alert('Required', 'Enter a payment amount.'); return; }
    if (amount > balance + 0.01) {
      Alert.alert('Overpayment', `Payment of ${fmt(amount)} exceeds the balance of ${fmt(balance)}. Please enter ${fmt(balance)} or less.`);
      return;
    }
    if (payMethod === 'MPESA' && !payMpesaRef.trim()) { Alert.alert('Required', 'Enter the M-Pesa transaction code.'); return; }
    addPaymentMutation.mutate();
  };

  const handlePostAsSale = async (lay?: Layaway | null) => {
    const target = lay ?? completedLayaway;
    if (!target || !bizInfo) return;
    setPostingSale(true);
    try {
      const result = await layawayQueries.postAsSale(target.id, user?.id ?? null);
      qc.invalidateQueries({ queryKey: ['layaways'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['top-products'] });
      qc.invalidateQueries({ queryKey: ['top-products-report'] });
      // Close all dialogs first, then handle receipt non-blockingly
      setCompletionOpen(false);
      setDetailLayaway(null);
      refetch();
      // Print collected receipt
      const items = await layawayQueries.getItems(target.id);
      await printLayawayReceipt({
        layawayNo: target.layaway_no,
        customerName: target.customer_name ?? '',
        customerPhone: null,
        description: target.description,
        items: items.map(i => ({ product_name: i.product_name, qty: i.qty, unit_price: i.unit_price })),
        totalAmount: target.total_amount,
        depositPaid: target.total_amount,
        balanceDue: 0,
        paymentMethod: result.paymentMethod,
        mpesaRef: result.mpesaRef,
        cashierName: user?.name ?? null,
        createdAt: new Date().toISOString(),
        eventLabel: 'COLLECTED',
      }, bizInfo);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not post sale.');
    } finally {
      setPostingSale(false);
    }
  };

  const printLayawayReceipt = async (data: LayawayReceiptData, biz: NonNullable<typeof bizInfo>) => {
    const bizData: BusinessInfo = { name: biz.name ?? '', phone: biz.phone, address: biz.address, vatNo: biz.vatNo, receiptFooter: biz.receiptFooter, mpesaPaybill: biz.mpesaPaybill, mpesaTill: biz.mpesaTill };
    const config = await printerService.getConfig();
    if (config.type !== 'none') {
      await printerService.print(buildLayawayReceiptText(data, bizData));
      return;
    }
    // No printer — offer to share PDF
    Alert.alert('Layaway Receipt', 'Share receipt with customer?', [
      { text: 'Share PDF', onPress: async () => {
        const html = buildLayawayReceiptHtml(data, bizData);
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Layaway Receipt' });
      }},
      { text: 'Skip' },
    ]);
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
                  {STATUS_LABEL[item.status] ?? item.status}
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
              {item.status === 'RESERVED' && (
                <View style={[styles.reservedBanner, { backgroundColor: '#8b5cf611', borderColor: '#8b5cf644' }]}>
                  <MaterialCommunityIcons name="package-variant-closed" size={14} color="#8b5cf6" />
                  <Text style={{ color: '#8b5cf6', fontSize: 11, fontWeight: '700', marginLeft: 6 }}>Paid in full — waiting for collection</Text>
                </View>
              )}
              <Text style={styles.date}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
            </Card.Content>
          </Card>
        )}
      />

      <Portal>
        {/* ── Create Layaway ── */}
        <Dialog visible={createOpen} onDismiss={() => { setCreateOpen(false); resetCreateForm(); }}>
          <Dialog.ScrollArea style={{ maxHeight: 580 }}>
            <Dialog.Title>New Layaway</Dialog.Title>
            <View style={{ padding: 16 }}>
              {/* Customer autocomplete */}
              <View style={{ marginBottom: 8 }}>
                <TextInput
                  label="Customer Name *"
                  value={customerName}
                  onChangeText={(t) => { setCustomerName(t); setSelectedCustomer(null); }}
                  mode="outlined"
                  style={styles.input}
                  placeholder="Type to search existing customers…"
                  right={selectedCustomer ? <TextInput.Icon icon="account-check" color={C.accent} /> : undefined}
                />
                {selectedCustomer && (
                  <Text style={{ fontSize: 11, color: C.accent, marginTop: -4, marginBottom: 4, marginLeft: 2 }}>
                    Linked to existing customer · {selectedCustomer.phone ?? 'no phone'}
                  </Text>
                )}
                {!selectedCustomer && customerName.length > 0 && (customers ?? []).length > 0 && (
                  <View style={[styles.autocompleteBox, { backgroundColor: C.surface, borderColor: C.border }]}>
                    {(customers ?? []).slice(0, 5).map((c) => (
                      <View key={c.id}>
                        <Text
                          onPress={() => { setSelectedCustomer(c); setCustomerName(c.name); }}
                          style={{ paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: C.text }}
                        >
                          {c.name}{c.phone ? ` · ${c.phone}` : ''}
                        </Text>
                        <Divider />
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Phone & email — shown for new customers only */}
              {!selectedCustomer && (
                <>
                  <TextInput label="Phone Number" value={customerPhone} onChangeText={setCustomerPhone} mode="outlined" style={styles.input} keyboardType="phone-pad" placeholder="e.g. 0712 345 678" />
                  <TextInput label="Email (optional)" value={customerEmail} onChangeText={setCustomerEmail} mode="outlined" style={styles.input} keyboardType="email-address" autoCapitalize="none" />
                  <TextInput label="KRA PIN (optional)" value={customerKraPin} onChangeText={setCustomerKraPin} mode="outlined" style={styles.input} autoCapitalize="characters" placeholder="e.g. A012345678Z" />
                  {(customerPhone.trim() || customerEmail.trim()) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <MaterialCommunityIcons name="account-plus-outline" size={14} color={C.accent} />
                      <Text style={{ fontSize: 11, color: C.accent }}>Customer will be saved to your contacts</Text>
                    </View>
                  )}
                </>
              )}

              <TextInput label="Description / Items" value={description} onChangeText={setDescription} mode="outlined" style={styles.input} />
              <TextInput label="Total Amount (KES) *" value={totalAmount} onChangeText={setTotalAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} />

              {/* Pay & Collect Later toggle */}
              <View style={[styles.toggleRow, { backgroundColor: C.elevated, borderColor: '#8b5cf644' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.text, fontSize: 14 }}>Pay in Full &amp; Collect Later</Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Customer pays the full amount now and collects the item later.</Text>
                </View>
                <Switch
                  value={collectLater}
                  onValueChange={setCollectLater}
                  trackColor={{ true: '#8b5cf6', false: C.border }}
                />
              </View>

              {!collectLater && (
                <TextInput label="Initial Deposit (KES)" value={depositAmount} onChangeText={setDepositAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} />
              )}

              <Text style={styles.pmLabel}>Payment Method</Text>
              <View style={styles.pmRow}>
                {PAY_METHODS.map((m) => (
                  <Chip key={m} selected={createPayMethod === m} onPress={() => setCreatePayMethod(m)} compact style={{ marginRight: 6 }}>{m}</Chip>
                ))}
              </View>
              {createPayMethod === 'MPESA' && (
                <TextInput label="M-Pesa Ref *" value={createMpesaRef} onChangeText={setCreateMpesaRef} mode="outlined" style={styles.input} autoCapitalize="characters" />
              )}

              {collectLater && totalAmount ? (
                <View style={[styles.collectNote, { backgroundColor: '#8b5cf611', borderColor: '#8b5cf633' }]}>
                  <MaterialCommunityIcons name="check-circle-outline" size={14} color="#8b5cf6" />
                  <Text style={{ color: '#8b5cf6', fontSize: 12, marginLeft: 6, flex: 1 }}>
                    Full {fmt(parseFloat(totalAmount) || 0)} collected now. Item set aside for pickup.
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Item will be set aside for the customer once the deposit is received.</Text>
              )}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => { setCreateOpen(false); resetCreateForm(); }}>Cancel</Button>
            <Button mode="contained" onPress={confirmCreate} loading={createMutation.isPending}>
              {collectLater ? 'Reserve & Collect Later' : 'Create Layaway'}
            </Button>
          </Dialog.Actions>
        </Dialog>


        {/* ── Detail Dialog ── */}
        <Dialog visible={!!detailLayaway} onDismiss={() => setDetailLayaway(null)}>
          <Dialog.ScrollArea style={{ maxHeight: 520 }}>
            <Dialog.Title>{detailLayaway?.layaway_no}</Dialog.Title>
            <View style={{ padding: 16 }}>
              {detailLayaway?.customer_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MaterialCommunityIcons name="account" size={14} color={C.accent} />
                  <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{detailLayaway.customer_name}</Text>
                </View>
              )}
              {detailLayaway?.description && <Text style={{ color: C.muted, marginBottom: 10, fontSize: 13 }}>{detailLayaway.description}</Text>}
              {detailLayaway?.status === 'RESERVED' && (
                <View style={[styles.reservedBanner, { backgroundColor: '#8b5cf611', borderColor: '#8b5cf644', marginBottom: 12 }]}>
                  <MaterialCommunityIcons name="package-variant-closed" size={16} color="#8b5cf6" />
                  <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '700', marginLeft: 8, flex: 1 }}>Paid in full — customer has not yet collected</Text>
                </View>
              )}
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
                  <Text style={[styles.amtVal, { color: (detailLayaway?.balance_due ?? 0) > 0 ? '#e53935' : '#22c55e' }]}>{fmt(detailLayaway?.balance_due ?? 0)}</Text>
                </View>
              </View>
              <Divider style={{ marginVertical: 12 }} />
              <Text style={styles.pmLabel}>Payments</Text>
              {payments.map((p) => (
                <View key={p.id} style={styles.payRow}>
                  <Text style={{ flex: 1, fontSize: 13, color: C.text }}>{dayjs(p.created_at).format('D MMM HH:mm')} · {p.payment_method}</Text>
                  <Text style={{ fontWeight: '700', color: '#22c55e' }}>{fmt(p.amount)}</Text>
                </View>
              ))}
              {payments.length === 0 && <Text style={{ color: C.muted, fontSize: 12 }}>No payments recorded</Text>}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailLayaway(null)}>Close</Button>
            {(detailLayaway?.status === 'OPEN' || detailLayaway?.status === 'RESERVED') && (
              <Button textColor="#e53935" onPress={() => Alert.alert('Cancel Layaway', 'Mark this layaway as cancelled?', [
                { text: 'No' },
                { text: 'Yes', style: 'destructive', onPress: () => cancelMutation.mutate(detailLayaway!.id) },
              ])}>Cancel</Button>
            )}
            {detailLayaway?.status === 'OPEN' && (detailLayaway.balance_due ?? 0) > 0 && (
              <Button mode="contained" onPress={() => setPaymentOpen(true)}>Add Payment</Button>
            )}
            {detailLayaway?.status === 'RESERVED' && (
              <Button
                mode="contained"
                buttonColor="#8b5cf6"
                icon="package-variant"
                loading={postingSale}
                onPress={() => Alert.alert(
                  'Mark as Collected',
                  `Confirm that ${detailLayaway.customer_name ?? 'the customer'} has collected this item?`,
                  [{ text: 'Cancel' }, { text: 'Confirm', onPress: () => handlePostAsSale(detailLayaway) }],
                )}
              >
                Mark as Collected
              </Button>
            )}
            {detailLayaway?.status === 'COMPLETED' && (
              <Button mode="contained" icon="printer" onPress={() => { setCompletedLayaway(detailLayaway); setCompletionOpen(true); }}>
                Post as Sale
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* ── Add Payment Dialog ── */}
        <Dialog visible={paymentOpen} onDismiss={() => setPaymentOpen(false)}>
          <Dialog.Title>Add Payment</Dialog.Title>
          <Dialog.Content>
            <View style={[styles.balanceRow, { backgroundColor: C.elevated }]}>
              <View>
                <Text style={[styles.balLabel, { color: C.muted }]}>Balance Due</Text>
                <Text style={[styles.balAmt, { color: '#e53935' }]}>{fmt(detailLayaway?.balance_due ?? 0)}</Text>
              </View>
              <Button compact mode="outlined" onPress={() => setPayAmount(String(detailLayaway?.balance_due ?? 0))} style={{ borderColor: C.accent }} textColor={C.accent}>
                Pay Full
              </Button>
            </View>
            <TextInput label="Amount (KES)" value={payAmount} onChangeText={setPayAmount} mode="outlined" keyboardType="decimal-pad" style={styles.input} autoFocus />
            <Text style={styles.pmLabel}>Method</Text>
            <View style={styles.pmRow}>
              {PAY_METHODS.map((m) => (
                <Chip key={m} selected={payMethod === m} onPress={() => setPayMethod(m)} compact style={{ marginRight: 6 }}>{m}</Chip>
              ))}
            </View>
            {payMethod === 'MPESA' && (
              <TextInput label="M-Pesa Ref *" value={payMpesaRef} onChangeText={setPayMpesaRef} mode="outlined" style={styles.input} autoCapitalize="characters" />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmAddPayment} loading={addPaymentMutation.isPending}>Record Payment</Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Fully Paid: Collect Now or Later? ── */}
        <Dialog visible={completionOpen} onDismiss={() => setCompletionOpen(false)}>
          <Dialog.Title>Fully Paid!</Dialog.Title>
          <Dialog.Content>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#22c55e22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <MaterialCommunityIcons name="check-circle" size={36} color="#22c55e" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center' }}>
                {completedLayaway?.layaway_no} is fully paid
              </Text>
              <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                Is the customer collecting the item now?
              </Text>
            </View>
          </Dialog.Content>
          <Dialog.Actions style={{ flexDirection: 'column', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Button mode="contained" buttonColor={C.accent} icon="package-variant-closed-check" loading={postingSale} onPress={() => handlePostAsSale()} style={{ width: '100%', borderRadius: 10 }}>
              Yes — Collecting Now
            </Button>
            <Button mode="outlined" onPress={async () => {
              setCompletionOpen(false);
              setDetailLayaway(null);
              refetch();
              // Print fully paid receipt now that dialog is dismissed
              if (completedLayaway && bizInfo) {
                const items = await layawayQueries.getItems(completedLayaway.id);
                await printLayawayReceipt({
                  layawayNo: completedLayaway.layaway_no,
                  customerName: completedLayaway.customer_name ?? '',
                  customerPhone: null,
                  description: completedLayaway.description,
                  items: items.map(i => ({ product_name: i.product_name, qty: i.qty, unit_price: i.unit_price })),
                  totalAmount: completedLayaway.total_amount,
                  depositPaid: completedLayaway.total_amount,
                  balanceDue: 0,
                  paymentMethod: 'CASH',
                  mpesaRef: null,
                  cashierName: user?.name ?? null,
                  createdAt: new Date().toISOString(),
                  eventLabel: 'FULLY PAID',
                }, bizInfo);
              }
            }} style={{ width: '100%', borderRadius: 10 }}>
              No — Will Collect Later
            </Button>
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
    customer: { fontSize: 13, color: C.accent, fontWeight: '600', marginTop: 2 },
    desc: { fontSize: 12, color: C.muted, marginTop: 2 },
    amtRow: { flexDirection: 'row', marginTop: 4 },
    amtLabel: { fontSize: 10, color: C.muted, textTransform: 'uppercase' },
    amtVal: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 2 },
    date: { fontSize: 10, color: C.muted, marginTop: 8 },
    input: { marginBottom: 10 },
    pmLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 4, marginBottom: 6 },
    pmRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    payRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
    balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 12, marginBottom: 12 },
    balLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    balAmt: { fontSize: 22, fontWeight: '900', marginTop: 2 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
    collectNote: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 4 },
    reservedBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, padding: 8, marginTop: 8 },
    autocompleteBox: { borderWidth: 1, borderRadius: 8, marginTop: -6, marginBottom: 8, overflow: 'hidden' },
  });
}
