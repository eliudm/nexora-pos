import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, TextInput, FAB, Chip, Divider, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { poQueries, POItem, PurchaseOrder } from '../../src/db/purchase_orders';
import { supplierQueries, Supplier } from '../../src/db/suppliers';
import { productQueries, Product } from '../../src/db/products';
import { vendorBillQueries } from '../../src/db/vendor_bills';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

type StatusFilter = 'ALL' | 'PENDING' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', RECEIVED: '#22c55e', PARTIAL: '#3b82f6', CANCELLED: '#9ca3af',
};

export default function PurchaseOrdersScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [createVisible, setCreateVisible] = useState(false);
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [poItems, setPoItems] = useState<Omit<POItem, 'id' | 'po_id'>[]>([]);
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveCounts, setReceiveCounts] = useState<Record<number, string>>({});

  const { data: orders } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => poQueries.getAll(100),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', supplierSearch],
    queryFn: () => supplierQueries.getAll(supplierSearch),
    enabled: supplierPickerOpen,
  });

  const { data: products } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () => productQueries.getAll(productSearch),
    enabled: productPickerOpen,
  });

  const filteredOrders = (orders ?? []).filter(
    (o) => statusFilter === 'ALL' || o.status === statusFilter,
  );

  const pendingCount = (orders ?? []).filter((o) => o.status === 'PENDING' || o.status === 'PARTIAL').length;

  const createMutation = useMutation({
    mutationFn: () => poQueries.create(poItems, {
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      notes: notes.trim() || undefined,
      expectedDate: expectedDate.trim() || undefined,
      cashierId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCreateVisible(false);
      setPoItems([]);
      setSupplier(null);
      setNotes('');
      setExpectedDate('');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!detailPo) return;
      const received = Object.entries(receiveCounts)
        .map(([itemId, qty]) => ({ itemId: parseInt(itemId), qtyReceived: parseFloat(qty) || 0 }))
        .filter((r) => r.qtyReceived > 0);
      if (received.length === 0) throw new Error('Enter at least one received quantity');
      await poQueries.receive(detailPo.id, received, user?.id);
      // Auto-create vendor bill for the PO amount owed to supplier
      await vendorBillQueries.createFromPO(
        detailPo.id, detailPo.po_no,
        detailPo.supplier_id ?? null, detailPo.supplier_name ?? null,
        detailPo.total_amount, user?.id ?? null,
      );
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['vendor-bills'] });
      qc.invalidateQueries({ queryKey: ['vendor-bills-summary'] });
      setReceiveVisible(false);
      setReceiveCounts({});
      const updated = await poQueries.getById(detailPo!.id);
      setDetailPo(updated);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (poId: number) => poQueries.cancel(poId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setDetailPo(null);
    },
  });

  const addProductToOrder = (product: Product) => {
    setPoItems((prev) => {
      if (prev.find((i) => i.product_id === product.id)) return prev;
      return [...prev, {
        product_id: product.id, product_name: product.name,
        qty_ordered: 1, qty_received: 0,
        unit_cost: product.cost || product.price,
        total_cost: product.cost || product.price,
      }];
    });
    setProductPickerOpen(false);
    setProductSearch('');
  };

  const updatePoItemQty = (idx: number, qty: number) =>
    setPoItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, qty_ordered: qty, total_cost: qty * item.unit_cost } : item,
    ));

  const updatePoItemCost = (idx: number, cost: number) =>
    setPoItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, unit_cost: cost, total_cost: item.qty_ordered * cost } : item,
    ));

  const openDetail = async (po: PurchaseOrder) => {
    const full = await poQueries.getById(po.id);
    setDetailPo(full);
  };

  const startReceive = () => {
    const counts: Record<number, string> = {};
    (detailPo?.items ?? []).forEach((i) => {
      const remaining = i.qty_ordered - i.qty_received;
      counts[i.id] = remaining > 0 ? String(remaining) : '0';
    });
    setReceiveCounts(counts);
    setReceiveVisible(true);
  };

  const confirmCancel = (po: PurchaseOrder) => {
    Alert.alert(
      'Cancel Order?',
      `Cancel ${po.po_no}? This cannot be undone.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Cancel Order', style: 'destructive', onPress: () => cancelMutation.mutate(po.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Purchase Orders" titleStyle={styles.headerTitle} />
        {pendingCount > 0 && (
          <Chip compact style={{ backgroundColor: '#f59e0b', marginRight: 8 }} textStyle={{ color: '#fff', fontSize: 11 }}>
            {pendingCount} pending
          </Chip>
        )}
      </Appbar.Header>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {(['ALL', 'PENDING', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as StatusFilter[]).map((s) => (
          <Chip
            key={s}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            style={[styles.filterChip, statusFilter === s && { backgroundColor: s === 'ALL' ? C.accent : STATUS_COLORS[s] }]}
            textStyle={[styles.filterText, statusFilter === s && { color: '#fff', fontWeight: '700' }]}
            compact
          >
            {s === 'ALL' ? `All (${(orders ?? []).length})` : s}
          </Chip>
        ))}
      </ScrollView>

      <FlatList
        data={filteredOrders}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => openDetail(item)}>
            <Card.Content>
              <View style={styles.poRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.poNo}>{item.po_no}</Text>
                  <Text style={styles.poSupplier}>{item.supplier_name ?? 'No supplier'}</Text>
                  <View style={styles.poMeta}>
                    <Text style={styles.poDate}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
                    {item.expected_date && (
                      <Text style={[styles.poDate, { color: dayjs(item.expected_date).isBefore(dayjs()) && item.status === 'PENDING' ? '#e53935' : C.muted }]}>
                        {' · Due '}{dayjs(item.expected_date).format('D MMM')}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Chip compact style={{ backgroundColor: STATUS_COLORS[item.status] + '30' }} textStyle={{ color: STATUS_COLORS[item.status], fontSize: 11, fontWeight: '700' }}>
                    {item.status}
                  </Chip>
                  <Text style={styles.poAmount}>KES {item.total_amount.toLocaleString()}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="file-document-outline" size={48} color={C.border} />
            <Text style={styles.emptyText}>
              {statusFilter === 'ALL' ? 'No purchase orders yet' : `No ${statusFilter.toLowerCase()} orders`}
            </Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={() => setCreateVisible(true)} color="#fff" />

      <Portal>
        {/* Create PO Dialog */}
        <Dialog visible={createVisible} onDismiss={() => setCreateVisible(false)} style={styles.dialog}>
          <Dialog.Title>New Purchase Order</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <Button mode="outlined" icon="truck" onPress={() => setSupplierPickerOpen(true)} style={styles.input}>
                {supplier ? supplier.name : 'Select Supplier (optional)'}
              </Button>

              <View style={styles.row}>
                <TextInput
                  label="Expected Date (YYYY-MM-DD)"
                  value={expectedDate}
                  onChangeText={setExpectedDate}
                  mode="outlined"
                  style={{ flex: 1 }}
                  placeholder="2025-01-31"
                />
              </View>

              <TextInput label="Notes" value={notes} onChangeText={setNotes} mode="outlined" style={[styles.input, { marginTop: 8 }]} />
              <Divider style={{ marginVertical: 10 }} />

              <Text style={styles.sectionLabel}>Order Items</Text>
              {poItems.map((item, idx) => (
                <View key={idx} style={styles.poItemRow}>
                  <Text style={{ flex: 1, fontSize: 13, color: C.text }} numberOfLines={1}>{item.product_name}</Text>
                  <TextInput
                    value={String(item.qty_ordered)}
                    onChangeText={(v) => updatePoItemQty(idx, parseFloat(v) || 1)}
                    keyboardType="decimal-pad"
                    style={[styles.poItemInput, { width: 60 }]}
                    mode="outlined"
                    dense
                    label="Qty"
                  />
                  <TextInput
                    value={String(item.unit_cost)}
                    onChangeText={(v) => updatePoItemCost(idx, parseFloat(v) || 0)}
                    keyboardType="decimal-pad"
                    style={[styles.poItemInput, { width: 80 }]}
                    mode="outlined"
                    dense
                    label="Cost"
                  />
                  <IconButton icon="delete" size={18} iconColor={C.danger} onPress={() => setPoItems((p) => p.filter((_, i) => i !== idx))} />
                </View>
              ))}

              <Button mode="outlined" icon="plus" onPress={() => setProductPickerOpen(true)} style={{ marginTop: 8 }}>
                Add Product
              </Button>
              {poItems.length > 0 && (
                <Text style={styles.poTotal}>
                  Total: KES {poItems.reduce((s, i) => s + i.total_cost, 0).toLocaleString()}
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={poItems.length === 0}
            >
              Create PO
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* PO Detail Dialog */}
        <Dialog visible={!!detailPo} onDismiss={() => setDetailPo(null)} style={styles.dialog}>
          <Dialog.Title>{detailPo?.po_no}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.detailHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailMeta}>
                    <Text style={{ fontWeight: '700' }}>Supplier: </Text>
                    {detailPo?.supplier_name ?? 'N/A'}
                  </Text>
                  <Text style={styles.detailMeta}>
                    <Text style={{ fontWeight: '700' }}>Ordered: </Text>
                    {dayjs(detailPo?.created_at).format('D MMM YYYY HH:mm')}
                  </Text>
                  {detailPo?.expected_date && (
                    <Text style={styles.detailMeta}>
                      <Text style={{ fontWeight: '700' }}>Expected: </Text>
                      {dayjs(detailPo.expected_date).format('D MMM YYYY')}
                    </Text>
                  )}
                  {detailPo?.received_at && (
                    <Text style={styles.detailMeta}>
                      <Text style={{ fontWeight: '700' }}>Received: </Text>
                      {dayjs(detailPo.received_at).format('D MMM YYYY HH:mm')}
                    </Text>
                  )}
                  {detailPo?.notes && (
                    <Text style={[styles.detailMeta, { marginTop: 4, fontStyle: 'italic' }]}>{detailPo.notes}</Text>
                  )}
                </View>
                <Chip
                  compact
                  style={{ backgroundColor: STATUS_COLORS[detailPo?.status ?? 'PENDING'] + '20', alignSelf: 'flex-start' }}
                  textStyle={{ color: STATUS_COLORS[detailPo?.status ?? 'PENDING'], fontWeight: '700' }}
                >
                  {detailPo?.status}
                </Chip>
              </View>

              <Divider style={{ marginVertical: 8 }} />

              <View style={styles.detailItemHeader}>
                <Text style={[styles.detailItemLabel, { flex: 1 }]}>Product</Text>
                <Text style={[styles.detailItemLabel, { width: 80, textAlign: 'center' }]}>Rcvd/Ord</Text>
                <Text style={[styles.detailItemLabel, { width: 70, textAlign: 'right' }]}>Unit Cost</Text>
              </View>

              {(detailPo?.items ?? []).map((item) => {
                const fully = item.qty_received >= item.qty_ordered;
                return (
                  <View key={item.id} style={styles.detailItemRow}>
                    <Text style={{ flex: 1, fontSize: 13, color: C.text }} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={[styles.detailItemQty, { color: fully ? '#22c55e' : C.muted }]}>
                      {item.qty_received}/{item.qty_ordered}
                    </Text>
                    <Text style={styles.detailItemCost}>KES {item.unit_cost.toLocaleString()}</Text>
                  </View>
                );
              })}

              <View style={[styles.detailItemRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }}>Total</Text>
                <Text style={[styles.detailItemCost, { fontWeight: '700', color: C.accent }]}>
                  KES {detailPo?.total_amount.toLocaleString()}
                </Text>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ flexWrap: 'wrap', gap: 4 }}>
            <Button onPress={() => setDetailPo(null)}>Close</Button>
            {(detailPo?.status === 'RECEIVED' || detailPo?.status === 'PARTIAL') && (
              <Button icon="file-invoice" onPress={() => { setDetailPo(null); router.push('/vendor-bills'); }}>
                View Bill
              </Button>
            )}
            {detailPo?.status !== 'RECEIVED' && detailPo?.status !== 'CANCELLED' && (
              <>
                <Button
                  textColor={C.danger}
                  onPress={() => { setDetailPo(null); confirmCancel(detailPo!); }}
                >
                  Cancel Order
                </Button>
                <Button mode="contained" icon="package-down" onPress={startReceive}>
                  Receive Stock
                </Button>
              </>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Receive Stock Dialog */}
        <Dialog visible={receiveVisible} onDismiss={() => setReceiveVisible(false)}>
          <Dialog.Title>Receive Stock — {detailPo?.po_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.receiveNote}>
              Enter quantities received. Product costs will update and a Vendor Bill will be created automatically for payment tracking.
            </Text>
          </Dialog.Content>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 360 }}>
              {(detailPo?.items ?? []).map((item) => {
                const remaining = item.qty_ordered - item.qty_received;
                return (
                  <View key={item.id} style={styles.receiveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: C.text }} numberOfLines={1}>{item.product_name}</Text>
                      <Text style={{ fontSize: 11, color: C.muted }}>
                        Cost: KES {item.unit_cost} · Remaining: {remaining}
                      </Text>
                    </View>
                    <TextInput
                      value={receiveCounts[item.id] ?? '0'}
                      onChangeText={(v) => setReceiveCounts((c) => ({ ...c, [item.id]: v }))}
                      keyboardType="decimal-pad"
                      style={[styles.poItemInput, { width: 70 }]}
                      mode="outlined"
                      dense
                      label="Qty"
                    />
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setReceiveVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => receiveMutation.mutate()} loading={receiveMutation.isPending}>
              Confirm Receipt
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Supplier Picker */}
        <Dialog visible={supplierPickerOpen} onDismiss={() => setSupplierPickerOpen(false)}>
          <Dialog.Title>Select Supplier</Dialog.Title>
          <Dialog.Content>
            <TextInput
              placeholder="Search suppliers..."
              value={supplierSearch}
              onChangeText={setSupplierSearch}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            {(suppliers ?? []).map((s) => (
              <Chip key={s.id} onPress={() => { setSupplier(s); setSupplierPickerOpen(false); setSupplierSearch(''); }} style={{ marginBottom: 6 }}>
                {s.name}{s.phone ? ` · ${s.phone}` : ''}
              </Chip>
            ))}
            {(suppliers ?? []).length === 0 && supplierSearch.length > 0 && (
              <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 12 }}>No suppliers found</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSupplierPickerOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product Picker */}
        <Dialog visible={productPickerOpen} onDismiss={() => setProductPickerOpen(false)}>
          <Dialog.Title>Add Product to Order</Dialog.Title>
          <Dialog.Content>
            <TextInput
              placeholder="Search products..."
              value={productSearch}
              onChangeText={setProductSearch}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            {(products ?? []).slice(0, 10).map((p) => (
              <Chip
                key={p.id}
                onPress={() => addProductToOrder(p)}
                style={{ marginBottom: 6 }}
                disabled={!!poItems.find((i) => i.product_id === p.id)}
              >
                {p.name} — Cost: KES {p.cost || 0}
              </Chip>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setProductPickerOpen(false)}>Cancel</Button>
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
    filterScroll: { maxHeight: 44 },
    filterContent: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
    filterChip: { backgroundColor: C.elevated },
    filterText: { fontSize: 12 },
    list: { padding: 12, gap: 8, paddingBottom: 80 },
    card: { borderRadius: 10 },
    poRow: { flexDirection: 'row', alignItems: 'flex-start' },
    poNo: { fontSize: 14, fontWeight: '700', color: C.text },
    poSupplier: { fontSize: 12, color: C.muted, marginTop: 2 },
    poMeta: { flexDirection: 'row', marginTop: 2 },
    poDate: { fontSize: 11, color: C.muted },
    poAmount: { fontSize: 14, fontWeight: '700', color: C.accent },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: C.muted, marginTop: 8, fontSize: 14 },
    fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: C.accent },
    dialog: { marginHorizontal: 8 },
    input: { marginBottom: 10 },
    row: { marginBottom: 10 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 8 },
    poItemRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    poItemInput: { flex: 0 },
    poTotal: { fontSize: 14, fontWeight: '700', color: C.accent, textAlign: 'right', marginTop: 10 },
    detailHeader: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    detailMeta: { fontSize: 13, color: C.muted, marginBottom: 3 },
    detailItemHeader: { flexDirection: 'row', paddingBottom: 4 },
    detailItemLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase' },
    detailItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    detailItemQty: { width: 80, fontSize: 12, textAlign: 'center' },
    detailItemCost: { width: 70, fontSize: 12, color: C.text, textAlign: 'right' },
    receiveNote: { fontSize: 12, color: C.muted, marginBottom: 8 },
    receiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  });
}
