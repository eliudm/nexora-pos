import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, Pressable, TextInput as RNTextInput } from 'react-native';
import { Text, Button, Appbar, Searchbar, Chip, FAB, Portal, Dialog, RadioButton, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { productQueries, Product } from '../../src/db/products';
import { salesQueries, CartItem } from '../../src/db/sales';
import { brand } from '../../src/theme';

const PAYMENT_METHODS = ['CASH', 'MPESA', 'CREDIT'] as const;
type PM = typeof PAYMENT_METHODS[number];

export default function POSScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [payMethod, setPayMethod] = useState<PM>('CASH');
  const [mpesaRef, setMpesaRef] = useState('');
  const [discount, setDiscount] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productQueries.getAll(search),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: productQueries.getCategories,
  });

  const mutation = useMutation({
    mutationFn: (vars: { items: CartItem[]; opts: Parameters<typeof salesQueries.create>[1] }) =>
      salesQueries.create(vars.items, vars.opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setCart([]);
      setCheckoutVisible(false);
      setMpesaRef('');
      setDiscount('');
      Alert.alert('Sale Complete', 'Transaction recorded successfully.');
    },
  });

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.unit_price * (1 + i.vat_rate / 100) }
            : i,
        );
      }
      const vatAmt = product.price * (product.vat_rate / 100);
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          qty: 1,
          unit_price: product.price,
          discount: 0,
          vat_rate: product.vat_rate,
          vat_amount: vatAmt,
          total: product.price + vatAmt,
        },
      ];
    });
  }, []);

  const removeFromCart = (productId: number) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) =>
      prev.map((i) =>
        i.product_id === productId
          ? { ...i, qty, vat_amount: i.unit_price * qty * (i.vat_rate / 100), total: i.unit_price * qty * (1 + i.vat_rate / 100) }
          : i,
      ),
    );
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const tax = cart.reduce((s, i) => s + i.vat_amount * i.qty, 0);
  const disc = parseFloat(discount) || 0;
  const total = subtotal + tax - disc;

  const filteredProducts = selectedCat
    ? (products ?? []).filter((p) => p.category_id === selectedCat)
    : products ?? [];

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutVisible(true);
  };

  const handleConfirmSale = () => {
    if (payMethod === 'MPESA' && !mpesaRef.trim()) {
      Alert.alert('M-Pesa Reference', 'Please enter the M-Pesa transaction code.');
      return;
    }
    mutation.mutate({
      items: cart,
      opts: { paymentMethod: payMethod, mpesaRef: mpesaRef.trim() || undefined, discount: disc },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Product Grid */}
        <View style={styles.left}>
          <Appbar.Header style={styles.header}>
            <Appbar.Content title="Point of Sale" titleStyle={styles.headerTitle} />
          </Appbar.Header>

          <Searchbar
            placeholder="Search products..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchbar}
            inputStyle={{ fontSize: 14 }}
          />

          {(categories?.length ?? 0) > 0 && (
            <FlatList
              data={[{ id: null, name: 'All', color: brand.primary }, ...(categories ?? [])]}
              keyExtractor={(c) => String(c.id)}
              horizontal
              style={styles.catList}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Chip
                  selected={selectedCat === item.id}
                  onPress={() => setSelectedCat(item.id as any)}
                  style={[styles.catChip, selectedCat === item.id && { backgroundColor: brand.primary }]}
                  textStyle={[styles.catText, selectedCat === item.id && { color: '#fff' }]}
                  compact
                >
                  {item.name}
                </Chip>
              )}
            />
          )}

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={brand.primary} />
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(p) => String(p.id)}
              numColumns={2}
              contentContainerStyle={styles.productGrid}
              columnWrapperStyle={{ gap: 10 }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.productCard, pressed && styles.productCardPressed]}
                  onPress={() => addToCart(item)}
                >
                  <MaterialCommunityIcons name="package-variant" size={32} color={brand.primary} />
                  <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.productPrice}>KES {item.price.toLocaleString()}</Text>
                  {item.track_stock === 1 && (
                    <Text style={[styles.stockBadge, item.stock_qty < 5 && styles.lowStock]}>
                      Stock: {item.stock_qty}
                    </Text>
                  )}
                </Pressable>
              )}
            />
          )}
        </View>

        {/* Cart */}
        <View style={styles.right}>
          <Text style={styles.cartTitle}>Cart ({cart.length})</Text>

          <FlatList
            data={cart}
            keyExtractor={(i) => String(i.product_id)}
            style={{ flex: 1 }}
            renderItem={({ item }) => (
              <View style={styles.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName} numberOfLines={1}>{item.product_name}</Text>
                  <Text style={styles.cartItemPrice}>KES {item.unit_price.toLocaleString()}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.product_id, item.qty - 1)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyVal}>{item.qty}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.product_id, item.qty + 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.cartItemTotal}>KES {item.total.toFixed(0)}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCart}>
                <MaterialCommunityIcons name="cart-outline" size={48} color="#ccc" />
                <Text style={styles.emptyCartText}>Cart is empty</Text>
              </View>
            }
          />

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalVal}>KES {subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT</Text>
              <Text style={styles.totalVal}>KES {tax.toFixed(0)}</Text>
            </View>
            {disc > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalVal, { color: '#e53935' }]}>-KES {disc}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandLabel}>TOTAL</Text>
              <Text style={styles.grandVal}>KES {total.toFixed(0)}</Text>
            </View>
          </View>

          <Button
            mode="contained"
            onPress={handleCheckout}
            disabled={cart.length === 0}
            style={styles.checkoutBtn}
            contentStyle={{ height: 50 }}
            labelStyle={{ fontSize: 16, fontWeight: '700' }}
          >
            Checkout
          </Button>
        </View>
      </View>

      <Portal>
        <Dialog visible={checkoutVisible} onDismiss={() => setCheckoutVisible(false)}>
          <Dialog.Title>Payment — KES {total.toFixed(0)}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12, fontWeight: '600' }}>Payment Method</Text>
            <RadioButton.Group value={payMethod} onValueChange={(v) => setPayMethod(v as PM)}>
              {PAYMENT_METHODS.map((m) => (
                <RadioButton.Item key={m} label={m} value={m} />
              ))}
            </RadioButton.Group>

            {payMethod === 'MPESA' && (
              <RNTextInput
                placeholder="M-Pesa Transaction Code"
                value={mpesaRef}
                onChangeText={setMpesaRef}
                style={styles.mpesaInput}
                autoCapitalize="characters"
              />
            )}

            <RNTextInput
              placeholder="Discount (KES)"
              value={discount}
              onChangeText={setDiscount}
              keyboardType="numeric"
              style={styles.mpesaInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCheckoutVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleConfirmSale}
              loading={mutation.isPending}
              disabled={mutation.isPending}
            >
              Confirm Sale
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flex: 1, flexDirection: 'row' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  left: { flex: 3, borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  right: { flex: 2, backgroundColor: '#fff', padding: 12 },
  searchbar: { margin: 10, elevation: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  catList: { maxHeight: 48 },
  catChip: { backgroundColor: '#f0f0f0' },
  catText: { fontSize: 12 },
  productGrid: { padding: 10, gap: 10 },
  productCard: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', elevation: 1 },
  productCardPressed: { backgroundColor: '#f0fdf4' },
  productName: { fontSize: 12, textAlign: 'center', marginTop: 6, color: '#222' },
  productPrice: { fontSize: 14, fontWeight: '700', color: brand.primary, marginTop: 4 },
  stockBadge: { fontSize: 10, color: '#666', marginTop: 2 },
  lowStock: { color: '#e53935' },
  cartTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  cartItemName: { fontSize: 12, color: '#222' },
  cartItemPrice: { fontSize: 11, color: '#888' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 24 },
  qtyVal: { fontSize: 14, fontWeight: '700', marginHorizontal: 8, minWidth: 20, textAlign: 'center' },
  cartItemTotal: { fontSize: 13, fontWeight: '700', color: '#111', minWidth: 60, textAlign: 'right' },
  emptyCart: { alignItems: 'center', paddingTop: 40 },
  emptyCartText: { color: '#ccc', marginTop: 8 },
  totals: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 13, color: '#666' },
  totalVal: { fontSize: 13, color: '#333' },
  grandTotal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 4 },
  grandLabel: { fontSize: 16, fontWeight: '800', color: '#111' },
  grandVal: { fontSize: 16, fontWeight: '800', color: brand.primary },
  checkoutBtn: { marginTop: 12, borderRadius: 10, backgroundColor: brand.primary },
  mpesaInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 12, fontSize: 14 },
});
