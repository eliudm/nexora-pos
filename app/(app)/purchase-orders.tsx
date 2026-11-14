import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, TextInput, FAB, Chip, Divider, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { poQueries, POItem, PurchaseOrder } from '../../src/db/purchase_orders';
import { supplierQueries, Supplier } from '../../src/db/suppliers';
import { productQueries, Product } from '../../src/db/products';
import { useSession } from '../../src/context/session';
import { brand } from '../../src/theme';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', RECEIVED: '#22c55e', PARTIAL: '#3b82f6', CANCELLED: '#9ca3af',
};

export default function PurchaseOrdersScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const [createVisible, setCreateVisible] = useState(false);
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [poItems, setPoItems] = useState<Omit<POItem, 'id' | 'po_id'>[]>([]);
  const [notes, setNotes] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveCounts, setReceiveCounts] = useState<Record<number, string>>({});

  const { data: orders, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => poQueries.getAll(50),
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

  const createMutation = useMutation({
    mutationFn: () => poQueries.create(poItems, {
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      notes: notes.trim() || undefined,
      cashierId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCreateVisible(false);
      setPoItems([]);
      setSupplier(null);
      setNotes('');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!detailPo) return;
      const received = Object.entries(receiveCounts)
        .map(([itemId, qty]) => ({ itemId: parseInt(itemId), qtyReceived: parseFloat(qty) || 0 }))
        .filter((r) => r.qtyReceived > 0);
      await poQueries.receive(detailPo.id, received, user?.id);
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setReceiveVisible(false);
      setReceiveCounts({});
      const updated = await poQueries.getById(detailPo!.id);
      setDetailPo(updated);
    },
  });

  const addProductToOrder = (product: Product) => {
    setPoItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev;
      return [...prev, {
        product_id: product.id, product_name: product.name,
        qty_ordered: 1, qty_received: 0, unit_cost: product.cost || product.price, total_cost: product.cost || product.price,
      }];
    });
    setProductPickerOpen(false);
  };

  const updatePoItemQty = (idx: number, qty: number) => {
    setPoItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, qty_ordered: qty, total_cost: qty * item.unit_cost } : item,
    ));
  };

  const updatePoItemCost = (idx: number, cost: number) => {
    setPoItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, unit_cost: cost, total_cost: item.qty_ordered * cost } : item,
    ));
  };

  const openDetail = async (po: PurchaseOrder) => {
    const full = await poQueries.getById(po.id);
    setDetailPo(full);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Purchase Orders" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <FlatList
        data={orders ?? []}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => openDetail(item)}>
            <Card.Content>
              <View style={styles.poRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.poNo}>{item.po_no}</Text>
                  <Text style={styles.poSupplier}>{item.supplier_name ?? 'No supplier'}</Text>
                  <Text style={styles.poDate}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
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
            <MaterialCommunityIcons name="file-document-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No purchase orders yet</Text>
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
              <Button mode="outlined" icon="truck" onPress={() => setSupplierPickerOpen(true)} style={styles.supplierBtn}>
                {supplier ? supplier.name : 'Select Supplier (optional)'}
              </Button>
              <TextInput label="Notes" value={notes} onChangeText={setNotes} mode="outlined" style={styles.input} />
              <Divider style={{ marginVertical: 10 }} />
              <Text style={styles.sectionLabel}>Order Items</Text>
              {poItems.map((item, idx) => (
                <View key={idx} style={styles.poItemRow}>
                  <Text style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{item.product_name}</Text>
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
                  <IconButton icon="delete" size={18} onPress={() => setPoItems((p) => p.filter((_, i) => i !== idx))} />
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
            <Button mode="contained" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={poItems.length === 0}>
              Create PO
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* PO Detail Dialog */}
        <Dialog visible={!!detailPo} onDismiss={() => setDetailPo(null)} style={styles.dialog}>
          <Dialog.Title>{detailPo?.po_no}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <Text style={styles.detailMeta}>Supplier: {detailPo?.supplier_name ?? 'N/A'}</Text>
              <Text style={styles.detailMeta}>Date: {dayjs(detailPo?.created_at).format('D MMM YYYY HH:mm')}</Text>
              <Chip compact style={{ alignSelf: 'flex-start', marginVertical: 8, backgroundColor: STATUS_COLORS[detailPo?.status ?? 'PENDING'] + '20' }} textStyle={{ color: STATUS_COLORS[detailPo?.status ?? 'PENDING'], fontWeight: '700' }}>
                {detailPo?.status}
              </Chip>
              <Divider />
              {(detailPo?.items ?? []).map((item) => (
                <View key={item.id} style={styles.detailItemRow}>
                  <Text style={{ flex: 1, fontSize: 13 }}>{item.product_name}</Text>
                  <Text style={styles.detailItemQty}>{item.qty_received}/{item.qty_ordered}</Text>
                  <Text style={styles.detailItemCost}>KES {item.unit_cost}</Text>
                </View>
              ))}
              <Text style={styles.poTotal}>Total: KES {detailPo?.total_amount.toLocaleString()}</Text>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailPo(null)}>Close</Button>
            {detailPo?.status !== 'RECEIVED' && detailPo?.status !== 'CANCELLED' && (
              <Button mode="contained" icon="package-down" onPress={() => {
                const counts: Record<number, string> = {};
                (detailPo?.items ?? []).forEach((i) => { counts[i.id] = String(i.qty_ordered - i.qty_received); });
                setReceiveCounts(counts);
                setReceiveVisible(true);
              }}>
                Receive Stock
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Receive Stock Dialog */}
        <Dialog visible={receiveVisible} onDismiss={() => setReceiveVisible(false)}>
          <Dialog.Title>Receive Stock</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 400 }}>
              {(detailPo?.items ?? []).map((item) => (
                <View key={item.id} style={styles.receiveRow}>
                  <Text style={{ flex: 1, fontSize: 13 }}>{item.product_name}</Text>
                  <Text style={styles.receiveExpected}>Ordered: {item.qty_ordered}</Text>
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
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setReceiveVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => receiveMutation.mutate()} loading={receiveMutation.isPending}>Confirm Receipt</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Supplier Picker */}
        <Dialog visible={supplierPickerOpen} onDismiss={() => setSupplierPickerOpen(false)}>
          <Dialog.Title>Select Supplier</Dialog.Title>
          <Dialog.Content>
            <TextInput placeholder="Search..." value={supplierSearch} onChangeText={setSupplierSearch} mode="outlined" dense />
            {(suppliers ?? []).map((s) => (
              <Chip key={s.id} onPress={() => { setSupplier(s); setSupplierPickerOpen(false); }} style={{ marginTop: 8 }}>
                {s.name}
              </Chip>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSupplierPickerOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product Picker */}
        <Dialog visible={productPickerOpen} onDismiss={() => setProductPickerOpen(false)}>
          <Dialog.Title>Add Product</Dialog.Title>
          <Dialog.Content>
            <TextInput placeholder="Search products..." value={productSearch} onChangeText={setProductSearch} mode="outlined" dense style={{ marginBottom: 8 }} />
            {(products ?? []).slice(0, 8).map((p) => (
              <Chip key={p.id} onPress={() => addProductToOrder(p)} style={{ marginBottom: 4 }}>
                {p.name} — KES {p.cost || p.price}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  list: { padding: 12, gap: 8, paddingBottom: 80 },
  card: { borderRadius: 10 },
  poRow: { flexDirection: 'row', alignItems: 'center' },
  poNo: { fontSize: 14, fontWeight: '700', color: '#111' },
  poSupplier: { fontSize: 12, color: '#666', marginTop: 2 },
  poDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  poAmount: { fontSize: 14, fontWeight: '700', color: brand.primary },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#ccc', marginTop: 8, fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: brand.primary },
  dialog: { marginHorizontal: 8 },
  supplierBtn: { marginBottom: 10 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8 },
  poItemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  poItemInput: { backgroundColor: '#fff', flex: 0 },
  poTotal: { fontSize: 14, fontWeight: '700', color: brand.primary, textAlign: 'right', marginTop: 10 },
  detailMeta: { fontSize: 13, color: '#555', marginBottom: 4 },
  detailItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailItemQty: { fontSize: 12, color: '#888', width: 50, textAlign: 'center' },
  detailItemCost: { fontSize: 12, color: '#333', width: 70, textAlign: 'right' },
  receiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  receiveExpected: { fontSize: 11, color: '#888', width: 60 },
});
