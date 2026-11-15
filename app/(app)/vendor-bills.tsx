import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, TextInput, FAB, Chip, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vendorBillQueries, VendorBill } from '../../src/db/vendor_bills';
import { supplierQueries, Supplier } from '../../src/db/suppliers';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

type StatusFilter = 'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID';

const STATUS_COLORS: Record<string, string> = {
  UNPAID: '#e53935', PARTIAL: '#f59e0b', PAID: '#22c55e',
};

const PM_OPTIONS = ['CASH', 'MPESA', 'BANK', 'CHEQUE'];

export default function VendorBillsScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [detailBill, setDetailBill] = useState<VendorBill | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [payVisible, setPayVisible] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    supplierName: '',
    amount: '',
    dueDate: '',
    notes: '',
  });
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentMethod: 'CASH',
    reference: '',
    notes: '',
  });

  const { data: bills } = useQuery({
    queryKey: ['vendor-bills', statusFilter],
    queryFn: () => vendorBillQueries.getAll(statusFilter),
  });

  const { data: summary } = useQuery({
    queryKey: ['vendor-bills-summary'],
    queryFn: vendorBillQueries.getSummary,
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', supplierSearch],
    queryFn: () => supplierQueries.getAll(supplierSearch),
    enabled: supplierPickerOpen,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) throw new Error('Enter a valid amount');
      return vendorBillQueries.create({
        supplierId: selectedSupplier?.id ?? null,
        supplierName: selectedSupplier?.name ?? (form.supplierName.trim() || null),
        amount,
        dueDate: form.dueDate.trim() || undefined,
        notes: form.notes.trim() || undefined,
        cashierId: user?.id ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['vendor-bills-summary'] });
      setCreateVisible(false);
      setForm({ supplierName: '', amount: '', dueDate: '', notes: '' });
      setSelectedSupplier(null);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const payMutation = useMutation({
    mutationFn: () => {
      const amount = parseFloat(payForm.amount);
      if (!amount || amount <= 0) throw new Error('Enter a valid amount');
      return vendorBillQueries.recordPayment(detailBill!.id, {
        amount,
        paymentMethod: payForm.paymentMethod,
        reference: payForm.reference.trim() || undefined,
        notes: payForm.notes.trim() || undefined,
        cashierId: user?.id ?? null,
      });
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['vendor-bills-summary'] });
      setPayVisible(false);
      setPayForm({ amount: '', paymentMethod: 'CASH', reference: '', notes: '' });
      const updated = await vendorBillQueries.getById(detailBill!.id);
      setDetailBill(updated);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const openDetail = async (bill: VendorBill) => {
    const full = await vendorBillQueries.getById(bill.id);
    setDetailBill(full);
  };

  const startPay = () => {
    setPayForm({
      amount: String(detailBill?.balance ?? ''),
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    });
    setPayVisible(true);
  };

  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const isOverdue = (bill: VendorBill) =>
    bill.status !== 'PAID' && !!bill.due_date && dayjs(bill.due_date).isBefore(dayjs(), 'day');

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color="#fff" onPress={() => { }} />
        <Appbar.Content title="Vendor Bills" titleStyle={styles.headerTitle} />
        {(summary?.count_unpaid ?? 0) > 0 && (
          <Chip compact style={{ backgroundColor: '#e53935', marginRight: 8 }} textStyle={{ color: '#fff', fontSize: 11 }}>
            {summary!.count_unpaid} unpaid
          </Chip>
        )}
      </Appbar.Header>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryVal, { color: '#e53935' }]}>{fmt(summary?.total_outstanding ?? 0)}</Text>
          <Text style={styles.summaryLabel}>Outstanding</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftWidth: 1, borderLeftColor: C.border }]}>
          <Text style={[styles.summaryVal, { color: '#f59e0b' }]}>{fmt(summary?.total_overdue ?? 0)}</Text>
          <Text style={styles.summaryLabel}>Overdue</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftWidth: 1, borderLeftColor: C.border }]}>
          <Text style={[styles.summaryVal, { color: '#22c55e' }]}>{fmt(summary?.total_paid_month ?? 0)}</Text>
          <Text style={styles.summaryLabel}>Paid This Month</Text>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {(['ALL', 'UNPAID', 'PARTIAL', 'PAID'] as StatusFilter[]).map((s) => (
          <Chip
            key={s}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            style={[styles.filterChip, statusFilter === s && { backgroundColor: s === 'ALL' ? C.accent : STATUS_COLORS[s] }]}
            textStyle={[{ fontSize: 12 }, statusFilter === s && { color: '#fff', fontWeight: '700' }]}
            compact
          >
            {s}
          </Chip>
        ))}
      </ScrollView>

      <FlatList
        data={bills ?? []}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const overdue = isOverdue(item);
          return (
            <Card style={[styles.card, overdue && styles.cardOverdue]} onPress={() => openDetail(item)}>
              <Card.Content>
                <View style={styles.billRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.billTopRow}>
                      <Text style={styles.billNo}>{item.bill_no}</Text>
                      {item.po_no && <Text style={styles.billPo}>· {item.po_no}</Text>}
                    </View>
                    <Text style={styles.billSupplier}>{item.supplier_name ?? 'No supplier'}</Text>
                    <View style={styles.billMeta}>
                      <Text style={styles.billDate}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
                      {item.due_date && (
                        <Text style={[styles.billDate, overdue && { color: '#e53935', fontWeight: '700' }]}>
                          {' · Due '}{dayjs(item.due_date).format('D MMM')}{overdue ? ' ⚠' : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Chip compact style={{ backgroundColor: STATUS_COLORS[item.status] + '25' }} textStyle={{ color: STATUS_COLORS[item.status], fontSize: 11, fontWeight: '700' }}>
                      {item.status}
                    </Chip>
                    <Text style={styles.billAmount}>{fmt(item.amount)}</Text>
                    {item.balance < item.amount && (
                      <Text style={styles.billBalance}>Bal: {fmt(item.balance)}</Text>
                    )}
                  </View>
                </View>
              </Card.Content>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={48} color={C.border} />
            <Text style={styles.emptyText}>No vendor bills yet</Text>
            <Text style={styles.emptyHint}>Bills are created when you receive a purchase order, or manually with the + button</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={() => setCreateVisible(true)} color="#fff" />

      <Portal>
        {/* Bill Detail */}
        <Dialog visible={!!detailBill} onDismiss={() => setDetailBill(null)} style={styles.dialog}>
          <Dialog.Title>{detailBill?.bill_no}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 480 }}>
              <View style={styles.detailMetas}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.meta}><Text style={styles.metaKey}>Supplier: </Text>{detailBill?.supplier_name ?? 'N/A'}</Text>
                  {detailBill?.po_no && <Text style={styles.meta}><Text style={styles.metaKey}>PO: </Text>{detailBill.po_no}</Text>}
                  <Text style={styles.meta}><Text style={styles.metaKey}>Issued: </Text>{dayjs(detailBill?.created_at).format('D MMM YYYY')}</Text>
                  {detailBill?.due_date && (
                    <Text style={[styles.meta, isOverdue(detailBill!) && { color: '#e53935' }]}>
                      <Text style={[styles.metaKey, isOverdue(detailBill!) && { color: '#e53935' }]}>Due: </Text>
                      {dayjs(detailBill.due_date).format('D MMM YYYY')}{isOverdue(detailBill!) ? ' — OVERDUE' : ''}
                    </Text>
                  )}
                  {detailBill?.notes && <Text style={[styles.meta, { fontStyle: 'italic' }]}>{detailBill.notes}</Text>}
                </View>
                <Chip compact style={{ backgroundColor: STATUS_COLORS[detailBill?.status ?? 'UNPAID'] + '20', alignSelf: 'flex-start' }} textStyle={{ color: STATUS_COLORS[detailBill?.status ?? 'UNPAID'], fontWeight: '700' }}>
                  {detailBill?.status}
                </Chip>
              </View>

              <Divider style={{ marginVertical: 10 }} />

              <View style={styles.amtRow}><Text style={styles.amtLabel}>Bill Amount</Text><Text style={styles.amtVal}>{fmt(detailBill?.amount ?? 0)}</Text></View>
              <View style={styles.amtRow}><Text style={styles.amtLabel}>Total Paid</Text><Text style={[styles.amtVal, { color: '#22c55e' }]}>{fmt(detailBill?.amount_paid ?? 0)}</Text></View>
              <View style={[styles.amtRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 4 }]}>
                <Text style={[styles.amtLabel, { fontWeight: '700', color: C.text }]}>Balance Due</Text>
                <Text style={[styles.amtVal, { fontWeight: '800', color: (detailBill?.balance ?? 0) > 0 ? '#e53935' : '#22c55e', fontSize: 16 }]}>
                  {fmt(detailBill?.balance ?? 0)}
                </Text>
              </View>

              {(detailBill?.payments ?? []).length > 0 && (
                <>
                  <Divider style={{ marginVertical: 10 }} />
                  <Text style={styles.sectionLabel}>Payment History</Text>
                  {detailBill!.payments!.map((p) => (
                    <View key={p.id} style={styles.paymentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentAmt}>{fmt(p.amount)}</Text>
                        <Text style={styles.paymentMeta}>{p.payment_method}{p.reference ? ` · ${p.reference}` : ''}</Text>
                        {p.notes && <Text style={styles.paymentMeta}>{p.notes}</Text>}
                      </View>
                      <Text style={styles.paymentDate}>{dayjs(p.created_at).format('D MMM HH:mm')}</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailBill(null)}>Close</Button>
            {detailBill?.status !== 'PAID' && (
              <Button mode="contained" icon="cash" onPress={startPay}>
                Record Payment
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Record Payment */}
        <Dialog visible={payVisible} onDismiss={() => setPayVisible(false)}>
          <Dialog.Title>Record Payment — {detailBill?.bill_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              Balance due: {fmt(detailBill?.balance ?? 0)}
            </Text>
            <TextInput
              label="Amount (KES) *"
              value={payForm.amount}
              onChangeText={(v) => setPayForm((f) => ({ ...f, amount: v }))}
              keyboardType="decimal-pad"
              mode="outlined"
              style={styles.input}
            />
            <Text style={styles.sectionLabel}>Payment Method</Text>
            <View style={styles.pmRow}>
              {PM_OPTIONS.map((pm) => (
                <Chip
                  key={pm}
                  selected={payForm.paymentMethod === pm}
                  onPress={() => setPayForm((f) => ({ ...f, paymentMethod: pm }))}
                  compact
                  style={[styles.pmChip, payForm.paymentMethod === pm && { backgroundColor: C.accent }]}
                  textStyle={payForm.paymentMethod === pm ? { color: '#fff' } : undefined}
                >
                  {pm}
                </Chip>
              ))}
            </View>
            <TextInput
              label="Reference / Cheque No."
              value={payForm.reference}
              onChangeText={(v) => setPayForm((f) => ({ ...f, reference: v }))}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Notes"
              value={payForm.notes}
              onChangeText={(v) => setPayForm((f) => ({ ...f, notes: v }))}
              mode="outlined"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPayVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => payMutation.mutate()} loading={payMutation.isPending}>
              Record Payment
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Create Bill */}
        <Dialog visible={createVisible} onDismiss={() => setCreateVisible(false)} style={styles.dialog}>
          <Dialog.Title>New Vendor Bill</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 440 }}>
              <Button mode="outlined" icon="truck" onPress={() => setSupplierPickerOpen(true)} style={styles.input}>
                {selectedSupplier ? selectedSupplier.name : 'Select Supplier (optional)'}
              </Button>
              {!selectedSupplier && (
                <TextInput
                  label="Or enter supplier name"
                  value={form.supplierName}
                  onChangeText={(v) => setForm((f) => ({ ...f, supplierName: v }))}
                  mode="outlined"
                  style={styles.input}
                />
              )}
              <TextInput
                label="Bill Amount (KES) *"
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Due Date (YYYY-MM-DD)"
                value={form.dueDate}
                onChangeText={(v) => setForm((f) => ({ ...f, dueDate: v }))}
                mode="outlined"
                style={styles.input}
                placeholder="2025-02-28"
              />
              <TextInput
                label="Notes / Invoice Reference"
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                mode="outlined"
                style={styles.input}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Bill
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Supplier Picker */}
        <Dialog visible={supplierPickerOpen} onDismiss={() => setSupplierPickerOpen(false)}>
          <Dialog.Title>Select Supplier</Dialog.Title>
          <Dialog.Content>
            <TextInput placeholder="Search..." value={supplierSearch} onChangeText={setSupplierSearch} mode="outlined" dense style={{ marginBottom: 8 }} />
            {(suppliers ?? []).map((s) => (
              <Chip key={s.id} onPress={() => { setSelectedSupplier(s); setSupplierPickerOpen(false); setSupplierSearch(''); }} style={{ marginBottom: 6 }}>
                {s.name}{s.phone ? ` · ${s.phone}` : ''}
              </Chip>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSupplierPickerOpen(false)}>Cancel</Button>
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
    summaryRow: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
    summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    summaryVal: { fontSize: 16, fontWeight: '800' },
    summaryLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    filterScroll: { maxHeight: 44 },
    filterContent: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
    filterChip: { backgroundColor: C.elevated },
    list: { padding: 12, gap: 8, paddingBottom: 80 },
    card: { borderRadius: 10 },
    cardOverdue: { borderLeftWidth: 3, borderLeftColor: '#e53935' },
    billRow: { flexDirection: 'row', alignItems: 'flex-start' },
    billTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    billNo: { fontSize: 13, fontWeight: '700', color: C.text },
    billPo: { fontSize: 11, color: C.muted },
    billSupplier: { fontSize: 12, color: C.muted, marginTop: 2 },
    billMeta: { flexDirection: 'row', marginTop: 2 },
    billDate: { fontSize: 11, color: C.muted },
    billAmount: { fontSize: 14, fontWeight: '700', color: C.text },
    billBalance: { fontSize: 12, color: '#e53935', fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
    emptyText: { color: C.muted, marginTop: 8, fontSize: 14, fontWeight: '600' },
    emptyHint: { color: C.muted, marginTop: 6, fontSize: 12, textAlign: 'center', lineHeight: 18 },
    fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: C.accent },
    dialog: { marginHorizontal: 8 },
    input: { marginBottom: 10 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
    detailMetas: { flexDirection: 'row', gap: 8 },
    meta: { fontSize: 13, color: C.muted, marginBottom: 3 },
    metaKey: { fontWeight: '700', color: C.text },
    amtRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    amtLabel: { fontSize: 13, color: C.muted },
    amtVal: { fontSize: 14, fontWeight: '700', color: C.text },
    paymentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    paymentAmt: { fontSize: 13, fontWeight: '700', color: '#22c55e' },
    paymentMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
    paymentDate: { fontSize: 11, color: C.muted },
    pmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    pmChip: { backgroundColor: C.elevated },
  });
}
