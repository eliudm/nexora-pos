import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Alert, Pressable, TextInput as RNTextInput, Platform } from 'react-native';
import { Text, Button, Appbar, Searchbar, Chip, Portal, Dialog, RadioButton, ActivityIndicator, IconButton, Badge } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { productQueries, Product } from '../../src/db/products';
import { salesQueries, CartItem, SplitPayment } from '../../src/db/sales';
import { customerQueries, Customer } from '../../src/db/customers';
import { holdSalesQueries, HoldSale } from '../../src/db/hold_sales';
import { loyaltyQueries, KES_PER_POINT } from '../../src/db/loyalty';
import { getBusinessInfo } from '../../src/db/settings';
import { useSession } from '../../src/context/session';
import { etimsService } from '../../src/services/etims';
import { printerService } from '../../src/services/printer';
import { buildReceiptText, buildReceiptHtml, ReceiptSale } from '../../src/services/receipt';
import { darajaService } from '../../src/services/mpesa_daraja';
import { whatsappService } from '../../src/services/whatsapp';
import { smsService } from '../../src/services/sms';
import { getSetting } from '../../src/db/settings';
import { brand } from '../../src/theme';

const PAYMENT_METHODS = ['CASH', 'MPESA', 'SPLIT', 'CREDIT'] as const;
type PM = typeof PAYMENT_METHODS[number];

export default function POSScreen() {
  const qc = useQueryClient();
  const { user } = useSession();

  // Core POS state
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Checkout
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [payMethod, setPayMethod] = useState<PM>('CASH');
  const [mpesaRef, setMpesaRef] = useState('');
  const [discount, setDiscount] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitMpesa, setSplitMpesa] = useState('');
  const [splitMpesaRef, setSplitMpesaRef] = useState('');

  // Customer & loyalty
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState('');

  // Hold/Park
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);

  // Quantity input dialog
  const [qtyDialogItem, setQtyDialogItem] = useState<CartItem | null>(null);
  const [qtyInput, setQtyInput] = useState('');

  // Item discount dialog
  const [itemDiscountItem, setItemDiscountItem] = useState<CartItem | null>(null);
  const [itemDiscountInput, setItemDiscountInput] = useState('');

  // Scanner
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // M-Pesa
  const [stkPhone, setStkPhone] = useState('');
  const [stkLoading, setStkLoading] = useState(false);

  // Post-sale share
  const [lastSale, setLastSale] = useState<any>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

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

  const { data: holdSales, refetch: refetchHolds } = useQuery({
    queryKey: ['hold-sales'],
    queryFn: holdSalesQueries.getAll,
    enabled: resumeDialogOpen,
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
      const customerForShare = selectedCustomer;
      setCart([]);
      setCheckoutVisible(false);
      setMpesaRef('');
      setDiscount('');
      setSplitCash('');
      setSplitMpesa('');
      setSplitMpesaRef('');
      setSelectedCustomer(null);
      setLoyaltyBalance(0);
      setRedeemPoints('');
      setStkPhone('');
      if (sale) {
        etimsService.submitSale(sale as any).catch(() => {});
        await printReceipt(sale);
        // Show share dialog if customer has a phone
        if (customerForShare?.phone) {
          setLastSale({ ...sale, customerPhone: customerForShare.phone });
          setShareDialogOpen(true);
        }
      }
    },
  });

  // ---- Cart helpers ----

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        const qty = existing.qty + 1;
        const vatAmt = existing.unit_price * qty * (existing.vat_rate / 100);
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, qty, vat_amount: vatAmt, total: existing.unit_price * qty + vatAmt - i.discount }
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
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const vatAmt = i.unit_price * qty * (i.vat_rate / 100);
      return { ...i, qty, vat_amount: vatAmt, total: i.unit_price * qty + vatAmt - i.discount };
    }));
  };

  const applyItemDiscount = (productId: number, discountAmt: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const baseTotal = i.unit_price * i.qty * (1 + i.vat_rate / 100);
      return { ...i, discount: discountAmt, total: Math.max(0, baseTotal - discountAmt) };
    }));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const tax = cart.reduce((s, i) => s + i.vat_amount, 0);
  const itemDiscountTotal = cart.reduce((s, i) => s + i.discount, 0);
  const orderDiscount = parseFloat(discount) || 0;
  const pointsRedeemed = parseInt(redeemPoints) || 0;
  const loyaltyDiscount = pointsRedeemed * KES_PER_POINT;
  const total = Math.max(0, subtotal + tax - itemDiscountTotal - orderDiscount - loyaltyDiscount);

  const filteredProducts = selectedCat
    ? (products ?? []).filter((p) => p.category_id === selectedCat)
    : products ?? [];

  // ---- Barcode scanner ----
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

  // ---- Hold/Park sale ----
  const holdSale = async () => {
    if (cart.length === 0) return;
    await holdSalesQueries.save(cart, {
      label: holdLabel.trim() || undefined,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      cashierId: user?.id,
    });
    setCart([]);
    setSelectedCustomer(null);
    setHoldLabel('');
    setHoldDialogOpen(false);
    Alert.alert('Sale Held', 'Sale parked. You can resume it from the hold list.');
  };

  const resumeHeldSale = (held: HoldSale) => {
    if (cart.length > 0) {
      Alert.alert('Replace Cart?', 'Your current cart will be cleared.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: () => { doResume(held); } },
      ]);
    } else {
      doResume(held);
    }
  };

  const doResume = async (held: HoldSale) => {
    setCart(held.items ?? []);
    if (held.customer_id) {
      const c = await customerQueries.getById(held.customer_id);
      if (c) setSelectedCustomer(c);
    }
    await holdSalesQueries.delete(held.id);
    setResumeDialogOpen(false);
    refetchHolds();
  };

  // ---- Loyalty ----
  const onCustomerSelected = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerDialogOpen(false);
    const bal = await loyaltyQueries.getBalance(c.id);
    setLoyaltyBalance(bal);
  };

  // ---- Receipt printing ----
  const printReceipt = async (sale: any) => {
    if (!bizInfo) return;
    const receiptSale: ReceiptSale = {
      invoice_no: sale.invoice_no,
      created_at: sale.created_at,
      customer_name: sale.customer_name,
      cashier_name: sale.cashier_name,
      subtotal: sale.subtotal,
      tax_amount: sale.tax_amount,
      discount: sale.discount,
      total: sale.total,
      payment_method: sale.payment_method,
      mpesa_ref: sale.mpesa_ref,
      split_cash: sale.split_cash,
      split_mpesa: sale.split_mpesa,
      items: sale.items ?? [],
    };
    const printerConfig = await printerService.getConfig();
    if (printerConfig.type !== 'none') {
      const text = buildReceiptText(receiptSale, {
        name: bizInfo.name ?? '',
        phone: bizInfo.phone,
        address: bizInfo.address,
        vatNo: bizInfo.vatNo,
        receiptFooter: bizInfo.receiptFooter,
        mpesaPaybill: bizInfo.mpesaPaybill,
        mpesaTill: bizInfo.mpesaTill,
      });
      const result = await printerService.print(text);
      if (result.success) return;
      Alert.alert('Printer Error', `${result.error}\n\nWhat would you like to do?`, [
        { text: 'Share PDF', onPress: () => fallbackPrint(receiptSale) },
        { text: 'Skip', style: 'cancel' },
      ]);
      return;
    }
    fallbackPrint(receiptSale);
  };

  const fallbackPrint = async (receiptSale: ReceiptSale) => {
    if (!bizInfo) return;
    const html = buildReceiptHtml(receiptSale, {
      name: bizInfo.name ?? '',
      phone: bizInfo.phone,
      address: bizInfo.address,
      vatNo: bizInfo.vatNo,
      receiptFooter: bizInfo.receiptFooter,
      mpesaPaybill: bizInfo.mpesaPaybill,
      mpesaTill: bizInfo.mpesaTill,
    });
    Alert.alert('Receipt', 'Share or print receipt:', [
      { text: 'Print via System', onPress: async () => { await Print.printAsync({ html }); } },
      { text: 'Share as PDF', onPress: async () => {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Receipt' });
      }},
      { text: 'Skip', style: 'cancel' },
    ]);
  };

  // ---- M-Pesa STK Push ----
  const handleStkPush = async () => {
    if (!stkPhone.trim()) { Alert.alert('Phone Required', 'Enter the customer phone number.'); return; }
    setStkLoading(true);
    try {
      const isDarajaConfigured = await darajaService.isConfigured();
      if (isDarajaConfigured) {
        const result = await darajaService.stkPush(
          stkPhone,
          total,
          bizInfo?.mpesaTill || bizInfo?.mpesaPaybill || 'Pay',
          'POS Sale',
        );
        if (result.success) {
          Alert.alert('STK Push Sent', 'A payment prompt has been sent to the customer\'s phone. Enter the M-Pesa code once they confirm.');
        } else {
          Alert.alert('STK Push Failed', result.error ?? 'Could not send payment prompt. Ask customer to pay manually.');
        }
      } else {
        // Fallback: show manual payment instructions
        Alert.alert(
          'M-Pesa Payment',
          `Ask customer to send KES ${total.toFixed(0)} to:\n\n` +
          (bizInfo?.mpesaTill ? `Till: ${bizInfo.mpesaTill}` : `Paybill: ${bizInfo?.mpesaPaybill ?? 'Not configured'}`) +
          `\n\nThen enter the M-Pesa confirmation code below.\n\n(To enable automatic prompts, configure Daraja API in Settings.)`,
        );
      }
    } finally {
      setStkLoading(false);
    }
  };

  // ---- Post-sale sharing ----
  const shareViaWhatsApp = async () => {
    if (!lastSale || !bizInfo) return;
    const receiptSale: ReceiptSale = {
      invoice_no: lastSale.invoice_no, created_at: lastSale.created_at,
      customer_name: lastSale.customer_name, cashier_name: lastSale.cashier_name,
      subtotal: lastSale.subtotal, tax_amount: lastSale.tax_amount,
      discount: lastSale.discount, total: lastSale.total,
      payment_method: lastSale.payment_method, mpesa_ref: lastSale.mpesa_ref,
      split_cash: lastSale.split_cash, split_mpesa: lastSale.split_mpesa,
      items: lastSale.items ?? [],
    };
    setShareDialogOpen(false);
    await whatsappService.sendReceipt(receiptSale, bizInfo.name ?? 'Store', lastSale.customerPhone);
  };

  const shareViaSMS = async () => {
    if (!lastSale || !bizInfo) return;
    const receiptSale: ReceiptSale = {
      invoice_no: lastSale.invoice_no, created_at: lastSale.created_at,
      customer_name: lastSale.customer_name, cashier_name: lastSale.cashier_name,
      subtotal: lastSale.subtotal, tax_amount: lastSale.tax_amount,
      discount: lastSale.discount, total: lastSale.total,
      payment_method: lastSale.payment_method, mpesa_ref: lastSale.mpesa_ref,
      items: lastSale.items ?? [],
    };
    setShareDialogOpen(false);
    const result = await smsService.sendReceipt(receiptSale, bizInfo.name ?? 'Store', lastSale.customerPhone);
    if (result.success) {
      Alert.alert('SMS Sent', 'Receipt sent via SMS.');
    } else {
      Alert.alert('SMS Failed', result.error ?? 'Could not send SMS. Check Africa\'s Talking config in Settings.');
    }
  };

  // ---- Confirm sale ----
  const handleConfirmSale = () => {
    if (payMethod === 'MPESA' && !mpesaRef.trim()) {
      Alert.alert('M-Pesa Reference', 'Please enter the M-Pesa transaction code.');
      return;
    }
    if (payMethod === 'SPLIT') {
      const c = parseFloat(splitCash) || 0;
      const m = parseFloat(splitMpesa) || 0;
      if (c + m < total - 0.01) {
        Alert.alert('Insufficient', `Cash + M-Pesa must cover KES ${total.toFixed(0)}.\nEntered: ${(c+m).toFixed(0)}`);
        return;
      }
      if (m > 0 && !splitMpesaRef.trim()) {
        Alert.alert('M-Pesa Reference', 'Enter the M-Pesa transaction code for the M-Pesa portion.');
        return;
      }
    }
    if (payMethod === 'CREDIT' && !selectedCustomer) {
      Alert.alert('Customer Required', 'Select a customer for credit sales.');
      return;
    }
    if (pointsRedeemed > loyaltyBalance) {
      Alert.alert('Insufficient Points', `Customer only has ${loyaltyBalance} points.`);
      return;
    }

    const splitPayment: SplitPayment | undefined = payMethod === 'SPLIT'
      ? { cash: parseFloat(splitCash) || 0, mpesa: parseFloat(splitMpesa) || 0, mpesaRef: splitMpesaRef.trim() || undefined }
      : undefined;

    mutation.mutate({
      items: cart,
      opts: {
        paymentMethod: payMethod,
        splitPayment,
        mpesaRef: mpesaRef.trim() || undefined,
        discount: orderDiscount,
        loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
        loyaltyPointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
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
            <View>
              <Appbar.Action icon="pause-circle-outline" color="#fff" onPress={() => setResumeDialogOpen(true)} />
            </View>
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

          {selectedCustomer && loyaltyBalance > 0 && (
            <View style={styles.loyaltyBanner}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#f59e0b" />
              <Text style={styles.loyaltyText}>{loyaltyBalance} pts = KES {(loyaltyBalance * KES_PER_POINT).toFixed(0)}</Text>
            </View>
          )}

          <FlatList
            data={cart}
            keyExtractor={(i) => String(i.product_id)}
            style={{ flex: 1 }}
            renderItem={({ item }) => (
              <View style={styles.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName} numberOfLines={1}>{item.product_name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <Text style={styles.cartItemPrice}>KES {item.unit_price.toLocaleString()}</Text>
                    {item.discount > 0 && (
                      <Text style={styles.itemDiscount}>-{item.discount.toFixed(0)}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.product_id, item.qty - 1)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Pressable onLongPress={() => { setQtyDialogItem(item); setQtyInput(String(item.qty)); }}>
                    <Text style={styles.qtyVal}>{item.qty}</Text>
                  </Pressable>
                  <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.product_id, item.qty + 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => { setItemDiscountItem(item); setItemDiscountInput(String(item.discount || '')); }}>
                  <Text style={styles.cartItemTotal}>KES {item.total.toFixed(0)}</Text>
                </Pressable>
                <Pressable onPress={() => removeFromCart(item.product_id)} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#ccc" />
                </Pressable>
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
            {itemDiscountTotal > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Item Discounts</Text><Text style={[styles.totalVal, { color: '#e53935' }]}>-KES {itemDiscountTotal.toFixed(0)}</Text></View>}
            {orderDiscount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Order Discount</Text><Text style={[styles.totalVal, { color: '#e53935' }]}>-KES {orderDiscount}</Text></View>}
            {loyaltyDiscount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Loyalty Discount</Text><Text style={[styles.totalVal, { color: '#f59e0b' }]}>-KES {loyaltyDiscount.toFixed(0)}</Text></View>}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandLabel}>TOTAL</Text>
              <Text style={styles.grandVal}>KES {total.toFixed(0)}</Text>
            </View>
          </View>

          <View style={styles.cartActions}>
            <Button
              mode="outlined"
              compact
              onPress={() => setHoldDialogOpen(true)}
              disabled={cart.length === 0}
              style={styles.holdBtn}
              icon="pause"
            >
              Hold
            </Button>
            <Button
              mode="outlined"
              compact
              onPress={() => router.push('/(app)/layaway')}
              style={[styles.holdBtn, { borderColor: '#f59e0b' }]}
              icon="package-down"
              textColor="#f59e0b"
            >
              Layaway
            </Button>
            <Button
              mode="contained"
              onPress={() => setCheckoutVisible(true)}
              disabled={cart.length === 0}
              style={styles.checkoutBtn}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontSize: 15, fontWeight: '700' }}
            >
              Checkout
            </Button>
          </View>
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
              <Pressable key={c.id} style={styles.customerRow} onPress={() => onCustomerSelected(c)}>
                <Text style={styles.customerName}>{c.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={styles.customerPhone}>{c.phone}</Text>
                  {c.loyalty_points > 0 && (
                    <Text style={styles.customerPoints}>{c.loyalty_points} pts</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setSelectedCustomer(null); setLoyaltyBalance(0); setCustomerDialogOpen(false); }}>Clear</Button>
            <Button onPress={() => setCustomerDialogOpen(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Quantity Input Dialog (long-press qty) */}
        <Dialog visible={!!qtyDialogItem} onDismiss={() => setQtyDialogItem(null)}>
          <Dialog.Title>Set Quantity</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 8, color: '#555' }}>{qtyDialogItem?.product_name}</Text>
            <RNTextInput
              value={qtyInput}
              onChangeText={setQtyInput}
              keyboardType="decimal-pad"
              style={styles.mpesaInput}
              autoFocus
              placeholder="Enter quantity"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setQtyDialogItem(null)}>Cancel</Button>
            <Button mode="contained" onPress={() => {
              const q = parseFloat(qtyInput);
              if (qtyDialogItem && !isNaN(q)) updateQty(qtyDialogItem.product_id, q);
              setQtyDialogItem(null);
            }}>Set</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Item Discount Dialog (tap item total) */}
        <Dialog visible={!!itemDiscountItem} onDismiss={() => setItemDiscountItem(null)}>
          <Dialog.Title>Item Discount</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4, color: '#555' }}>{itemDiscountItem?.product_name}</Text>
            <Text style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>Line total: KES {((itemDiscountItem?.unit_price ?? 0) * (itemDiscountItem?.qty ?? 1) * (1 + (itemDiscountItem?.vat_rate ?? 0) / 100)).toFixed(0)}</Text>
            <RNTextInput
              value={itemDiscountInput}
              onChangeText={setItemDiscountInput}
              keyboardType="decimal-pad"
              style={styles.mpesaInput}
              autoFocus
              placeholder="Discount amount (KES)"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { if (itemDiscountItem) applyItemDiscount(itemDiscountItem.product_id, 0); setItemDiscountItem(null); }}>Remove</Button>
            <Button mode="contained" onPress={() => {
              const d = parseFloat(itemDiscountInput) || 0;
              if (itemDiscountItem) applyItemDiscount(itemDiscountItem.product_id, d);
              setItemDiscountItem(null);
            }}>Apply</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Hold Sale Dialog */}
        <Dialog visible={holdDialogOpen} onDismiss={() => setHoldDialogOpen(false)}>
          <Dialog.Title>Hold Sale</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#555', marginBottom: 10 }}>Park this sale and serve another customer. Resume it later.</Text>
            <RNTextInput
              placeholder="Label (optional, e.g. Table 5)"
              value={holdLabel}
              onChangeText={setHoldLabel}
              style={styles.mpesaInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setHoldDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={holdSale} icon="pause">Hold Sale</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Resume Held Sales Dialog */}
        <Dialog visible={resumeDialogOpen} onDismiss={() => setResumeDialogOpen(false)}>
          <Dialog.Title>Held Sales</Dialog.Title>
          <Dialog.Content>
            {(holdSales?.length ?? 0) === 0 ? (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 16 }}>No held sales</Text>
            ) : (
              holdSales!.map((h) => (
                <Pressable key={h.id} style={styles.holdRow} onPress={() => resumeHeldSale(h)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.holdLabel}>{h.label || `Held at ${dayjs(h.created_at).format('HH:mm')}`}</Text>
                    <Text style={styles.holdSub}>{h.customer_name ?? 'No customer'} · {(h.items?.length ?? 0)} items</Text>
                  </View>
                  <MaterialCommunityIcons name="play-circle" size={24} color={brand.primary} />
                </Pressable>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setResumeDialogOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Checkout Dialog */}
        <Dialog visible={checkoutVisible} onDismiss={() => setCheckoutVisible(false)}>
          <Dialog.Title>Payment — KES {total.toFixed(0)}</Dialog.Title>
          <Dialog.Content>
            {selectedCustomer && (
              <Text style={styles.checkoutCustomer}>
                {selectedCustomer.name}  ·  Balance: KES {selectedCustomer.credit_balance.toLocaleString()}  ·  {loyaltyBalance} pts
              </Text>
            )}
            <Text style={{ marginBottom: 8, fontWeight: '600' }}>Payment Method</Text>
            <RadioButton.Group value={payMethod} onValueChange={(v) => setPayMethod(v as PM)}>
              {PAYMENT_METHODS.map((m) => (
                <RadioButton.Item key={m} label={m === 'SPLIT' ? 'Split (Cash + M-Pesa)' : m} value={m} />
              ))}
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

            {payMethod === 'SPLIT' && (
              <View>
                <Text style={styles.splitLabel}>Total: KES {total.toFixed(0)}</Text>
                <RNTextInput
                  placeholder="Cash amount"
                  value={splitCash}
                  onChangeText={(v) => {
                    setSplitCash(v);
                    const cashAmt = parseFloat(v) || 0;
                    const remaining = Math.max(0, total - cashAmt);
                    setSplitMpesa(remaining > 0 ? remaining.toFixed(0) : '');
                  }}
                  keyboardType="decimal-pad"
                  style={styles.mpesaInput}
                />
                <RNTextInput
                  placeholder="M-Pesa amount"
                  value={splitMpesa}
                  onChangeText={setSplitMpesa}
                  keyboardType="decimal-pad"
                  style={styles.mpesaInput}
                />
                <RNTextInput
                  placeholder="M-Pesa Transaction Code"
                  value={splitMpesaRef}
                  onChangeText={setSplitMpesaRef}
                  style={styles.mpesaInput}
                  autoCapitalize="characters"
                />
              </View>
            )}

            <RNTextInput
              placeholder="Order Discount (KES)"
              value={discount}
              onChangeText={setDiscount}
              keyboardType="numeric"
              style={styles.mpesaInput}
            />

            {selectedCustomer && loyaltyBalance > 0 && (
              <View>
                <Text style={styles.loyaltyInputLabel}>Redeem Loyalty Points (max {loyaltyBalance}, = KES {(loyaltyBalance * KES_PER_POINT).toFixed(0)})</Text>
                <RNTextInput
                  placeholder="Points to redeem"
                  value={redeemPoints}
                  onChangeText={setRedeemPoints}
                  keyboardType="numeric"
                  style={styles.mpesaInput}
                />
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCheckoutVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleConfirmSale} loading={mutation.isPending} disabled={mutation.isPending}>
              Confirm Sale
            </Button>
          </Dialog.Actions>
        </Dialog>
        {/* Post-sale Share Receipt Dialog */}
        <Dialog visible={shareDialogOpen} onDismiss={() => setShareDialogOpen(false)}>
          <Dialog.Title>Share Receipt</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#555', marginBottom: 16 }}>
              Send receipt to {lastSale?.customer_name ?? 'customer'} at {lastSale?.customerPhone}?
            </Text>
            <Button mode="contained" icon="whatsapp" style={{ marginBottom: 10, backgroundColor: '#25D366' }} onPress={shareViaWhatsApp}>
              Send via WhatsApp
            </Button>
            <Button mode="outlined" icon="message-text" onPress={shareViaSMS}>
              Send via SMS
            </Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShareDialogOpen(false)}>Skip</Button>
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
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cartTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  customerBtn: { fontSize: 12, color: brand.primary, fontWeight: '600' },
  loyaltyBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fffbeb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  loyaltyText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  cartItemName: { fontSize: 12, color: '#222' },
  cartItemPrice: { fontSize: 11, color: '#888' },
  itemDiscount: { fontSize: 11, color: '#e53935', fontWeight: '600' },
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
  cartActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  holdBtn: { flex: 1, borderColor: '#ccc' },
  checkoutBtn: { flex: 2, borderRadius: 10, backgroundColor: brand.primary },
  mpesaInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 14 },
  stkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  splitLabel: { fontSize: 13, color: '#555', marginTop: 8, fontWeight: '600' },
  checkoutCustomer: { fontSize: 12, color: '#555', marginBottom: 10, backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6 },
  loyaltyInputLabel: { fontSize: 12, color: '#92400e', marginTop: 8, marginBottom: 2 },
  customerRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  customerName: { fontSize: 14, fontWeight: '600', color: '#111' },
  customerPhone: { fontSize: 12, color: '#888' },
  customerPoints: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  holdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  holdLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  holdSub: { fontSize: 12, color: '#888', marginTop: 2 },
});
