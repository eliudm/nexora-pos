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
import { productQueries, Product } from '../../../src/db/products';
import { salesQueries, CartItem, SplitPayment } from '../../../src/db/sales';
import { customerQueries, Customer } from '../../../src/db/customers';
import { holdSalesQueries, HoldSale } from '../../../src/db/hold_sales';
import { loyaltyQueries, KES_PER_POINT } from '../../../src/db/loyalty';
import { getBusinessInfo } from '../../../src/db/settings';
import { useSession } from '../../../src/context/session';
import { etimsService } from '../../../src/services/etims';
import { printerService } from '../../../src/services/printer';
import { buildReceiptText, buildReceiptHtml, buildInvoiceHtml, ReceiptSale } from '../../../src/services/receipt';
import { darajaService } from '../../../src/services/mpesa_daraja';
import { whatsappService } from '../../../src/services/whatsapp';
import { smsService } from '../../../src/services/sms';
import { getSetting } from '../../../src/db/settings';
import { useTheme } from '../../../src/context/theme';

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
  const [newCustDialogOpen, setNewCustDialogOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');

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

  // Cart modal
  const [cartModalVisible, setCartModalVisible] = useState(false);

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

  const createCustomerMutation = useMutation({
    mutationFn: (data: { name: string; phone: string; email: string }) =>
      customerQueries.create({ name: data.name, phone: data.phone || null, email: data.email || null, credit_balance: 0 }),
    onSuccess: async (newId) => {
      const created = await customerQueries.getById(newId);
      if (created) onCustomerSelected(created);
      qc.invalidateQueries({ queryKey: ['customers'] });
      setNewCustDialogOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
    },
  });

  const handleCreateCustomer = () => {
    if (!newCustName.trim()) { Alert.alert('Name Required', 'Enter the customer name.'); return; }
    createCustomerMutation.mutate({ name: newCustName.trim(), phone: newCustPhone.trim(), email: newCustEmail.trim() });
  };

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
        const rate = existing.vat_rate / 100;
        const vatAmt = existing.unit_price * qty * rate / (1 + rate);
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, qty, vat_amount: vatAmt, total: existing.unit_price * qty - i.discount }
            : i,
        );
      }
      const rate = product.vat_rate / 100;
      const vatAmt = product.price * rate / (1 + rate);
      return [...prev, {
        product_id: product.id, product_name: product.name, qty: 1,
        unit_price: product.price, cost_price: product.cost, discount: 0, vat_rate: product.vat_rate,
        vat_amount: vatAmt, total: product.price,
      }];
    });
  }, []);

  const removeFromCart = (productId: number) => setCart((p) => p.filter((i) => i.product_id !== productId));

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const rate = i.vat_rate / 100;
      const vatAmt = i.unit_price * qty * rate / (1 + rate);
      return { ...i, qty, vat_amount: vatAmt, total: i.unit_price * qty - i.discount };
    }));
  };

  const applyItemDiscount = (productId: number, discountAmt: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const baseTotal = i.unit_price * i.qty; // inclusive price, no VAT addition
      const rate = i.vat_rate / 100;
      const newTotal = Math.max(0, baseTotal - discountAmt);
      const vatAmt = newTotal * rate / (1 + rate);
      return { ...i, discount: discountAmt, vat_amount: vatAmt, total: newTotal };
    }));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const tax = cart.reduce((s, i) => s + i.vat_amount, 0);
  const itemDiscountTotal = cart.reduce((s, i) => s + i.discount, 0);
  const orderDiscount = parseFloat(discount) || 0;
  const pointsRedeemed = parseInt(redeemPoints) || 0;
  const loyaltyDiscount = pointsRedeemed * KES_PER_POINT;
  // tax is extracted from subtotal (inclusive), not added on top
  const total = Math.max(0, subtotal - itemDiscountTotal - orderDiscount - loyaltyDiscount);

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
    const bizData = {
      name: bizInfo.name ?? '',
      phone: bizInfo.phone,
      address: bizInfo.address,
      vatNo: bizInfo.vatNo,
      receiptFooter: bizInfo.receiptFooter,
      mpesaPaybill: bizInfo.mpesaPaybill,
      mpesaTill: bizInfo.mpesaTill,
    };
    Alert.alert('Receipt', 'Share or print receipt:', [
      { text: 'Print Receipt', onPress: async () => {
        const html = buildReceiptHtml(receiptSale, bizData);
        await Print.printAsync({ html });
      }},
      { text: 'Save as PDF Invoice', onPress: async () => {
        const html = buildInvoiceHtml(receiptSale, bizData);
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Invoice' });
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
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add items to the cart before checking out.');
      return;
    }
    if (total <= 0 && orderDiscount === 0) {
      Alert.alert('Invalid Total', 'Sale total must be greater than 0.');
      return;
    }
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

  const { colors: D } = useTheme();

  const cartItemCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: D.bg }]}>

      {/* â"€â"€ Header â"€â"€ */}
      <View style={[styles.header, { backgroundColor: D.surface, borderBottomColor: D.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: D.text }]}>Point of Sale</Text>
          {user && <Text style={[styles.cashierBadge, { color: D.muted }]}>{user.name}</Text>}
        </View>
        <Pressable
          style={[styles.iconBtn, { backgroundColor: selectedCustomer ? D.accent + '22' : D.elevated, borderWidth: 1, borderColor: selectedCustomer ? D.accent : 'transparent' }]}
          onPress={() => setCustomerDialogOpen(true)}
        >
          <MaterialCommunityIcons name="account-circle-outline" size={22} color={selectedCustomer ? D.accent : D.muted} />
        </Pressable>
        <Pressable style={[styles.iconBtn, { backgroundColor: D.elevated, marginLeft: 8 }]} onPress={openScanner}>
          <MaterialCommunityIcons name="barcode-scan" size={22} color={D.text} />
        </Pressable>
        <Pressable style={[styles.iconBtn, { backgroundColor: D.elevated, marginLeft: 8 }]} onPress={() => setResumeDialogOpen(true)}>
          <MaterialCommunityIcons name="history" size={22} color={D.text} />
        </Pressable>
      </View>

      {/* â"€â"€ Search â"€â"€ */}
      <View style={[styles.searchWrap, { backgroundColor: D.elevated, borderColor: D.border }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={D.muted} style={{ marginRight: 8 }} />
        <RNTextInput
          placeholder="Search products..."
          placeholderTextColor={D.muted}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, { color: D.text }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={D.muted} />
          </Pressable>
        )}
      </View>

      {/* â"€â"€ Categories â"€â"€ */}
      {(categories?.length ?? 0) > 0 && (
        <FlatList
          data={[{ id: null, name: 'All' }, ...(categories ?? [])]}
          keyExtractor={(c) => String(c.id)}
          horizontal
          style={styles.catList}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedCat(item.id as any)}
              style={[
                styles.catChip,
                { borderColor: D.border, backgroundColor: D.elevated },
                selectedCat === item.id && { backgroundColor: D.accent, borderColor: D.accent },
              ]}
            >
              <Text style={[styles.catText, { color: D.muted }, selectedCat === item.id && { color: '#fff' }]}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* â"€â"€ Product Grid â€" 3 columns, full width â"€â"€ */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={D.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(p) => String(p.id)}
          numColumns={3}
          style={{ flex: 1 }}
          contentContainerStyle={styles.productGrid}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.productCard,
                { backgroundColor: D.surface, borderColor: D.border },
                pressed && { backgroundColor: D.elevated, borderColor: D.accent },
              ]}
              onPress={() => addToCart(item)}
            >
              <View style={[styles.productIconWrap, { backgroundColor: D.elevated }]}>
                <MaterialCommunityIcons name="package-variant" size={26} color={D.accent} />
              </View>
              <Text style={[styles.productName, { color: D.text }]} numberOfLines={2}>{item.name}</Text>
              <Text style={[styles.productPrice, { color: D.accent }]}>KES {item.price.toLocaleString()}</Text>
              {item.track_stock === 1 && (
                <Text style={[styles.stockBadge, { color: item.stock_qty < 5 ? D.danger : D.muted }]}>
                  {item.stock_qty} left
                </Text>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <MaterialCommunityIcons name="package-variant-closed" size={56} color={D.border} />
              <Text style={{ color: D.muted, marginTop: 14, fontSize: 15, fontWeight: '600' }}>No products found</Text>
              <Text style={{ color: D.border, marginTop: 4, fontSize: 12 }}>Try a different search or category</Text>
            </View>
          }
        />
      )}

      {/* â"€â"€ Sticky Cart Bar â"€â"€ */}
      {cart.length > 0 && (
        <View style={[styles.cartBar, { backgroundColor: D.surface, borderTopColor: D.border }]}>
          <Pressable style={styles.cartBarInfo} onPress={() => setCartModalVisible(true)}>
            <View style={[styles.cartBadge, { backgroundColor: D.accent }]}>
              <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.cartBarLabel, { color: D.muted }]}>View Cart</Text>
              <Text style={[styles.cartBarTotal, { color: D.text }]}>KES {total.toFixed(0)}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.checkoutBtn, { backgroundColor: D.accent }]}
            onPress={() => setCheckoutVisible(true)}
          >
            <Text style={styles.checkoutBtnText}>Checkout</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <Portal>
        {/* â"€â"€ Cart Modal (bottom sheet style) â"€â"€ */}
        <Dialog
          visible={cartModalVisible}
          onDismiss={() => setCartModalVisible(false)}
          style={[styles.cartModal, { backgroundColor: D.surface }]}
        >
          {/* Modal header */}
          <View style={[styles.cartModalHeader, { borderBottomColor: D.border }]}>
            <View>
              <Text style={[styles.cartTitle, { color: D.text }]}>Cart</Text>
              <Text style={[styles.cartSubtitle, { color: D.muted }]}>{cartItemCount} item{cartItemCount !== 1 ? 's' : ''} Â· KES {total.toFixed(0)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                style={[styles.customerPill, { backgroundColor: D.elevated, borderColor: selectedCustomer ? D.accent : D.border }]}
                onPress={() => { setCartModalVisible(false); setTimeout(() => setCustomerDialogOpen(true), 200); }}
              >
                <MaterialCommunityIcons name="account" size={12} color={selectedCustomer ? D.accent : D.muted} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: selectedCustomer ? D.accent : D.muted }} numberOfLines={1}>
                  {selectedCustomer ? selectedCustomer.name : 'Customer'}
                </Text>
              </Pressable>
              <Pressable style={[styles.iconBtn, { backgroundColor: D.elevated }]} onPress={() => setCartModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color={D.muted} />
              </Pressable>
            </View>
          </View>

          {/* Loyalty Banner */}
          {selectedCustomer && loyaltyBalance > 0 && (
            <View style={[styles.loyaltyBanner, { backgroundColor: '#1a1200', borderColor: '#3a2800', marginHorizontal: 16, marginTop: 10 }]}>
              <MaterialCommunityIcons name="star-circle" size={14} color={D.warning} />
              <Text style={[styles.loyaltyText, { color: D.warning }]}>{loyaltyBalance} pts = KES {(loyaltyBalance * KES_PER_POINT).toFixed(0)}</Text>
            </View>
          )}

          {/* Cart Items */}
          <Dialog.ScrollArea style={{ paddingHorizontal: 0, maxHeight: 300 }}>
            <FlatList
              data={cart}
              keyExtractor={(i) => String(i.product_id)}
              renderItem={({ item }) => (
                <View style={[styles.cartItem, { borderBottomColor: D.border, paddingHorizontal: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cartItemName, { color: D.text }]} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={[styles.cartItemPrice, { color: D.muted }]}>@ KES {item.unit_price.toLocaleString()}{item.discount > 0 ? `  âˆ'${item.discount.toFixed(0)}` : ''}</Text>
                  </View>
                  <View style={styles.qtyRow}>
                    <Pressable style={[styles.qtyBtn, { backgroundColor: D.elevated, borderColor: '#e53935' }]} onPress={() => updateQty(item.product_id, item.qty - 1)}>
                      <Text style={[styles.qtyBtnText, { color: '#e53935' }]}>{'-'}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setQtyDialogItem(item); setQtyInput(String(item.qty)); }}>
                      <Text style={[styles.qtyVal, { color: D.accent, textDecorationLine: 'underline' }]}>{item.qty}</Text>
                    </Pressable>
                    <Pressable style={[styles.qtyBtn, { backgroundColor: D.accent }]} onPress={() => updateQty(item.product_id, item.qty + 1)}>
                      <Text style={[styles.qtyBtnText, { color: '#fff' }]}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => { setItemDiscountItem(item); setItemDiscountInput(String(item.discount || '')); }}>
                    <Text style={[styles.cartItemTotal, { color: D.text }]}>KES {item.total.toFixed(0)}</Text>
                  </Pressable>
                  <Pressable onPress={() => removeFromCart(item.product_id)} style={{ padding: 6 }}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={D.danger + 'aa'} />
                  </Pressable>
                </View>
              )}
            />
          </Dialog.ScrollArea>

          {/* Totals */}
          <View style={[styles.cartModalTotals, { borderTopColor: D.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: D.muted }]}>Subtotal</Text>
              <Text style={[styles.totalVal, { color: D.text }]}>KES {subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: D.muted }]}>Incl. VAT</Text>
              <Text style={[styles.totalVal, { color: D.muted }]}>KES {tax.toFixed(0)}</Text>
            </View>
            {itemDiscountTotal > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: D.muted }]}>Discounts</Text>
                <Text style={[styles.totalVal, { color: D.danger }]}>âˆ'KES {itemDiscountTotal.toFixed(0)}</Text>
              </View>
            )}
            {orderDiscount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: D.muted }]}>Order Discount</Text>
                <Text style={[styles.totalVal, { color: D.danger }]}>âˆ'KES {orderDiscount}</Text>
              </View>
            )}
            {loyaltyDiscount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: D.muted }]}>Loyalty</Text>
                <Text style={[styles.totalVal, { color: D.warning }]}>âˆ'KES {loyaltyDiscount.toFixed(0)}</Text>
              </View>
            )}
            <View style={[styles.grandTotalRow, { backgroundColor: D.elevated, borderColor: D.border }]}>
              <Text style={[styles.grandLabel, { color: D.muted }]}>TOTAL</Text>
              <Text style={[styles.grandVal, { color: D.accent }]}>KES {total.toFixed(0)}</Text>
            </View>
          </View>

          {/* Cart Actions */}
          <View style={[styles.cartActions, { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 }]}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: D.elevated, borderColor: D.border }]}
              onPress={() => { setCartModalVisible(false); setTimeout(() => setHoldDialogOpen(true), 200); }}
            >
              <MaterialCommunityIcons name="pause" size={16} color={D.muted} />
              <Text style={[styles.actionBtnText, { color: D.muted }]}>Hold</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: D.elevated, borderColor: D.warning + '55' }]}
              onPress={() => { setCartModalVisible(false); router.push('/(app)/layaway'); }}
            >
              <MaterialCommunityIcons name="package-down" size={16} color={D.warning} />
              <Text style={[styles.actionBtnText, { color: D.warning }]}>Layaway</Text>
            </Pressable>
            <Pressable
              style={[styles.checkoutBtn, { backgroundColor: D.accent }]}
              onPress={() => { setCartModalVisible(false); setTimeout(() => setCheckoutVisible(true), 200); }}
            >
              <Text style={styles.checkoutBtnText}>Checkout</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </Pressable>
          </View>
        </Dialog>

        {/* Barcode Scanner */}
        <Dialog visible={scannerVisible} onDismiss={() => setScannerVisible(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Scan Barcode</Dialog.Title>
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
            <Button textColor={D.muted} onPress={() => setScannerVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Picker */}
        <Dialog visible={customerDialogOpen} onDismiss={() => setCustomerDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Select Customer</Dialog.Title>
          <Dialog.Content>
            <Searchbar placeholder="Search by name or phone..." value={customerSearch} onChangeText={setCustomerSearch} style={{ marginBottom: 8, backgroundColor: D.elevated }} />
            {(customers ?? []).slice(0, 6).map((c) => (
              <Pressable key={c.id} style={[styles.customerRow, { borderBottomColor: D.border }]} onPress={() => onCustomerSelected(c)}>
                <Text style={[styles.customerName, { color: D.text }]}>{c.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={[styles.customerPhone, { color: D.muted }]}>{c.phone}</Text>
                  {c.loyalty_points > 0 && (
                    <Text style={[styles.customerPoints, { color: D.warning }]}>{c.loyalty_points} pts</Text>
                  )}
                </View>
              </Pressable>
            ))}
            {/* Create new customer row — always visible, pre-fills name from search */}
            <Pressable
              style={[styles.customerRow, { borderBottomColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }]}
              onPress={() => {
                setNewCustName(customerSearch);
                setNewCustPhone('');
                setNewCustEmail('');
                setNewCustDialogOpen(true);
              }}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={20} color={D.accent} />
              <Text style={{ color: D.accent, fontWeight: '700', fontSize: 13 }}>
                {customerSearch.trim() ? `Create "${customerSearch}"` : 'Create new customer'}
              </Text>
            </Pressable>
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => { setSelectedCustomer(null); setLoyaltyBalance(0); setCustomerDialogOpen(false); }}>Clear</Button>
            <Button textColor={D.accent} onPress={() => setCustomerDialogOpen(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>

        {/* New Customer Form */}
        <Dialog visible={newCustDialogOpen} onDismiss={() => setNewCustDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>New Customer</Dialog.Title>
          <Dialog.Content>
            <RNTextInput
              placeholder="Name *"
              placeholderTextColor={D.muted}
              value={newCustName}
              onChangeText={setNewCustName}
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated, marginBottom: 10 }]}
              autoFocus
            />
            <RNTextInput
              placeholder="Phone (optional)"
              placeholderTextColor={D.muted}
              value={newCustPhone}
              onChangeText={setNewCustPhone}
              keyboardType="phone-pad"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated, marginBottom: 10 }]}
            />
            <RNTextInput
              placeholder="Email (optional)"
              placeholderTextColor={D.muted}
              value={newCustEmail}
              onChangeText={setNewCustEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setNewCustDialogOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor={D.accent}
              textColor="#fff"
              loading={createCustomerMutation.isPending}
              onPress={handleCreateCustomer}
            >
              Create &amp; Select
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Quantity Input Dialog */}
        <Dialog visible={!!qtyDialogItem} onDismiss={() => setQtyDialogItem(null)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Set Quantity</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 8, color: D.muted }}>{qtyDialogItem?.product_name}</Text>
            <RNTextInput
              value={qtyInput}
              onChangeText={setQtyInput}
              keyboardType="decimal-pad"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated, fontSize: 24, textAlign: 'center', fontWeight: '700' }]}
              placeholderTextColor={D.muted}
              autoFocus
              selectTextOnFocus
              placeholder="0"
              onSubmitEditing={() => {
                const q = parseFloat(qtyInput);
                if (qtyDialogItem && !isNaN(q)) updateQty(qtyDialogItem.product_id, q);
                setQtyDialogItem(null);
              }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setQtyDialogItem(null)}>Cancel</Button>
            <Button mode="contained" buttonColor={D.accent} onPress={() => {
              const q = parseFloat(qtyInput);
              if (qtyDialogItem && !isNaN(q)) updateQty(qtyDialogItem.product_id, q);
              setQtyDialogItem(null);
            }}>Set</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Item Discount Dialog */}
        <Dialog visible={!!itemDiscountItem} onDismiss={() => setItemDiscountItem(null)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Item Discount</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 4, color: D.muted }}>{itemDiscountItem?.product_name}</Text>
            <Text style={{ marginBottom: 8, fontSize: 12, color: D.muted }}>Line total: KES {((itemDiscountItem?.unit_price ?? 0) * (itemDiscountItem?.qty ?? 1)).toFixed(0)}</Text>
            <RNTextInput
              value={itemDiscountInput}
              onChangeText={setItemDiscountInput}
              keyboardType="decimal-pad"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
              placeholderTextColor={D.muted}
              autoFocus
              placeholder="Discount amount (KES)"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.danger} onPress={() => { if (itemDiscountItem) applyItemDiscount(itemDiscountItem.product_id, 0); setItemDiscountItem(null); }}>Remove</Button>
            <Button mode="contained" buttonColor={D.accent} onPress={() => {
              const d = parseFloat(itemDiscountInput) || 0;
              if (itemDiscountItem) applyItemDiscount(itemDiscountItem.product_id, d);
              setItemDiscountItem(null);
            }}>Apply</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Hold Sale Dialog */}
        <Dialog visible={holdDialogOpen} onDismiss={() => setHoldDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Hold Sale</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: D.muted, marginBottom: 10 }}>Park this sale and serve another customer. Resume it later.</Text>
            <RNTextInput
              placeholder="Label (optional, e.g. Table 5)"
              placeholderTextColor={D.muted}
              value={holdLabel}
              onChangeText={setHoldLabel}
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setHoldDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" buttonColor={D.accent} onPress={holdSale} icon="pause">Hold Sale</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Resume Held Sales */}
        <Dialog visible={resumeDialogOpen} onDismiss={() => setResumeDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Held Sales</Dialog.Title>
          <Dialog.Content>
            {(holdSales?.length ?? 0) === 0 ? (
              <Text style={{ color: D.muted, textAlign: 'center', paddingVertical: 16 }}>No held sales</Text>
            ) : (
              holdSales!.map((h) => (
                <Pressable key={h.id} style={[styles.holdRow, { borderBottomColor: D.border }]} onPress={() => resumeHeldSale(h)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.holdLabel, { color: D.text }]}>{h.label || `Held at ${dayjs(h.created_at).format('HH:mm')}`}</Text>
                    <Text style={[styles.holdSub, { color: D.muted }]}>{h.customer_name ?? 'No customer'} Â· {(h.items?.length ?? 0)} items</Text>
                  </View>
                  <MaterialCommunityIcons name="play-circle" size={24} color={D.accent} />
                </Pressable>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setResumeDialogOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Checkout Dialog */}
        <Dialog visible={checkoutVisible} onDismiss={() => setCheckoutVisible(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.accent, fontSize: 18, fontWeight: '800' }}>KES {total.toFixed(0)}</Dialog.Title>
          <Dialog.Content>
            {selectedCustomer && (
              <View style={[styles.checkoutCustomer, { backgroundColor: D.elevated, borderColor: D.border }]}>
                <Text style={{ color: D.text, fontSize: 12, fontWeight: '600' }}>{selectedCustomer.name}</Text>
                <Text style={{ color: D.muted, fontSize: 11 }}>Balance: KES {selectedCustomer.credit_balance.toLocaleString()} Â· {loyaltyBalance} pts</Text>
              </View>
            )}
            <Text style={{ marginBottom: 8, fontWeight: '600', color: D.muted, fontSize: 12, marginTop: 4 }}>PAYMENT METHOD</Text>
            <RadioButton.Group value={payMethod} onValueChange={(v) => setPayMethod(v as PM)}>
              {PAYMENT_METHODS.map((m) => (
                <RadioButton.Item key={m} label={m === 'SPLIT' ? 'Split (Cash + M-Pesa)' : m} value={m}
                  labelStyle={{ color: D.text }} color={D.accent} uncheckedColor={D.muted} />
              ))}
            </RadioButton.Group>

            {payMethod === 'MPESA' && (
              <View>
                <View style={styles.stkRow}>
                  <RNTextInput
                    placeholder="Customer phone (07...)"
                    placeholderTextColor={D.muted}
                    value={stkPhone}
                    onChangeText={setStkPhone}
                    style={[styles.darkInput, { flex: 1, marginRight: 8, color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                    keyboardType="phone-pad"
                  />
                  <Button mode="outlined" textColor={D.accent} style={{ borderColor: D.accent }} onPress={handleStkPush} loading={stkLoading} compact>Prompt</Button>
                </View>
                <RNTextInput
                  placeholder="M-Pesa Transaction Code *"
                  placeholderTextColor={D.muted}
                  value={mpesaRef}
                  onChangeText={setMpesaRef}
                  style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                  autoCapitalize="characters"
                />
              </View>
            )}

            {payMethod === 'SPLIT' && (
              <View>
                <Text style={[styles.splitLabel, { color: D.muted }]}>Total: KES {total.toFixed(0)}</Text>
                <RNTextInput
                  placeholder="Cash amount"
                  placeholderTextColor={D.muted}
                  value={splitCash}
                  onChangeText={(v) => {
                    setSplitCash(v);
                    const cashAmt = parseFloat(v) || 0;
                    const remaining = Math.max(0, total - cashAmt);
                    setSplitMpesa(remaining > 0 ? remaining.toFixed(0) : '');
                  }}
                  keyboardType="decimal-pad"
                  style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                />
                <RNTextInput
                  placeholder="M-Pesa amount"
                  placeholderTextColor={D.muted}
                  value={splitMpesa}
                  onChangeText={setSplitMpesa}
                  keyboardType="decimal-pad"
                  style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                />
                <RNTextInput
                  placeholder="M-Pesa Transaction Code"
                  placeholderTextColor={D.muted}
                  value={splitMpesaRef}
                  onChangeText={setSplitMpesaRef}
                  style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                  autoCapitalize="characters"
                />
              </View>
            )}

            <RNTextInput
              placeholder="Order Discount (KES)"
              placeholderTextColor={D.muted}
              value={discount}
              onChangeText={setDiscount}
              keyboardType="numeric"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
            />

            {selectedCustomer && loyaltyBalance > 0 && (
              <View>
                <Text style={[styles.loyaltyInputLabel, { color: D.warning }]}>Redeem points (max {loyaltyBalance} = KES {(loyaltyBalance * KES_PER_POINT).toFixed(0)})</Text>
                <RNTextInput
                  placeholder="Points to redeem"
                  placeholderTextColor={D.muted}
                  value={redeemPoints}
                  onChangeText={setRedeemPoints}
                  keyboardType="numeric"
                  style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
                />
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setCheckoutVisible(false)}>Cancel</Button>
            <Button mode="contained" buttonColor={D.accent} onPress={handleConfirmSale} loading={mutation.isPending} disabled={mutation.isPending}>
              Confirm Sale
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Post-sale Share */}
        <Dialog visible={shareDialogOpen} onDismiss={() => setShareDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Share Receipt</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: D.muted, marginBottom: 16 }}>
              Send receipt to {lastSale?.customer_name ?? 'customer'} at {lastSale?.customerPhone}?
            </Text>
            <Button mode="contained" icon="whatsapp" style={{ marginBottom: 10, backgroundColor: '#25D366' }} onPress={shareViaWhatsApp}>
              Send via WhatsApp
            </Button>
            <Button mode="outlined" icon="message-text" textColor={D.accent} style={{ borderColor: D.accent }} onPress={shareViaSMS}>
              Send via SMS
            </Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setShareDialogOpen(false)}>Skip</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  cashierBadge: { fontSize: 11, marginTop: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 10, marginBottom: 2, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  // Categories
  catList: { maxHeight: 50 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '600' },
  // Product grid â€" 3 columns
  productGrid: { padding: 10, paddingBottom: 100, gap: 10 },
  productCard: { flex: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1 },
  productIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 12, textAlign: 'center', marginTop: 8, fontWeight: '600', lineHeight: 16 },
  productPrice: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  stockBadge: { fontSize: 10, marginTop: 3 },
  // Sticky cart bar
  cartBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  cartBarInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cartBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cartBarLabel: { fontSize: 11 },
  cartBarTotal: { fontSize: 18, fontWeight: '800' },
  // Checkout button (used in bar + cart modal)
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, flex: 1, maxWidth: 160 },
  checkoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Cart modal
  cartModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0, marginHorizontal: 0, position: 'absolute', bottom: 0, left: 0, right: 0 },
  cartModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  cartTitle: { fontSize: 18, fontWeight: '800' },
  cartSubtitle: { fontSize: 12, marginTop: 2 },
  customerPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, maxWidth: 110 },
  loyaltyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  loyaltyText: { fontSize: 12, fontWeight: '600' },
  // Cart items
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  cartItemName: { fontSize: 13, fontWeight: '700' },
  cartItemPrice: { fontSize: 12, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  qtyBtnText: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  qtyVal: { fontSize: 15, fontWeight: '800', marginHorizontal: 8, minWidth: 22, textAlign: 'center' },
  cartItemTotal: { fontSize: 13, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  // Totals
  cartModalTotals: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  totalLabel: { fontSize: 13 },
  totalVal: { fontSize: 13, fontWeight: '600' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8, borderWidth: 1 },
  grandLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  grandVal: { fontSize: 22, fontWeight: '900' },
  // Cart modal actions
  cartActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  // Dialogs / inputs
  darkInput: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14 },
  stkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  splitLabel: { fontSize: 13, marginTop: 8, fontWeight: '600' },
  checkoutCustomer: { borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  loyaltyInputLabel: { fontSize: 12, marginTop: 8, marginBottom: 2, fontWeight: '600' },
  customerRow: { paddingVertical: 12, borderBottomWidth: 1 },
  customerName: { fontSize: 14, fontWeight: '600' },
  customerPhone: { fontSize: 12 },
  customerPoints: { fontSize: 12, fontWeight: '600' },
  holdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  holdLabel: { fontSize: 14, fontWeight: '600' },
  holdSub: { fontSize: 12, marginTop: 2 },
});
