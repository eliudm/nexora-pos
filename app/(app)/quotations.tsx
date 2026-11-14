import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, TextInput, FAB, Chip, Divider, IconButton, RadioButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { quotationQueries, Quotation } from '../../src/db/quotations';
import { productQueries, Product } from '../../src/db/products';
import { customerQueries, Customer } from '../../src/db/customers';
import { CartItem } from '../../src/db/sales';
import { useSession } from '../../src/context/session';
import { brand } from '../../src/theme';
import dayjs from 'dayjs';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#9ca3af', SENT: '#3b82f6', ACCEPTED: '#22c55e',
  EXPIRED: '#f59e0b', CONVERTED: '#1db8a0',
};

export default function QuotationsScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const [createVisible, setCreateVisible] = useState(false);
  const [detailQuote, setDetailQuote] = useState<Quotation | null>(null);
  const [convertVisible, setConvertVisible] = useState(false);
  const [convertPayMethod, setConvertPayMethod] = useState('CASH');

  // Create form
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [validDays, setValidDays] = useState('7');
  const [note, setNote] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const { data: quotes } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => quotationQueries.getAll(50),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', customerSearch],
    queryFn: () => customerQueries.getAll(customerSearch),
    enabled: customerPickerOpen,
  });

  const { data: products } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () => productQueries.getAll(productSearch),
    enabled: productPickerOpen,
  });

  const createMutation = useMutation({
    mutationFn: () => quotationQueries.create(items, {
      customerId: customer?.id,
      customerName: customer?.name,
      discount: parseFloat(discount) || 0,
      validDays: parseInt(validDays) || 7,
      note: note.trim() || undefined,
      cashierId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      setCreateVisible(false);
      setItems([]);
      setCustomer(null);
      setDiscount('');
      setNote('');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const convertMutation = useMutation({
    mutationFn: () => quotationQueries.convertToSale(detailQuote!.id, convertPayMethod, user?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setConvertVisible(false);
      setDetailQuote(null);
      Alert.alert('Converted', 'Quotation converted to sale successfully!');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const addProduct = (product: Product) => {
    setItems((prev) => {
      if (prev.find((i) => i.product_id === product.id)) return prev;
      const vatAmt = product.price * (product.vat_rate / 100);
      return [...prev, {
        product_id: product.id, product_name: product.name, qty: 1,
        unit_price: product.price, discount: 0, vat_rate: product.vat_rate,
        vat_amount: vatAmt, total: product.price + vatAmt,
      }];
    });
    setProductPickerOpen(false);
  };

  const updateQty = (productId: number, qty: number) => {
    setItems((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const vatAmt = i.unit_price * qty * (i.vat_rate / 100);
      return { ...i, qty, vat_amount: vatAmt, total: i.unit_price * qty + vatAmt };
    }));
  };

  const quoteTotal = items.reduce((s, i) => s + i.total, 0) - (parseFloat(discount) || 0);

  const openDetail = async (q: Quotation) => {
    const full = await quotationQueries.getById(q.id);
    setDetailQuote(full);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Quotations" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <FlatList
        data={quotes ?? []}
        keyExtractor={(q) => String(q.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => openDetail(item)}>
            <Card.Content style={styles.cardContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.quoteNo}>{item.quote_no}</Text>
                <Text style={styles.quoteCust}>{item.customer_name ?? 'Walk-in'}</Text>
                <Text style={styles.quoteDate}>{dayjs(item.created_at).format('D MMM YYYY')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Chip compact style={{ backgroundColor: STATUS_COLORS[item.status] + '25' }} textStyle={{ color: STATUS_COLORS[item.status], fontSize: 11, fontWeight: '700' }}>
                  {item.status}
                </Chip>
                <Text style={styles.quoteTotal}>KES {item.total.toLocaleString()}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="file-document-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No quotations yet</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={() => setCreateVisible(true)} color="#fff" />

      <Portal>
        {/* Create Quote */}
        <Dialog visible={createVisible} onDismiss={() => setCreateVisible(false)} style={styles.dialog}>
          <Dialog.Title>New Quotation</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <Button mode="outlined" icon="account" onPress={() => setCustomerPickerOpen(true)} style={styles.input}>
                {customer ? customer.name : 'Select Customer (optional)'}
              </Button>
              {items.map((item) => (
                <View key={item.product_id} style={styles.itemRow}>
                  <Text style={{ flex: 1, fontSize: 13 }}>{item.product_name}</Text>
                  <View style={styles.qtyRow}>
                    <Button compact onPress={() => updateQty(item.product_id, Math.max(1, item.qty - 1))}>−</Button>
                    <Text style={styles.qtyVal}>{item.qty}</Text>
                    <Button compact onPress={() => updateQty(item.product_id, item.qty + 1)}>+</Button>
                  </View>
                  <Text style={styles.itemTotal}>KES {item.total.toFixed(0)}</Text>
                  <IconButton icon="close" size={16} onPress={() => setItems((p) => p.filter((i) => i.product_id !== item.product_id))} />
                </View>
              ))}
              <Button mode="outlined" icon="plus" onPress={() => setProductPickerOpen(true)} style={{ marginVertical: 8 }}>
                Add Product
              </Button>
              <TextInput label="Discount (KES)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" mode="outlined" style={styles.input} />
              <TextInput label="Valid for (days)" value={validDays} onChangeText={setValidDays} keyboardType="numeric" mode="outlined" style={styles.input} />
              <TextInput label="Note" value={note} onChangeText={setNote} mode="outlined" multiline style={styles.input} />
              {items.length > 0 && (
                <Text style={styles.totalLine}>Total: KES {quoteTotal.toFixed(0)}</Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setCreateVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={items.length === 0}>
              Create Quote
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Quote Detail */}
        <Dialog visible={!!detailQuote} onDismiss={() => setDetailQuote(null)} style={styles.dialog}>
          <Dialog.Title>{detailQuote?.quote_no}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <Text style={styles.detailMeta}>Customer: {detailQuote?.customer_name ?? 'Walk-in'}</Text>
              <Text style={styles.detailMeta}>Valid until: {dayjs(detailQuote?.valid_until).format('D MMM YYYY')}</Text>
              <Chip compact style={{ alignSelf: 'flex-start', marginVertical: 8 }} textStyle={{ color: STATUS_COLORS[detailQuote?.status ?? 'DRAFT'], fontWeight: '700' }}>
                {detailQuote?.status}
              </Chip>
              <Divider />
              {(detailQuote?.items ?? []).map((item, idx) => (
                <View key={idx} style={styles.detailItem}>
                  <Text style={{ flex: 1, fontSize: 13 }}>{item.product_name}</Text>
                  <Text style={styles.detailQty}>{item.qty} × {item.unit_price}</Text>
                  <Text style={styles.detailTotal}>KES {item.total.toFixed(0)}</Text>
                </View>
              ))}
              {(detailQuote?.discount ?? 0) > 0 && (
                <Text style={styles.discountLine}>Discount: -KES {detailQuote?.discount}</Text>
              )}
              <Text style={styles.totalLine}>Total: KES {detailQuote?.total.toLocaleString()}</Text>
              {detailQuote?.note && <Text style={styles.detailNote}>{detailQuote.note}</Text>}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailQuote(null)}>Close</Button>
            {detailQuote?.status !== 'CONVERTED' && detailQuote?.status !== 'CANCELLED' && (
              <Button mode="contained" icon="arrow-right" onPress={() => setConvertVisible(true)}>
                Convert to Sale
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Convert to Sale */}
        <Dialog visible={convertVisible} onDismiss={() => setConvertVisible(false)}>
          <Dialog.Title>Convert to Sale</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#555', marginBottom: 12 }}>Select payment method for this sale:</Text>
            <RadioButton.Group value={convertPayMethod} onValueChange={setConvertPayMethod}>
              {['CASH', 'MPESA', 'CREDIT'].map((m) => (
                <RadioButton.Item key={m} label={m} value={m} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConvertVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => convertMutation.mutate()} loading={convertMutation.isPending}>
              Confirm Sale
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Picker */}
        <Dialog visible={customerPickerOpen} onDismiss={() => setCustomerPickerOpen(false)}>
          <Dialog.Title>Select Customer</Dialog.Title>
          <Dialog.Content>
            <TextInput placeholder="Search..." value={customerSearch} onChangeText={setCustomerSearch} mode="outlined" dense style={{ marginBottom: 8 }} />
            {(customers ?? []).slice(0, 6).map((c) => (
              <Chip key={c.id} onPress={() => { setCustomer(c); setCustomerPickerOpen(false); }} style={{ marginBottom: 4 }}>
                {c.name}
              </Chip>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCustomerPickerOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product Picker */}
        <Dialog visible={productPickerOpen} onDismiss={() => setProductPickerOpen(false)}>
          <Dialog.Title>Add Product</Dialog.Title>
          <Dialog.Content>
            <TextInput placeholder="Search..." value={productSearch} onChangeText={setProductSearch} mode="outlined" dense style={{ marginBottom: 8 }} />
            {(products ?? []).slice(0, 8).map((p) => (
              <Chip key={p.id} onPress={() => addProduct(p)} style={{ marginBottom: 4 }}>
                {p.name} — KES {p.price}
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
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  quoteNo: { fontSize: 14, fontWeight: '700', color: '#111' },
  quoteCust: { fontSize: 12, color: '#666', marginTop: 2 },
  quoteDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  quoteTotal: { fontSize: 14, fontWeight: '700', color: brand.primary },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#ccc', marginTop: 8, fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: brand.primary },
  dialog: { marginHorizontal: 8 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyVal: { fontSize: 14, fontWeight: '700', marginHorizontal: 4 },
  itemTotal: { fontSize: 13, fontWeight: '600', color: brand.primary, minWidth: 70, textAlign: 'right' },
  totalLine: { fontSize: 15, fontWeight: '700', color: brand.primary, textAlign: 'right', marginTop: 10 },
  discountLine: { fontSize: 13, color: '#e53935', textAlign: 'right', marginTop: 4 },
  detailMeta: { fontSize: 13, color: '#555', marginBottom: 4 },
  detailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailQty: { fontSize: 12, color: '#888', width: 80 },
  detailTotal: { fontSize: 13, fontWeight: '600', color: '#333', width: 70, textAlign: 'right' },
  detailNote: { fontSize: 12, color: '#777', fontStyle: 'italic', marginTop: 8 },
});
