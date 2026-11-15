import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Appbar, Card, Chip, Portal, Dialog, Button, Divider, DataTable, TextInput, RadioButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { salesQueries, Sale } from '../../../src/db/sales';
import { creditQueries } from '../../../src/db/credit';
import { useSession } from '../../../src/context/session';
import { useTheme } from '../../../src/context/theme';

const REPAY_METHODS = ['CASH', 'MPESA', 'BANK'] as const;
type RepayPM = typeof REPAY_METHODS[number];

const PM_COLORS: Record<string, string> = {
  CASH: '#22c55e',
  MPESA: '#f59e0b',
  CREDIT: '#6f67ff',
};

export default function SalesScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const [from, setFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<Sale | null>(null);

  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');

  // Credit repayment state
  const [repayDialogOpen, setRepayDialogOpen] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<RepayPM>('CASH');
  const [repayMpesaRef, setRepayMpesaRef] = useState('');
  const [repayNote, setRepayNote] = useState('');

  const voidMutation = useMutation({
    mutationFn: (saleId: number) => salesQueries.voidSale(saleId, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setSelected(null);
      Alert.alert('Voided', 'Sale has been voided and stock restored.');
    },
  });

  const reverseMutation = useMutation({
    mutationFn: ({ saleId, reason }: { saleId: number; reason: string }) =>
      salesQueries.reverseSale(saleId, reason, user?.id ?? null),
    onSuccess: (reversalInvoiceNo) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setReverseDialogOpen(false);
      setReverseReason('');
      setSelected(null);
      Alert.alert('Reversed', `Reversal posted as ${reversalInvoiceNo}. Stock restored.`);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const repayMutation = useMutation({
    mutationFn: () => creditQueries.recordRepayment({
      customerId: selected!.customer_id!,
      amount: parseFloat(repayAmount),
      paymentMethod: repayMethod,
      mpesaRef: repayMethod === 'MPESA' ? repayMpesaRef.trim() || undefined : undefined,
      note: repayNote.trim() || `Payment for ${selected!.invoice_no}`,
      cashierId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-debtors'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-ledger', selected!.customer_id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setRepayDialogOpen(false);
      setRepayAmount('');
      setRepayMethod('CASH');
      setRepayMpesaRef('');
      setRepayNote('');
      Alert.alert('Payment Recorded', `KES ${parseFloat(repayAmount).toLocaleString('en-KE', { minimumFractionDigits: 2 })} credited to account.`);
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to record payment'),
  });

  const handleRepaySubmit = () => {
    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) { Alert.alert('Invalid Amount', 'Enter a valid payment amount.'); return; }
    if (repayMethod === 'MPESA' && !repayMpesaRef.trim()) { Alert.alert('M-Pesa Reference', 'Enter the M-Pesa transaction code.'); return; }
    repayMutation.mutate();
  };

  const handleVoid = (sale: Sale) => {
    if (user?.role !== 'ADMIN') { Alert.alert('Access Denied', 'Only admins can void sales.'); return; }
    Alert.alert('Void Sale', `Void ${sale.invoice_no}? Stock will be restored.`, [
      { text: 'Cancel' },
      { text: 'Void', style: 'destructive', onPress: () => voidMutation.mutate(sale.id) },
    ]);
  };

  const { data: sales } = useQuery({
    queryKey: ['sales', from, to],
    queryFn: () => salesQueries.getAll(from, to, 200),
  });

  const { data: detail } = useQuery({
    queryKey: ['sale-detail', selected?.id],
    queryFn: () => salesQueries.getById(selected!.id),
    enabled: !!selected,
  });

  // Compute profit from loaded detail items
  const detailCOGS = (detail?.items ?? []).reduce(
    (s, i) => s + (i.cost_price / (1 + i.vat_rate / 100)) * i.qty, 0,
  );
  const detailRevExVAT = (detail?.total ?? 0) - (detail?.tax_amount ?? 0);
  const detailProfit = detailRevExVAT - detailCOGS;
  const detailMarginPct = detailRevExVAT > 0 ? (detailProfit / detailRevExVAT) * 100 : 0;
  const hasCostData = (detail?.items ?? []).some((i) => i.cost_price > 0);

  const presets = [
    { label: 'Today', from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    { label: 'Yesterday', from: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), to: dayjs().subtract(1, 'day').format('YYYY-MM-DD') },
    { label: 'This Week', from: dayjs().startOf('week').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    { label: 'This Month', from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
  ];

  const totalRevenue = (sales ?? []).reduce((s, x) => s + x.total, 0);
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Sales History" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.presets}>
        {presets.map((p) => (
          <Chip
            key={p.label}
            selected={from === p.from && to === p.to}
            onPress={() => { setFrom(p.from); setTo(p.to); }}
            style={styles.presetChip}
            selectedColor={C.accent}
            compact
          >
            {p.label}
          </Chip>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryCount}>{(sales ?? []).length} transactions</Text>
        <Text style={styles.summaryTotal}>KES {totalRevenue.toLocaleString()}</Text>
      </View>

      <FlatList
        data={sales ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => setSelected(item)}>
            <Card.Content style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceNo}>{item.invoice_no}</Text>
                <Text style={styles.time}>{dayjs(item.created_at).format('D MMM, HH:mm')}</Text>
                {item.customer_name && <Text style={styles.customer}>{item.customer_name}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[
                  styles.total,
                  (item.status === 'VOIDED' || item.status === 'REVERSED') && { color: '#aaa', textDecorationLine: 'line-through' },
                  item.status === 'REVERSAL' && { color: '#e53935' },
                ]}>
                  {item.status === 'REVERSAL' ? '-' : ''}KES {Math.abs(item.total).toLocaleString()}
                </Text>
                {item.status === 'VOIDED' ? (
                  <View style={[styles.badge, { backgroundColor: '#e53935' }]}><Text style={styles.badgeText}>VOIDED</Text></View>
                ) : item.status === 'REVERSED' ? (
                  <View style={[styles.badge, { backgroundColor: '#f59e0b' }]}><Text style={styles.badgeText}>REVERSED</Text></View>
                ) : item.status === 'REVERSAL' ? (
                  <View style={[styles.badge, { backgroundColor: '#e53935' }]}><Text style={styles.badgeText}>REVERSAL</Text></View>
                ) : (
                  <View style={[styles.badge, { backgroundColor: PM_COLORS[item.payment_method] ?? '#888' }]}>
                    <Text style={styles.badgeText}>{item.payment_method}</Text>
                  </View>
                )}
                {item.status === 'PAID' && (item.sale_cogs ?? 0) > 0 && (() => {
                  const revExVAT = item.total - item.tax_amount;
                  const profit = revExVAT - (item.sale_cogs ?? 0);
                  const pct = revExVAT > 0 ? (profit / revExVAT) * 100 : 0;
                  const color = pct >= 0 ? '#22c55e' : '#e53935';
                  return (
                    <Text style={{ fontSize: 11, color, fontWeight: '700', marginTop: 2 }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% margin
                    </Text>
                  );
                })()}
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sales found for this period.</Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={!!selected} onDismiss={() => setSelected(null)}>
          <Dialog.Title>Receipt — {selected?.invoice_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.receiptDate}>{dayjs(selected?.created_at).format('D MMM YYYY, HH:mm')}</Text>
            {selected?.customer_name && <Text style={styles.receiptCustomer}>Customer: {selected.customer_name}</Text>}

            <Divider style={{ marginVertical: 10 }} />

            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Item</DataTable.Title>
                <DataTable.Title numeric>Qty</DataTable.Title>
                <DataTable.Title numeric>Total</DataTable.Title>
                {hasCostData && <DataTable.Title numeric>Margin</DataTable.Title>}
              </DataTable.Header>
              {(detail?.items ?? []).map((item, i) => {
                const vatF = item.vat_rate / 100;
                const itemRevExVAT = item.total / (1 + vatF);
                const itemCOGS = (item.cost_price / (1 + vatF)) * item.qty;
                const itemProfit = itemRevExVAT - itemCOGS;
                const itemPct = item.cost_price > 0 && itemRevExVAT > 0
                  ? (itemProfit / itemRevExVAT) * 100 : null;
                return (
                  <DataTable.Row key={i}>
                    <DataTable.Cell>{item.product_name}</DataTable.Cell>
                    <DataTable.Cell numeric>{item.qty}</DataTable.Cell>
                    <DataTable.Cell numeric>KES {item.total.toFixed(0)}</DataTable.Cell>
                    {hasCostData && (
                      <DataTable.Cell numeric>
                        {itemPct !== null
                          ? <Text style={{ fontSize: 12, color: itemPct >= 0 ? '#22c55e' : '#e53935', fontWeight: '700' }}>
                              {itemPct >= 0 ? '+' : ''}{itemPct.toFixed(1)}%
                            </Text>
                          : <Text style={{ fontSize: 12, color: '#aaa' }}>—</Text>}
                      </DataTable.Cell>
                    )}
                  </DataTable.Row>
                );
              })}
            </DataTable>

            <Divider style={{ marginVertical: 10 }} />

            <View style={styles.receiptTotals}>
              <View style={styles.rRow}><Text style={styles.rLabel}>Subtotal</Text><Text>KES {selected?.subtotal.toFixed(0)}</Text></View>
              <View style={styles.rRow}><Text style={styles.rLabel}>VAT</Text><Text>KES {selected?.tax_amount.toFixed(0)}</Text></View>
              {(selected?.discount ?? 0) > 0 && (
                <View style={styles.rRow}><Text style={styles.rLabel}>Discount</Text><Text style={{ color: '#e53935' }}>-KES {selected?.discount}</Text></View>
              )}
              <View style={[styles.rRow, { marginTop: 4 }]}>
                <Text style={styles.grandLabel}>TOTAL</Text>
                <Text style={styles.grandVal}>KES {selected?.total.toFixed(0)}</Text>
              </View>
              <View style={styles.rRow}>
                <Text style={styles.rLabel}>Payment</Text>
                <Text style={{ fontWeight: '600', color: PM_COLORS[selected?.payment_method ?? ''] ?? '#333' }}>{selected?.payment_method}</Text>
              </View>
              {selected?.mpesa_ref && (
                <View style={styles.rRow}><Text style={styles.rLabel}>Ref</Text><Text>{selected.mpesa_ref}</Text></View>
              )}
              {hasCostData && selected?.status === 'PAID' && (
                <>
                  <Divider style={{ marginVertical: 8 }} />
                  <View style={styles.rRow}>
                    <Text style={styles.rLabel}>Revenue (excl. VAT)</Text>
                    <Text style={{ fontSize: 13, color: C.text }}>KES {detailRevExVAT.toFixed(0)}</Text>
                  </View>
                  <View style={styles.rRow}>
                    <Text style={styles.rLabel}>Est. Cost (excl. VAT)</Text>
                    <Text style={{ fontSize: 13, color: '#e53935' }}>-KES {detailCOGS.toFixed(0)}</Text>
                  </View>
                  <View style={[styles.rRow, { marginTop: 2 }]}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Gross Profit</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: detailProfit >= 0 ? '#22c55e' : '#e53935' }}>
                      {detailProfit < 0 ? '-' : ''}KES {Math.abs(detailProfit).toFixed(0)}
                      {'  '}<Text style={{ fontSize: 12, fontWeight: '600' }}>
                        ({detailMarginPct >= 0 ? '+' : ''}{detailMarginPct.toFixed(1)}%)
                      </Text>
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            {selected?.status === 'PAID' && selected.payment_method === 'CREDIT' && selected.customer_id && (
              <Button
                textColor="#6f67ff"
                icon="cash-plus"
                onPress={() => setRepayDialogOpen(true)}
              >
                Record Payment
              </Button>
            )}
            {selected?.status === 'PAID' && user?.role === 'ADMIN' && (
              <Button textColor="#f59e0b" onPress={() => setReverseDialogOpen(true)}>
                Reverse
              </Button>
            )}
            {selected?.status === 'PAID' && user?.role === 'ADMIN' && (
              <Button textColor="#e53935" onPress={() => handleVoid(selected!)} loading={voidMutation.isPending}>
                Void
              </Button>
            )}
            <Button onPress={() => setSelected(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Credit repayment dialog */}
        <Dialog visible={repayDialogOpen} onDismiss={() => setRepayDialogOpen(false)} style={{ backgroundColor: C.surface }}>
          <Dialog.Title style={{ color: C.text }}>Record Payment</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: C.muted, marginBottom: 12 }}>
              Paying against invoice {selected?.invoice_no} for {selected?.customer_name}
            </Text>
            <TextInput
              label="Amount (KES)"
              value={repayAmount}
              onChangeText={setRepayAmount}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 10 }}
            />
            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Payment Method</Text>
            <RadioButton.Group value={repayMethod} onValueChange={v => setRepayMethod(v as RepayPM)}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {REPAY_METHODS.map(m => (
                  <Chip
                    key={m}
                    selected={repayMethod === m}
                    onPress={() => setRepayMethod(m)}
                    style={repayMethod === m ? { backgroundColor: '#6f67ff22' } : {}}
                    textStyle={repayMethod === m ? { color: '#6f67ff' } : {}}
                  >
                    {m}
                  </Chip>
                ))}
              </View>
            </RadioButton.Group>
            {repayMethod === 'MPESA' && (
              <TextInput
                label="M-Pesa Reference"
                value={repayMpesaRef}
                onChangeText={setRepayMpesaRef}
                mode="outlined"
                autoCapitalize="characters"
                style={{ marginBottom: 10 }}
              />
            )}
            <TextInput
              label="Note (optional)"
              value={repayNote}
              onChangeText={setRepayNote}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRepayDialogOpen(false)} textColor={C.muted}>Cancel</Button>
            <Button
              onPress={handleRepaySubmit}
              loading={repayMutation.isPending}
              disabled={repayMutation.isPending}
              textColor="#6f67ff"
            >
              Save Payment
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reversal reason dialog */}
        <Dialog visible={reverseDialogOpen} onDismiss={() => { setReverseDialogOpen(false); setReverseReason(''); }}>
          <Dialog.Title>Reverse Sale — {selected?.invoice_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              A reversal creates a new negative transaction ({`REV-${selected?.invoice_no}`}) that cancels this sale in the books and restores stock. The original record is preserved for audit.
            </Text>
            <TextInput
              label="Reason (e.g. Customer return, Error)"
              value={reverseReason}
              onChangeText={setReverseReason}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setReverseDialogOpen(false); setReverseReason(''); }}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor="#f59e0b"
              loading={reverseMutation.isPending}
              onPress={() => {
                if (!reverseReason.trim()) { Alert.alert('Reason Required', 'Enter a reason for the reversal.'); return; }
                reverseMutation.mutate({ saleId: selected!.id, reason: reverseReason.trim() });
              }}
            >
              Confirm Reversal
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
    presets: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
    presetChip: { backgroundColor: C.elevated },
    summary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
    summaryCount: { fontSize: 13, color: C.muted },
    summaryTotal: { fontSize: 15, fontWeight: '800', color: C.accent },
    list: { paddingHorizontal: 12, paddingBottom: 24 },
    card: { marginBottom: 8, borderRadius: 10 },
    cardRow: { flexDirection: 'row', alignItems: 'center' },
    invoiceNo: { fontSize: 14, fontWeight: '700', color: C.text },
    time: { fontSize: 12, color: C.muted, marginTop: 2 },
    customer: { fontSize: 12, color: C.muted, marginTop: 2 },
    total: { fontSize: 15, fontWeight: '800', color: C.accent },
    pmChip: { marginTop: 4, height: 22 },
    pmText: { fontSize: 10, fontWeight: '700' },
    badge: { marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
    badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { color: C.muted },
    receiptDate: { fontSize: 13, color: C.muted, marginBottom: 2 },
    receiptCustomer: { fontSize: 13, color: C.text, marginBottom: 4 },
    receiptTotals: { marginTop: 4 },
    rRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    rLabel: { color: C.muted, fontSize: 13 },
    grandLabel: { fontSize: 15, fontWeight: '800', color: C.text },
    grandVal: { fontSize: 15, fontWeight: '800', color: C.accent },
  });
}
