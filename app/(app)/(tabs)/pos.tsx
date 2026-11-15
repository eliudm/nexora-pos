import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Alert, Pressable, Switch, TextInput as RNTextInput, Platform, ScrollView } from 'react-native';
import { Text, Button, Appbar, Searchbar, Chip, Portal, Dialog, RadioButton, ActivityIndicator, IconButton, Badge, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { layawayQueries } from '../../../src/db/layaway';
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

  // Controls menu + Close Register + Reprint
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [closeRegisterOpen, setCloseRegisterOpen] = useState(false);
  const [reprintSale, setReprintSale] = useState<any>(null);
  const [reprintDialogOpen, setReprintDialogOpen] = useState(false);
  const [reprintSearch, setReprintSearch] = useState('');
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [orderDetailSale, setOrderDetailSale] = useState<any>(null);
  const [orderReverseOpen, setOrderReverseOpen] = useState(false);
  const [orderReverseReason, setOrderReverseReason] = useState('');

  // Quantity input dialog
  const [qtyDialogItem, setQtyDialogItem] = useState<CartItem | null>(null);
  const [qtyInput, setQtyInput] = useState('');

  // Item discount dialog
  const [itemDiscountItem, setItemDiscountItem] = useState<CartItem | null>(null);
  const [itemDiscountInput, setItemDiscountInput] = useState('');

  // Price override dialog
  const [priceEditItem, setPriceEditItem] = useState<CartItem | null>(null);
  const [priceEditInput, setPriceEditInput] = useState('');

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

  // Layaway from POS
  const [layDialogOpen, setLayDialogOpen] = useState(false);
  const [layCustName, setLayCustName] = useState('');
  const [layDeposit, setLayDeposit] = useState('');
  const [layPayMethod, setLayPayMethod] = useState<'CASH' | 'MPESA' | 'BANK'>('CASH');
  const [layMpesaRef, setLayMpesaRef] = useState('');
  const [layCollectLater, setLayCollectLater] = useState(false);

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

  const todayStr = dayjs().format('YYYY-MM-DD');
  const { data: dailySummary } = useQuery({
    queryKey: ['daily-summary', todayStr],
    queryFn: () => salesQueries.getDailySummary(todayStr),
    enabled: closeRegisterOpen,
  });

  const { data: recentSales } = useQuery({
    queryKey: ['recent-sales-reprint', reprintSearch],
    queryFn: () => salesQueries.getAll(todayStr, todayStr, 50),
    enabled: reprintDialogOpen,
  });

  const { data: allOrders } = useQuery({
    queryKey: ['all-orders', ordersSearch],
    queryFn: () => salesQueries.getAll(undefined, undefined, 100),
    enabled: ordersDialogOpen,
  });

  const { data: orderDetail } = useQuery({
    queryKey: ['order-detail', orderDetailSale?.id],
    queryFn: () => salesQueries.getById(orderDetailSale!.id),
    enabled: !!orderDetailSale,
  });

  const orderReverseMutation = useMutation({
    mutationFn: ({ saleId, reason }: { saleId: number; reason: string }) =>
      salesQueries.reverseSale(saleId, reason, user?.id ?? null),
    onSuccess: (reversalInvoiceNo) => {
      qc.invalidateQueries({ queryKey: ['all-orders'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setOrderReverseOpen(false);
      setOrderReverseReason('');
      setOrderDetailSale(null);
      Alert.alert('Reversed', `Reversal posted as ${reversalInvoiceNo}. Stock restored.`);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const layawayMutation = useMutation({
    mutationFn: () => layawayQueries.create({
      customerName: layCustName.trim(),
      description: cart.map(i => `${i.product_name} x${i.qty}`).join(', '),
      totalAmount: total,
      depositAmount: layCollectLater ? total : (parseFloat(layDeposit) || 0),
      paymentMethod: layPayMethod,
      mpesaRef: layMpesaRef.trim() || undefined,
      cashierId: user?.id,
      cashierName: user?.name,
      collectLater: layCollectLater,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layaways'] });
      setCart([]);
      setLayDialogOpen(false);
      setLayCustName('');
      setLayDeposit('');
      setLayMpesaRef('');
      setLayCollectLater(false);
      Alert.alert(
        'Layaway Created',
        layCollectLater
          ? 'Item reserved. Customer can collect when ready.'
          : 'Layaway created. Customer can pay the balance on their next visit.',
      );
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Could not create layaway.'),
  });

  const handleReload = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    setControlsMenuOpen(false);
  };

  const handleReprint = async (sale: any) => {
    const full = await salesQueries.getById(sale.id);
    if (full) {
      setReprintDialogOpen(false);
      await printReceipt(full);
    }
  };

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
      const newQty = (existing?.qty ?? 0) + 1;
      if (product.track_stock === 1 && newQty > (product.stock_qty ?? 0)) {
        const avail = product.stock_qty ?? 0;
        Alert.alert(
          avail <= 0 ? 'Out of Stock' : 'Not Enough Stock',
          avail <= 0
            ? `${product.name} is out of stock.`
            : `Only ${avail} unit${avail !== 1 ? 's' : ''} of ${product.name} available.`,
        );
        return prev;
      }
      if (existing) {
        const qty = newQty;
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
        track_stock: product.track_stock, stock_qty: product.stock_qty,
        original_price: product.price,
      }];
    });
  }, []);

  const removeFromCart = (productId: number) => setCart((p) => p.filter((i) => i.product_id !== productId));

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const capped = (i.track_stock === 1 && i.stock_qty != null) ? Math.min(qty, i.stock_qty) : qty;
      if (capped < qty) {
        Alert.alert('Not Enough Stock', `Only ${i.stock_qty} unit${i.stock_qty !== 1 ? 's' : ''} of ${i.product_name} available.`);
      }
      const rate = i.vat_rate / 100;
      const vatAmt = i.unit_price * capped * rate / (1 + rate);
      return { ...i, qty: capped, vat_amount: vatAmt, total: i.unit_price * capped - i.discount };
    }));
  };

  const applyItemDiscount = (productId: number, discountAmt: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const baseTotal = i.unit_price * i.qty;
      const rate = i.vat_rate / 100;
      const newTotal = Math.max(0, baseTotal - discountAmt);
      const vatAmt = newTotal * rate / (1 + rate);
      return { ...i, discount: discountAmt, vat_amount: vatAmt, total: newTotal };
    }));
  };

  const updateUnitPrice = (productId: number, newPrice: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const rate = i.vat_rate / 100;
      const vatAmt = newPrice * i.qty * rate / (1 + rate);
      return { ...i, unit_price: newPrice, discount: 0, vat_amount: vatAmt, total: newPrice * i.qty };
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
    if (payMethod === 'CREDIT' && selectedCustomer) {
      const limit = selectedCustomer.credit_limit ?? 0;
      if (limit > 0) {
        const newBalance = selectedCustomer.credit_balance - total;
        if (newBalance < -limit) {
          const available = limit + selectedCustomer.credit_balance;
          Alert.alert(
            'Credit Limit Exceeded',
            `${selectedCustomer.name} has a credit limit of KES ${limit.toLocaleString('en-KE')}.\n` +
            `Available credit: KES ${Math.max(0, available).toLocaleString('en-KE')}.\n` +
            `This sale of KES ${total.toFixed(2)} would exceed the limit.`,
          );
          return;
        }
      }
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

      {/* —— Header —— */}
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
        <Pressable style={[styles.iconBtn, { backgroundColor: D.elevated, marginLeft: 8 }]} onPress={() => setControlsMenuOpen(true)}>
          <MaterialCommunityIcons name="dots-vertical" size={22} color={D.text} />
        </Pressable>
      </View>

      {/* —— Search —— */}
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

      {/* —— Categories —— */}
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

      {/* —— Product Grid — 3 columns, full width —— */}
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

      {/* —— Sticky Cart Bar —— */}
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
        {/* —— Cart Modal (bottom sheet style) —— */}
        <Dialog
          visible={cartModalVisible}
          onDismiss={() => setCartModalVisible(false)}
          style={[styles.cartModal, { backgroundColor: D.surface }]}
        >
          {/* Modal header */}
          <View style={[styles.cartModalHeader, { borderBottomColor: D.border }]}>
            <View>
              <Text style={[styles.cartTitle, { color: D.text }]}>Cart</Text>
              <Text style={[styles.cartSubtitle, { color: D.muted }]}>{cartItemCount} item{cartItemCount !== 1 ? 's' : ''} · KES {total.toFixed(0)}</Text>
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
                    <Pressable onPress={() => { setPriceEditItem(item); setPriceEditInput(String(item.unit_price)); }}>
                      <Text style={[styles.cartItemPrice, { color: item.original_price != null && item.unit_price !== item.original_price ? D.warning : D.muted, textDecorationLine: 'underline' }]}>
                        @ KES {item.unit_price.toLocaleString()}{item.discount > 0 ? `  –${item.discount.toFixed(0)}` : ''}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.qtyRow}>
                    <Pressable style={[styles.qtyBtn, { backgroundColor: D.elevated, borderColor: '#e53935' }]} onPress={() => updateQty(item.product_id, item.qty - 1)}>
                      <Text style={[styles.qtyBtnText, { color: '#e53935' }]}>{'-'}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setQtyDialogItem(item); setQtyInput(String(item.qty)); }}>
                      <Text style={[styles.qtyVal, { color: D.accent, textDecorationLine: 'underline' }]}>{item.qty}</Text>
                    </Pressable>
                    {(() => {
                      const atMax = item.track_stock === 1 && item.stock_qty != null && item.qty >= item.stock_qty;
                      return (
                        <Pressable
                          style={[styles.qtyBtn, { backgroundColor: atMax ? D.elevated : D.accent }]}
                          onPress={() => updateQty(item.product_id, item.qty + 1)}
                          disabled={atMax}
                        >
                          <Text style={[styles.qtyBtnText, { color: atMax ? D.muted : '#fff' }]}>+</Text>
                        </Pressable>
                      );
                    })()}
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
                <Text style={[styles.totalVal, { color: D.danger }]}>-KES {itemDiscountTotal.toFixed(0)}</Text>
              </View>
            )}
            {orderDiscount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: D.muted }]}>Order Discount</Text>
                <Text style={[styles.totalVal, { color: D.danger }]}>-KES {orderDiscount}</Text>
              </View>
            )}
            {loyaltyDiscount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: D.muted }]}>Loyalty</Text>
                <Text style={[styles.totalVal, { color: D.warning }]}>-KES {loyaltyDiscount.toFixed(0)}</Text>
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
              onPress={() => { setCartModalVisible(false); setTimeout(() => setLayDialogOpen(true), 200); }}
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

        {/* ── Layaway from POS ── */}
        <Dialog visible={layDialogOpen} onDismiss={() => setLayDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.ScrollArea style={{ maxHeight: 520 }}>
            <Dialog.Title style={{ color: D.text }}>Save as Layaway</Dialog.Title>
            <View style={{ padding: 16 }}>
              {/* Cart summary */}
              <View style={{ backgroundColor: D.elevated, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 11, color: D.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Items ({cart.reduce((s, i) => s + i.qty, 0)})</Text>
                {cart.map((i, idx) => (
                  <Text key={idx} style={{ fontSize: 13, color: D.text, lineHeight: 20 }}>{i.product_name} × {i.qty}</Text>
                ))}
                <Text style={{ fontWeight: '900', fontSize: 18, color: D.text, marginTop: 8 }}>Total: KES {total.toFixed(0)}</Text>
              </View>

              <TextInput
                label="Customer Name *"
                value={layCustName}
                onChangeText={setLayCustName}
                mode="outlined"
                style={{ marginBottom: 10 }}
                placeholder="Enter customer name"
                theme={{ colors: { background: D.surface } }}
              />

              {/* Pay & Collect Later */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.elevated, borderRadius: 10, borderWidth: 1, borderColor: '#8b5cf644', padding: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: D.text, fontSize: 13 }}>Pay in Full &amp; Collect Later</Text>
                  <Text style={{ color: D.muted, fontSize: 11, marginTop: 2 }}>Customer pays KES {total.toFixed(0)} now and collects later.</Text>
                </View>
                <Switch value={layCollectLater} onValueChange={setLayCollectLater} trackColor={{ true: '#8b5cf6', false: D.border }} />
              </View>

              {!layCollectLater && (
                <TextInput
                  label="Deposit Amount (KES)"
                  value={layDeposit}
                  onChangeText={setLayDeposit}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  style={{ marginBottom: 10 }}
                  placeholder="0"
                  theme={{ colors: { background: D.surface } }}
                />
              )}

              <Text style={{ fontSize: 12, fontWeight: '600', color: D.muted, marginBottom: 6 }}>Payment Method</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {(['CASH', 'MPESA', 'BANK'] as const).map(m => (
                  <Chip key={m} selected={layPayMethod === m} onPress={() => setLayPayMethod(m)} compact>{m}</Chip>
                ))}
              </View>
              {layPayMethod === 'MPESA' && (
                <TextInput label="M-Pesa Ref *" value={layMpesaRef} onChangeText={setLayMpesaRef} mode="outlined" style={{ marginBottom: 10 }} autoCapitalize="characters" theme={{ colors: { background: D.surface } }} />
              )}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setLayDialogOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              loading={layawayMutation.isPending}
              onPress={() => {
                if (!layCustName.trim()) { Alert.alert('Required', 'Enter the customer name.'); return; }
                if (layPayMethod === 'MPESA' && !layCollectLater && parseFloat(layDeposit || '0') > 0 && !layMpesaRef.trim()) {
                  Alert.alert('Required', 'Enter the M-Pesa transaction code.'); return;
                }
                layawayMutation.mutate();
              }}
            >
              {layCollectLater ? 'Reserve & Collect Later' : 'Create Layaway'}
            </Button>
          </Dialog.Actions>
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

        {/* Orders History */}
        <Dialog visible={ordersDialogOpen} onDismiss={() => setOrdersDialogOpen(false)} style={{ backgroundColor: D.surface, maxHeight: '85%' }}>
          <Dialog.Title style={{ color: D.text }}>Orders</Dialog.Title>
          <Dialog.Content style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <Searchbar
                placeholder="Search invoice or customer..."
                value={ordersSearch}
                onChangeText={setOrdersSearch}
                style={{ backgroundColor: D.elevated }}
              />
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {(allOrders ?? [])
                .filter((s) => !ordersSearch.trim() ||
                  s.invoice_no.toLowerCase().includes(ordersSearch.toLowerCase()) ||
                  (s.customer_name ?? '').toLowerCase().includes(ordersSearch.toLowerCase()))
                .slice(0, 50)
                .map((s) => {
                  const statusColor = s.status === 'PAID' ? '#4caf50'
                    : s.status === 'VOIDED' ? '#e53935'
                    : s.status === 'REVERSED' ? '#ff9800'
                    : s.status === 'REVERSAL' ? '#e53935'
                    : D.muted;
                  return (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [styles.customerRow, { paddingHorizontal: 16, borderBottomColor: D.border, backgroundColor: pressed ? D.elevated : 'transparent' }]}
                      onPress={() => setOrderDetailSale(s)}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.customerName, { color: D.text }]}>{s.invoice_no}</Text>
                            <View style={{ backgroundColor: statusColor + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>{s.status}</Text>
                            </View>
                          </View>
                          <Text style={[styles.customerPhone, { color: D.muted, marginTop: 2 }]}>
                            {s.customer_name ?? 'Walk-in'} · {s.payment_method} · {dayjs(s.created_at).format('D MMM, HH:mm')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 4 }}>
                          <Text style={{ color: D.text, fontWeight: '700', fontSize: 14 }}>KES {s.total.toLocaleString()}</Text>
                          <MaterialCommunityIcons name="chevron-right" size={16} color={D.muted} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              {(allOrders ?? []).length === 0 && (
                <Text style={{ color: D.muted, textAlign: 'center', padding: 24 }}>No orders found</Text>
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setOrdersDialogOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Order Detail */}
        <Dialog visible={!!orderDetailSale} onDismiss={() => setOrderDetailSale(null)} style={{ backgroundColor: D.surface, maxHeight: '90%' }}>
          <Dialog.Title style={{ color: D.text }}>
            {orderDetailSale?.invoice_no}
            {'  '}
            {orderDetailSale && (() => {
              const sc = orderDetailSale.status === 'PAID' ? '#4caf50'
                : orderDetailSale.status === 'VOIDED' ? '#e53935'
                : orderDetailSale.status === 'REVERSED' ? '#ff9800'
                : '#e53935';
              return (
                <View style={{ backgroundColor: sc + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, display: 'flex' }}>
                  <Text style={{ color: sc, fontSize: 11, fontWeight: '800' }}>{orderDetailSale.status}</Text>
                </View>
              );
            })()}
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 2 }}>{dayjs(orderDetailSale?.created_at).format('D MMM YYYY, HH:mm')}</Text>
            {orderDetailSale?.customer_name && (
              <Text style={{ color: D.muted, fontSize: 12, marginBottom: 8 }}>Customer: {orderDetailSale.customer_name}</Text>
            )}
            <ScrollView style={{ maxHeight: 320 }}>
              {/* Items */}
              {orderDetail ? (
                <>
                  <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: D.border }}>
                    <Text style={{ flex: 3, fontSize: 11, fontWeight: '700', color: D.muted }}>ITEM</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: D.muted, textAlign: 'center' }}>QTY</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: D.muted, textAlign: 'right' }}>TOTAL</Text>
                  </View>
                  {(orderDetail.items ?? []).map((item: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: D.border + '66' }}>
                      <View style={{ flex: 3 }}>
                        <Text style={{ color: D.text, fontSize: 13, fontWeight: '600' }}>{item.product_name}</Text>
                        <Text style={{ color: D.muted, fontSize: 11 }}>KES {item.unit_price?.toLocaleString()} each</Text>
                      </View>
                      <Text style={{ flex: 1, color: D.text, fontSize: 13, textAlign: 'center' }}>{item.qty}</Text>
                      <Text style={{ flex: 1, color: D.text, fontSize: 13, fontWeight: '700', textAlign: 'right' }}>KES {item.total?.toFixed(0)}</Text>
                    </View>
                  ))}
                  {/* Totals */}
                  <View style={{ marginTop: 12, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: D.muted, fontSize: 13 }}>Subtotal</Text>
                      <Text style={{ color: D.text, fontSize: 13 }}>KES {orderDetail.subtotal?.toFixed(0)}</Text>
                    </View>
                    {(orderDetail.discount ?? 0) > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: D.muted, fontSize: 13 }}>Discount</Text>
                        <Text style={{ color: '#e53935', fontSize: 13 }}>-KES {orderDetail.discount?.toFixed(0)}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: D.muted, fontSize: 13 }}>VAT</Text>
                      <Text style={{ color: D.text, fontSize: 13 }}>KES {orderDetail.tax_amount?.toFixed(0)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: D.border }}>
                      <Text style={{ color: D.text, fontWeight: '800', fontSize: 15 }}>TOTAL</Text>
                      <Text style={{ color: D.accent, fontWeight: '900', fontSize: 15 }}>KES {orderDetail.total?.toFixed(0)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ color: D.muted, fontSize: 13 }}>Payment</Text>
                      <Text style={{ color: D.text, fontWeight: '600', fontSize: 13 }}>{orderDetail.payment_method}</Text>
                    </View>
                    {orderDetail.mpesa_ref && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: D.muted, fontSize: 13 }}>Ref</Text>
                        <Text style={{ color: D.text, fontSize: 13 }}>{orderDetail.mpesa_ref}</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <ActivityIndicator style={{ marginTop: 20 }} color={D.accent} />
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            {orderDetailSale?.status === 'PAID' && user?.role === 'ADMIN' && (
              <Button textColor="#f59e0b" onPress={() => setOrderReverseOpen(true)}>Reverse</Button>
            )}
            <Button
              textColor={D.accent}
              icon="printer"
              onPress={async () => {
                if (orderDetail) {
                  setOrderDetailSale(null);
                  await printReceipt(orderDetail);
                }
              }}
            >
              Reprint
            </Button>
            <Button textColor={D.muted} onPress={() => setOrderDetailSale(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Order Reverse Dialog */}
        <Dialog visible={orderReverseOpen} onDismiss={() => { setOrderReverseOpen(false); setOrderReverseReason(''); }} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Reverse — {orderDetailSale?.invoice_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: D.muted, marginBottom: 12, fontSize: 13 }}>
              This will create a negative record restoring stock and reversing the payment.
            </Text>
            <RNTextInput
              placeholder="Reason for reversal *"
              placeholderTextColor={D.muted}
              value={orderReverseReason}
              onChangeText={setOrderReverseReason}
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated }]}
              multiline
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => { setOrderReverseOpen(false); setOrderReverseReason(''); }}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor="#f59e0b"
              textColor="#fff"
              loading={orderReverseMutation.isPending}
              onPress={() => {
                if (!orderReverseReason.trim()) { Alert.alert('Reason Required', 'Enter a reason for the reversal.'); return; }
                orderReverseMutation.mutate({ saleId: orderDetailSale!.id, reason: orderReverseReason.trim() });
              }}
            >
              Confirm Reversal
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Controls Menu */}
        <Dialog visible={controlsMenuOpen} onDismiss={() => setControlsMenuOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Controls</Dialog.Title>
          <Dialog.Content style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
            {[
              { icon: 'package-variant', label: 'Orders', sub: 'View all previous orders', onPress: () => { setControlsMenuOpen(false); setOrdersDialogOpen(true); } },
              { icon: 'printer-outline', label: 'Reprint Receipt', sub: 'Reprint a recent sale', onPress: () => { setControlsMenuOpen(false); setReprintDialogOpen(true); } },
              { icon: 'refresh', label: 'Reload Products', sub: 'Refresh product catalogue', onPress: handleReload },
              { icon: 'cash-register', label: 'Close Register', sub: "View today's sales totals", onPress: () => { setControlsMenuOpen(false); setCloseRegisterOpen(true); } },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [styles.controlMenuItem, { borderBottomColor: D.border, backgroundColor: pressed ? D.elevated : 'transparent' }]}
              >
                <View style={[styles.controlMenuIcon, { backgroundColor: D.elevated }]}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={D.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: D.text, fontWeight: '700', fontSize: 14 }}>{item.label}</Text>
                  <Text style={{ color: D.muted, fontSize: 12 }}>{item.sub}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={D.muted} />
              </Pressable>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setControlsMenuOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Close Register */}
        <Dialog visible={closeRegisterOpen} onDismiss={() => setCloseRegisterOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Close Register</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 16 }}>{dayjs().format('dddd, D MMMM YYYY')}</Text>
            {dailySummary ? (
              <View>
                {[
                  { label: 'Total Sales', value: dailySummary.total_sales.toString(), accent: false },
                  { label: 'Total Revenue', value: `KES ${dailySummary.total_revenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, accent: true },
                  { label: 'Cash', value: `KES ${dailySummary.cash_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, accent: false },
                  { label: 'M-Pesa', value: `KES ${dailySummary.mpesa_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, accent: false },
                  { label: 'Credit', value: `KES ${dailySummary.credit_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, accent: false },
                ].map((row) => (
                  <View key={row.label} style={[styles.registerRow, { borderBottomColor: D.border }]}>
                    <Text style={{ color: D.muted, fontSize: 13 }}>{row.label}</Text>
                    <Text style={{ color: row.accent ? D.accent : D.text, fontWeight: row.accent ? '900' : '700', fontSize: row.accent ? 16 : 13 }}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: D.muted, textAlign: 'center' }}>Loading...</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setCloseRegisterOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Reprint Dialog */}
        <Dialog visible={reprintDialogOpen} onDismiss={() => setReprintDialogOpen(false)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Reprint Receipt</Dialog.Title>
          <Dialog.Content>
            <Searchbar
              placeholder="Search invoice or customer..."
              value={reprintSearch}
              onChangeText={setReprintSearch}
              style={{ marginBottom: 8, backgroundColor: D.elevated }}
            />
            {(recentSales ?? [])
              .filter((s) => !reprintSearch.trim() ||
                s.invoice_no.toLowerCase().includes(reprintSearch.toLowerCase()) ||
                (s.customer_name ?? '').toLowerCase().includes(reprintSearch.toLowerCase()))
              .slice(0, 8)
              .map((s) => (
                <Pressable key={s.id} style={[styles.customerRow, { borderBottomColor: D.border }]} onPress={() => handleReprint(s)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={[styles.customerName, { color: D.text }]}>{s.invoice_no}</Text>
                      <Text style={[styles.customerPhone, { color: D.muted }]}>{s.customer_name ?? 'Walk-in'} · {dayjs(s.created_at).format('HH:mm')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ color: D.text, fontWeight: '700', fontSize: 13 }}>KES {s.total.toLocaleString()}</Text>
                      <MaterialCommunityIcons name="printer" size={16} color={D.accent} />
                    </View>
                  </View>
                </Pressable>
              ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={D.muted} onPress={() => setReprintDialogOpen(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Quantity Input Dialog */}
        <Dialog visible={!!qtyDialogItem} onDismiss={() => setQtyDialogItem(null)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Set Quantity</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 8, color: D.muted }}>{qtyDialogItem?.product_name}</Text>
            {qtyDialogItem?.track_stock === 1 && qtyDialogItem?.stock_qty != null && (
              <Text style={{ marginBottom: 8, color: D.warning, fontSize: 12 }}>
                {qtyDialogItem.stock_qty} in stock
              </Text>
            )}
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

        {/* Price Override Dialog */}
        <Dialog visible={!!priceEditItem} onDismiss={() => setPriceEditItem(null)} style={{ backgroundColor: D.surface }}>
          <Dialog.Title style={{ color: D.text }}>Set Selling Price</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 2, color: D.muted, fontWeight: '600' }}>{priceEditItem?.product_name}</Text>
            {priceEditItem?.original_price != null && (
              <Text style={{ marginBottom: 10, fontSize: 12, color: D.muted }}>
                Catalogue price: KES {priceEditItem.original_price.toLocaleString()}
              </Text>
            )}
            <RNTextInput
              value={priceEditInput}
              onChangeText={setPriceEditInput}
              keyboardType="decimal-pad"
              style={[styles.darkInput, { color: D.text, borderColor: D.border, backgroundColor: D.elevated, fontSize: 24, textAlign: 'center', fontWeight: '700' }]}
              placeholderTextColor={D.muted}
              autoFocus
              selectTextOnFocus
              placeholder="0.00"
              onSubmitEditing={() => {
                const p = parseFloat(priceEditInput);
                if (priceEditItem && !isNaN(p) && p >= 0) updateUnitPrice(priceEditItem.product_id, p);
                setPriceEditItem(null);
              }}
            />
            <Text style={{ fontSize: 11, color: D.muted, textAlign: 'center', marginTop: 8 }}>
              Applies to this sale only. Any item discount will be cleared.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            {priceEditItem?.original_price != null && priceEditItem.unit_price !== priceEditItem.original_price && (
              <Button
                textColor={D.muted}
                onPress={() => {
                  updateUnitPrice(priceEditItem.product_id, priceEditItem.original_price!);
                  setPriceEditItem(null);
                }}
              >
                Reset
              </Button>
            )}
            <Button textColor={D.muted} onPress={() => setPriceEditItem(null)}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor={D.accent}
              onPress={() => {
                const p = parseFloat(priceEditInput);
                if (priceEditItem && !isNaN(p) && p >= 0) updateUnitPrice(priceEditItem.product_id, p);
                setPriceEditItem(null);
              }}
            >
              Set Price
            </Button>
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
                    <Text style={[styles.holdSub, { color: D.muted }]}>{h.customer_name ?? 'No customer'} · {(h.items?.length ?? 0)} items</Text>
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
                <Text style={{ color: D.muted, fontSize: 11 }}>Balance: KES {selectedCustomer.credit_balance.toLocaleString()} · {loyaltyBalance} pts</Text>
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
  // Product grid — 3 columns
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
  controlMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  controlMenuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  registerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
});
