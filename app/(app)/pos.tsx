import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Alert, Pressable, TextInput as RNTextInput, Platform } from 'react-native';
import { Text, Button, Appbar, Searchbar, Chip, Portal, Dialog, RadioButton, ActivityIndicator, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { productQueries, Product } from '../../src/db/products';
import { salesQueries, CartItem } from '../../src/db/sales';
import { customerQueries, Customer } from '../../src/db/customers';
import { getBusinessInfo } from '../../src/db/settings';
import { useSession } from '../../src/context/session';
import { etimsService } from '../../src/services/etims';
import { brand } from '../../src/theme';

const PAYMENT_METHODS = ['CASH', 'MPESA', 'CREDIT'] as const;
type PM = typeof PAYMENT_METHODS[number];

export default function POSScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [payMethod, setPayMethod] = useState<PM>('CASH');
  const [mpesaRef, setMpesaRef] = useState('');
  const [discount, setDiscount] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [stkPhone, setStkPhone] = useState('');
  const [stkLoading, setStkLoading] = useState(false);
  const lastScanRef = useRef<string>('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productQueries.getAll(search),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: productQueries.getCategories,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', customerSearch],
    queryFn: () => customerQueries.getAll(customerSearch),
    enabled: customerDialogOpen,
  });

  const { data: bizInfo } = useQuery({
    queryKey: ['biz-info'],
    queryFn: getBusinessInfo,
  });

  const mutation = useMutation({
    mutationFn: (vars: { items: CartItem[]; opts: Parameters<typeof salesQueries.create>[1] }) =>
      salesQueries.create(vars.items, vars.opts),
    onSuccess: async (saleId) => {
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      const sale = await salesQueries.getById(saleId);
      setCart([]);
      setCheckoutVisible(false);
      setMpesaRef('');
      setDiscount('');
      setSelectedCustomer(null);
      setStkPhone('');
      if (sale) {
        // Submit to eTIMS silently in background
        etimsService.submitSale(sale as any).catch(() => {});
        await printReceipt(sale);
      }
    },
  });

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        const qty = existing.qty + 1;
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, qty, vat_amount: i.unit_price * qty * (i.vat_rate / 100), total: i.unit_price * qty * (1 + i.vat_rate / 100) }
            : i,
        );
      }
      const vatAmt = product.price * (product.vat_rate / 100);
      return [...prev, {
        product_id: product.id, product_name: product.name, qty: 1,
        unit_price: product.price, discount: 0, vat_rate: product.vat_rate,
        vat_amount: vatAmt, total: product.price + vatAmt,
      }];
    });
  }, []);

  const removeFromCart = (productId: number) => setCart((p) => p.filter((i) => i.product_id !== productId));

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((i) =>
      i.product_id === productId
        ? { ...i, qty, vat_amount: i.unit_price * qty * (i.vat_rate / 100), total: i.unit_price * qty * (1 + i.vat_rate / 100) }
        : i,
    ));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const tax = cart.reduce((s, i) => s + i.vat_amount, 0);
  const disc = parseFloat(discount) || 0;
  const total = subtotal + tax - disc;

  const filteredProducts = selectedCat
    ? (products ?? []).filter((p) => p.category_id === selectedCat)
    : products ?? [];

  // Barcode scanner
  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Permission needed', 'Camera permission is required for barcode scanning.'); return; }
    }
    setScannerVisible(true);
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (data === lastScanRef.current) return;
    lastScanRef.current = data;
    setScannerVisible(false);
    const product = await productQueries.getByBarcode(data);
    if (product) {
      addToCart(product);
    } else {
      Alert.alert('Not Found', `No product found for barcode: ${data}`);
    }
    setTimeout(() => { lastScanRef.current = ''; }, 2000);
  };

  // Receipt printing
  const printReceipt = async (sale: any) => {
    if (!bizInfo) return;
    const itemRows = (sale.items ?? []).map((i: CartItem) =>
      `<tr><td>${i.product_name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">KES ${i.total.toFixed(0)}</td></tr>`
    ).join('');

    const html = `
      <html><body style="font-family:monospace;max-width:300px;margin:0 auto;padding:16px">
        <h2 style="text-align:center;margin:0">${bizInfo.name}</h2>
        <p style="text-align:center;margin:4px 0;font-size:12px">${bizInfo.phone ?? ''}</p>
        <p style="text-align:center;margin:4px 0;font-size:12px">${bizInfo.address ?? ''}</p>
        ${bizInfo.vatNo ? `<p style="text-align:center;font-size:12px">PIN: ${bizInfo.vatNo}</p>` : ''}
        <hr/>
        <p style="font-size:12px">Invoice: ${sale.invoice_no}</p>
        <p style="font-size:12px">Date: ${dayjs(sale.created_at).format('D MMM YYYY HH:mm')}</p>
        ${sale.customer_name ? `<p style="font-size:12px">Customer: ${sale.customer_name}</p>` : ''}
        ${sale.cashier_name ? `<p style="font-size:12px">Cashier: ${sale.cashier_name}</p>` : ''}
        <hr/>
        <table style="width:100%;font-size:12px">
          <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <hr/>
        <table style="width:100%;font-size:12px">
          <tr><td>Subtotal</td><td style="text-align:right">KES ${sale.subtotal.toFixed(0)}</td></tr>
          <tr><td>VAT (16%)</td><td style="text-align:right">KES ${sale.tax_amount.toFixed(0)}</td></tr>
          ${sale.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-KES ${sale.discount}</td></tr>` : ''}
          <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>KES ${sale.total.toFixed(0)}</b></td></tr>
          <tr><td>Payment</td><td style="text-align:right">${sale.payment_method}</td></tr>
          ${sale.mpesa_ref ? `<tr><td>M-Pesa Ref</td><td style="text-align:right">${sale.mpesa_ref}</td></tr>` : ''}
        </table>
        <hr/>
        <p style="text-align:center;font-size:11px">${bizInfo.receiptFooter ?? 'Thank you for your business!'}</p>
      </body></html>
    `;

    Alert.alert('Receipt', 'What would you like to do?', [
      { text: 'Print', onPress: async () => { await Print.printAsync({ html }); } },
      { text: 'Share PDF', onPress: async () => {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Receipt' });
      }},
      { text: 'Skip', style: 'cancel' },
    ]);
  };

  // M-Pesa STK Push
  const handleStkPush = async () => {
    if (!stkPhone.trim()) { Alert.alert('Phone Required', 'Enter the customer phone number.'); return; }
    if (!bizInfo?.mpesaPaybill && !bizInfo?.mpesaTill) {
      Alert.alert('M-Pesa Not Configured', 'Set up your M-Pesa Paybill or Till in Settings first.');
      return;
    }
    setStkLoading(true);
    try {
      // STK Push requires a backend/proxy with Daraja API credentials.
      // In standalone mode we show a manual prompt instead.
      Alert.alert(
        'M-Pesa Payment',
        `Ask customer to send KES ${total.toFixed(0)} to:\n\n` +
        (bizInfo.mpesaTill ? `Till: ${bizInfo.mpesaTill}` : `Paybill: ${bizInfo.mpesaPaybill}`) +
        `\n\nThen enter the confirmation code below.`,
      );
    } finally {
      setStkLoading(false);
    }
  };

  const handleConfirmSale = () => {
    if (payMethod === 'MPESA' && !mpesaRef.trim()) {
      Alert.alert('M-Pesa Reference', 'Please enter the M-Pesa transaction code.');
      return;
    }
    if (payMethod === 'CREDIT' && !selectedCustomer) {
      Alert.alert('Customer Required', 'Select a customer for credit sales.');
      return;
    }
    mutation.mutate({
      items: cart,
      opts: {
        paymentMethod: payMethod,
        mpesaRef: mpesaRef.trim() || undefined,
        discount: disc,
        customerId: selectedCustomer?.id,
        cashierId: user?.id,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Product Grid */}
        <View style={styles.left}>
          <Appbar.Header style={styles.header}>
            <Appbar.Content title="Point of Sale" titleStyle={styles.headerTitle} />
            {user && <Text style={styles.cashierBadge}>{user.name}</Text>}
            <Appbar.Action icon="barcode-scan" color="#fff" onPress={openScanner} />
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
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Cart ({cart.length})</Text>
            <Pressable onPress={() => setCustomerDialogOpen(true)}>
              <Text style={styles.customerBtn}>
                {selectedCustomer ? selectedCustomer.name : '+ Customer'}
              </Text>
            </Pressable>
          </View>

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
                <Text style={styles.emptyCartSub}>Tap a product or scan a barcode</Text>
              </View>
            }
          />

          <View style={styles.totals}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>KES {subtotal.toLocaleString()}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>VAT</Text><Text style={styles.totalVal}>KES {tax.toFixed(0)}</Text></View>
            {disc > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={[styles.totalVal, { color: '#e53935' }]}>-KES {disc}</Text></View>}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandLabel}>TOTAL</Text>
              <Text style={styles.grandVal}>KES {total.toFixed(0)}</Text>
            </View>
          </View>

          <Button mode="contained" onPress={() => setCheckoutVisible(true)} disabled={cart.length === 0} style={styles.checkoutBtn} contentStyle={{ height: 50 }} labelStyle={{ fontSize: 16, fontWeight: '700' }}>
            Checkout
          </Button>
        </View>
      </View>

      <Portal>
        {/* Barcode Scanner */}
        <Dialog visible={scannerVisible} onDismiss={() => setScannerVisible(false)}>
          <Dialog.Title>Scan Barcode</Dialog.Title>
          <Dialog.Content style={{ height: 300 }}>
            {scannerVisible && (
              <CameraView
                style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
                onBarcodeScanned={handleBarcodeScan}
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setScannerVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Picker */}
        <Dialog visible={customerDialogOpen} onDismiss={() => setCustomerDialogOpen(false)}>
          <Dialog.Title>Select Customer</Dialog.Title>
          <Dialog.Content>
            <Searchbar placeholder="Search..." value={customerSearch} onChangeText={setCustomerSearch} style={{ marginBottom: 8 }} />
            {(customers ?? []).slice(0, 6).map((c) => (
              <Pressable key={c.id} style={styles.customerRow} onPress={() => { setSelectedCustomer(c); setCustomerDialogOpen(false); }}>
                <Text style={styles.customerName}>{c.name}</Text>
                <Text style={styles.customerPhone}>{c.phone}</Text>
              </Pressable>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setSelectedCustomer(null); setCustomerDialogOpen(false); }}>Clear</Button>
            <Button onPress={() => setCustomerDialogOpen(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Checkout Dialog */}
        <Dialog visible={checkoutVisible} onDismiss={() => setCheckoutVisible(false)}>
          <Dialog.Title>Payment — KES {total.toFixed(0)}</Dialog.Title>
          <Dialog.Content>
            {selectedCustomer && (
              <Text style={styles.checkoutCustomer}>Customer: {selectedCustomer.name} (Balance: KES {selectedCustomer.credit_balance.toLocaleString()})</Text>
            )}
            <Text style={{ marginBottom: 8, fontWeight: '600' }}>Payment Method</Text>
            <RadioButton.Group value={payMethod} onValueChange={(v) => setPayMethod(v as PM)}>
              {PAYMENT_METHODS.map((m) => <RadioButton.Item key={m} label={m} value={m} />)}
            </RadioButton.Group>

            {payMethod === 'MPESA' && (
              <View>
                <View style={styles.stkRow}>
                  <RNTextInput
                    placeholder="Customer phone (07...)"
                    value={stkPhone}
                    onChangeText={setStkPhone}
                    style={[styles.mpesaInput, { flex: 1, marginRight: 8 }]}
                    keyboardType="phone-pad"
                  />
                  <Button mode="outlined" onPress={handleStkPush} loading={stkLoading} compact>Prompt</Button>
                </View>
                <RNTextInput
                  placeholder="M-Pesa Transaction Code *"
                  value={mpesaRef}
                  onChangeText={setMpesaRef}
                  style={styles.mpesaInput}
                  autoCapitalize="characters"
                />
              </View>
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
            <Button mode="contained" onPress={handleConfirmSale} loading={mutation.isPending} disabled={mutation.isPending}>
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
  cashierBadge: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginRight: 4 },
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
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cartTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  customerBtn: { fontSize: 12, color: brand.primary, fontWeight: '600' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  cartItemName: { fontSize: 12, color: '#222' },
  cartItemPrice: { fontSize: 11, color: '#888' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 24 },
  qtyVal: { fontSize: 14, fontWeight: '700', marginHorizontal: 8, minWidth: 20, textAlign: 'center' },
  cartItemTotal: { fontSize: 13, fontWeight: '700', color: '#111', minWidth: 60, textAlign: 'right' },
  emptyCart: { alignItems: 'center', paddingTop: 40 },
  emptyCartText: { color: '#ccc', marginTop: 8, fontSize: 14 },
  emptyCartSub: { color: '#ddd', fontSize: 11, marginTop: 4 },
  totals: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 13, color: '#666' },
  totalVal: { fontSize: 13, color: '#333' },
  grandTotal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 4 },
  grandLabel: { fontSize: 16, fontWeight: '800', color: '#111' },
  grandVal: { fontSize: 16, fontWeight: '800', color: brand.primary },
  checkoutBtn: { marginTop: 12, borderRadius: 10, backgroundColor: brand.primary },
  mpesaInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 14 },
  stkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  checkoutCustomer: { fontSize: 12, color: '#555', marginBottom: 10, backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6 },
  customerRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  customerName: { fontSize: 14, fontWeight: '600', color: '#111' },
  customerPhone: { fontSize: 12, color: '#888' },
});
