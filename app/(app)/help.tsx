import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Linking, Alert, Pressable } from 'react-native';
import { Text, Appbar, Searchbar, Card, Chip, Divider, Button, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { brand } from '../../src/theme';

// ─── Help content ─────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: string;
}

interface Section {
  key: string;
  icon: string;
  color: string;
  title: string;
  faqs: FaqItem[];
}

const SECTIONS: Section[] = [
  {
    key: 'getting-started',
    icon: 'rocket-launch',
    color: '#6f67ff',
    title: 'Getting Started',
    faqs: [
      {
        q: 'How do I open a shift?',
        a: 'Go to Settings → Shift Management. Tap "No Open Shift" and enter your opening cash amount. This tracks your session\'s sales and cash drawer.',
      },
      {
        q: 'How do I add my business details?',
        a: 'Go to Settings → Business Details. Fill in your business name, phone, address, VAT/PIN number, and receipt footer message, then tap Save Business Settings.',
      },
      {
        q: 'How do I add products?',
        a: 'Go to Products → tap the + button (bottom right). Fill in the product name, selling price, cost price, VAT rate, and stock quantity. Tap Save.',
      },
      {
        q: 'How do I add product categories?',
        a: 'On the Products screen, tap the grid icon in the top bar to open Categories. Tap + to add a new category with a name and colour.',
      },
      {
        q: 'How do I add customers?',
        a: 'Go to Customers → tap the + button. Enter the customer\'s name, phone, and email. Phone numbers are used for WhatsApp and SMS receipts.',
      },
    ],
  },
  {
    key: 'pos',
    icon: 'cash-register',
    color: brand.primary,
    title: 'Point of Sale',
    faqs: [
      {
        q: 'How do I make a sale?',
        a: 'On the POS screen, tap products to add them to the cart. When ready, tap Checkout, choose a payment method, and tap Confirm Sale. A receipt prints automatically.',
      },
      {
        q: 'How do I apply a discount to the whole order?',
        a: 'On the checkout screen, there is an "Order Discount (KES)" field. Enter the discount amount before confirming the sale.',
      },
      {
        q: 'How do I apply a discount to a single item?',
        a: 'On the cart, tap the item\'s total amount (right side). An "Item Discount" dialog appears. Enter the discount amount and tap Apply.',
      },
      {
        q: 'How do I change the quantity of an item?',
        a: 'Tap the + or − buttons next to an item. For a specific quantity (e.g. 12.5 kg), long-press the quantity number to open a keyboard input.',
      },
      {
        q: 'How do I accept split payment (Cash + M-Pesa)?',
        a: 'On the checkout screen, select "Split (Cash + M-Pesa)". Enter the cash amount — the M-Pesa portion fills in automatically. Enter the M-Pesa confirmation code.',
      },
      {
        q: 'How do I park a sale and serve another customer?',
        a: 'Tap the "Hold" button in the cart footer. Give it a label (e.g. "Table 3"). To resume, tap the pause icon in the top bar of the POS screen.',
      },
      {
        q: 'How do I process an M-Pesa payment?',
        a: 'Select M-Pesa as the payment method. Enter the customer\'s phone and tap "Prompt" to send an STK Push (requires Daraja API setup in Settings). After the customer confirms, enter the M-Pesa code.',
      },
      {
        q: 'How do I sell on credit?',
        a: 'First select a customer using the "+ Customer" button. Then choose "CREDIT" as the payment method. The amount is added to the customer\'s balance.',
      },
      {
        q: 'How do I use loyalty points?',
        a: 'Select a customer who has loyalty points. On the checkout screen, a "Redeem Loyalty Points" field appears. Enter the number of points to redeem — each point is worth KES 0.10.',
      },
      {
        q: 'How do I create a quotation?',
        a: 'Go to the Quotations screen (via Settings or the navigation). Create a quote with items, then convert it to a sale when the customer accepts.',
      },
    ],
  },
  {
    key: 'inventory',
    icon: 'package-variant',
    color: '#f59e0b',
    title: 'Inventory',
    faqs: [
      {
        q: 'How does stock tracking work?',
        a: 'Enable "Track Stock" on a product. Each sale automatically deducts from stock. Stock is added when you receive a Purchase Order.',
      },
      {
        q: 'How do I receive stock from a supplier?',
        a: 'Go to Purchase Orders → create a new PO with your supplier and items. When stock arrives, open the PO and tap "Receive Stock". Enter the quantities received.',
      },
      {
        q: 'How do I do a stock count?',
        a: 'Go to Stocktake → tap "Start Stock Count". Count each product and enter the actual quantities. Tap the ✓ button to complete — you can choose to apply the corrections.',
      },
      {
        q: 'How do I record wasted or damaged stock?',
        a: 'On the Products screen, tap the menu (⋮) on a product → "Record Wastage". Enter the quantity lost, choose a reason (Damaged, Expired, Theft, etc.).',
      },
      {
        q: 'How do I set a low stock alert?',
        a: 'Edit a product and enable "Track Stock". Set the "Low Stock Alert at" threshold. Products at or below this level show a red warning on the product card.',
      },
      {
        q: 'What are product variants?',
        a: 'Variants let you manage different versions of one product — e.g. "T-Shirt" in Small, Medium, Large. Tap ⋮ → "Manage Variants" on a product to add variants with their own price adjustments and stock.',
      },
    ],
  },
  {
    key: 'customers',
    icon: 'account-group',
    color: '#3b82f6',
    title: 'Customers & Loyalty',
    faqs: [
      {
        q: 'How do loyalty points work?',
        a: 'Customers earn 1 point for every KES 100 spent. Points are awarded automatically on each sale. 1 point = KES 0.10 when redeemed. Points can be manually adjusted from the customer\'s profile.',
      },
      {
        q: 'How do I view a customer\'s statement?',
        a: 'Go to Customers → tap ⋮ on a customer → "View Statement". You\'ll see their credit balance, total sales, loyalty points, and full purchase history. Tap "Share PDF" to send it.',
      },
      {
        q: 'How do I clear a customer\'s credit balance?',
        a: 'On the POS screen, select the customer. The credit balance shows in the checkout dialog. Take a payment (Cash or M-Pesa) and record it via the Sales screen to reduce the balance.',
      },
      {
        q: 'What is a Layaway?',
        a: 'A layaway lets a customer reserve an item by paying a deposit, then pays the remaining balance over time. Go to the POS screen → tap "Layaway". Create a layaway with the total amount and deposit.',
      },
    ],
  },
  {
    key: 'reports',
    icon: 'chart-bar',
    color: '#22c55e',
    title: 'Reports & Analytics',
    faqs: [
      {
        q: 'How do I view today\'s sales summary?',
        a: 'The Dashboard shows today\'s revenue, number of transactions, and top products. The Reports tab shows detailed breakdowns by payment method and date range.',
      },
      {
        q: 'What is the Profit/Loss report?',
        a: 'Go to Reports → Profit/Loss tab. This shows your gross revenue minus estimated cost of goods sold (COGS). COGS is calculated from your product cost price × quantity sold.',
      },
      {
        q: 'What is the daily reconciliation?',
        a: 'Go to Reports → Reconcile tab. This shows expected Cash and M-Pesa totals from today\'s sales. Enter your actual cash count to see if there is any over or short.',
      },
      {
        q: 'How do I prepare my VAT report for KRA?',
        a: 'Go to Reports → VAT Report tab. This shows your total VAT collected, taxable sales, and gross revenue for the selected period. Use these figures for your KRA iTax monthly filing.',
      },
      {
        q: 'What does the Analytics screen show?',
        a: 'Analytics shows visual charts: revenue trend, peak selling hours, payment method breakdown, top products, category performance, and cashier performance — all filterable by 7/14/30 days.',
      },
    ],
  },
  {
    key: 'printing',
    icon: 'printer',
    color: '#8b5cf6',
    title: 'Receipt Printing',
    faqs: [
      {
        q: 'How do I connect a Bluetooth receipt printer?',
        a: 'Go to Settings → Receipt Printer → tap "Setup Printer" → select Bluetooth. Pair your printer in Android Settings first, then it will appear in the list. Tap to connect.',
      },
      {
        q: 'How do I connect a Wi-Fi receipt printer?',
        a: 'Go to Settings → Receipt Printer → select Wi-Fi/TCP. Enter your printer\'s IP address (e.g. 192.168.1.100) and port (usually 9100). Tap Save.',
      },
      {
        q: 'My printer is not printing — what do I do?',
        a: '1) Check the printer is powered on and has paper. 2) For Bluetooth: ensure it\'s paired in Android Settings. 3) For Wi-Fi: ensure your phone and printer are on the same Wi-Fi network. 4) Tap "Test Print" in Settings → Receipt Printer.',
      },
      {
        q: 'Can I print without a thermal printer?',
        a: 'Yes. If no printer is configured, the app offers to share the receipt as a PDF or print via your phone\'s built-in print dialog (supports AirPrint, Google Cloud Print, etc.).',
      },
      {
        q: 'How do I send a receipt via WhatsApp or SMS?',
        a: 'If the customer has a phone number, a share dialog appears automatically after every sale. Tap "Send via WhatsApp" or "Send via SMS". SMS requires Africa\'s Talking API configured in Settings → Integrations.',
      },
    ],
  },
  {
    key: 'mpesa',
    icon: 'cellphone',
    color: '#00a651',
    title: 'M-Pesa & Payments',
    faqs: [
      {
        q: 'How do I set up Daraja API for automatic STK Push?',
        a: 'Register at developer.safaricom.co.ke. Create an app to get Consumer Key, Consumer Secret, and Passkey. Enter these in Settings → M-Pesa Configuration → Daraja API section. Set environment to "Sandbox" for testing or "Live" for production.',
      },
      {
        q: 'What is the difference between Sandbox and Live mode?',
        a: 'Sandbox is for testing — no real money moves. Use test phone numbers like 254708374149. Switch to Live only when you have a production Daraja app approved by Safaricom.',
      },
      {
        q: 'The STK Push is not reaching the customer — what do I do?',
        a: '1) Verify the phone number format starts with 2547... 2) Check your Consumer Key and Secret are correct. 3) Ensure your Callback URL is a live HTTPS endpoint. 4) Check your Daraja app is active on the portal.',
      },
      {
        q: 'How do I record an M-Pesa payment manually?',
        a: 'On the POS checkout, select M-Pesa. Enter the M-Pesa confirmation code (e.g. QHX1234567) in the "M-Pesa Transaction Code" field. This records the reference on the receipt.',
      },
    ],
  },
  {
    key: 'etims',
    icon: 'shield-check',
    color: '#e53935',
    title: 'eTIMS / KRA',
    faqs: [
      {
        q: 'What is eTIMS?',
        a: 'eTIMS (Electronic Tax Invoice Management System) is KRA\'s system for submitting sales invoices electronically. If you are VAT-registered, you are required to submit each sale to KRA in real time.',
      },
      {
        q: 'How do I configure eTIMS?',
        a: 'Go to Settings → eTIMS / KRA Configuration. Enter your Device Serial Number (from KRA), Branch ID (usually 00), and the eTIMS server URL. Your VAT/PIN in Business Details is used as the TIN.',
      },
      {
        q: 'How do I know if a sale was submitted to eTIMS?',
        a: 'After each sale, the app automatically submits in the background. If submission succeeds, the eTIMS QR code appears on the printed receipt. Check the Sales screen for submission status.',
      },
      {
        q: 'eTIMS submission is failing — what do I do?',
        a: '1) Check your internet connection. 2) Verify your Device Serial and Branch ID in Settings. 3) Ensure your VAT PIN in Business Details matches your KRA PIN. 4) Check the eTIMS server URL is correct.',
      },
    ],
  },
  {
    key: 'data',
    icon: 'database',
    color: '#64748b',
    title: 'Data & Backup',
    faqs: [
      {
        q: 'Where is my data stored?',
        a: 'All data is stored locally on your Android device in a SQLite database. No internet connection is required for core POS functions. The database file is at: app data/SQLite/nexora_pos.db',
      },
      {
        q: 'How do I back up my data?',
        a: 'Go to Settings → Data Management → Backup Database. This creates a copy of your database file and opens the Android share sheet. Save to Google Drive, WhatsApp yourself, or email it.',
      },
      {
        q: 'How do I restore from a backup?',
        a: 'Go to Settings → Data Management → Restore Database. Select your backup file. WARNING: this replaces ALL current data. Restart the app after restoring.',
      },
      {
        q: 'Can I move my data to a new phone?',
        a: 'Yes. Back up on the old phone, transfer the .db file (via Google Drive, Bluetooth, or USB), then restore on the new phone. Install Nexora POS first.',
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HelpScreen() {
  const [search, setSearch] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.map(s => ({
      ...s,
      faqs: s.faqs.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    })).filter(s => s.faqs.length > 0 || s.title.toLowerCase().includes(q));
  }, [search]);

  const openWhatsApp = async () => {
    const url = 'https://wa.me/254700000000?text=Hi%2C%20I%20need%20help%20with%20Nexora%20POS';
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp not installed', 'Please contact support via email: support@nexorapos.com');
    }
  };

  const openEmail = () => {
    Linking.openURL('mailto:support@nexorapos.com?subject=Nexora%20POS%20Support');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color="#fff" onPress={() => router.back()} />
        <Appbar.Content title="Help & Support" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Search */}
        <Searchbar
          placeholder="Search help topics..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchbar}
          inputStyle={{ fontSize: 14 }}
        />

        {/* Contact Support */}
        <Card style={styles.supportCard}>
          <Card.Content>
            <Text style={styles.supportTitle}>Need more help?</Text>
            <Text style={styles.supportSub}>Our support team is available Mon–Sat, 8am–6pm EAT</Text>
            <View style={styles.supportBtns}>
              <Button
                mode="contained"
                icon="whatsapp"
                style={[styles.supportBtn, { backgroundColor: '#25D366' }]}
                onPress={openWhatsApp}
                compact
              >
                WhatsApp
              </Button>
              <Button
                mode="outlined"
                icon="email"
                style={styles.supportBtn}
                onPress={openEmail}
                compact
              >
                Email Us
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Quick links */}
        {!search && (
          <>
            <Text style={styles.sectionHeader}>Browse by Topic</Text>
            <View style={styles.quickGrid}>
              {SECTIONS.map((s) => (
                <Pressable
                  key={s.key}
                  style={styles.quickCard}
                  onPress={() => {
                    setOpenSection(openSection === s.key ? null : s.key);
                    setSearch('');
                  }}
                >
                  <View style={[styles.quickIcon, { backgroundColor: s.color + '18' }]}>
                    <MaterialCommunityIcons name={s.icon as any} size={22} color={s.color} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={2}>{s.title}</Text>
                  <Text style={styles.quickCount}>{s.faqs.length} articles</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* FAQ Sections */}
        <Text style={styles.sectionHeader}>{search ? 'Search Results' : openSection ? SECTIONS.find(s => s.key === openSection)?.title ?? 'All Topics' : 'All Articles'}</Text>

        {(search || openSection
          ? filtered.filter(s => !openSection || s.key === openSection || !!search)
          : filtered
        ).map((section) => (
          <Card key={section.key} style={styles.card}>
            {!search && !openSection && (
              <Pressable
                style={styles.sectionRow}
                onPress={() => setOpenSection(openSection === section.key ? null : section.key)}
              >
                <View style={[styles.sectionIcon, { backgroundColor: section.color + '18' }]}>
                  <MaterialCommunityIcons name={section.icon as any} size={18} color={section.color} />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.faqs.length}</Text>
                <MaterialCommunityIcons
                  name={openSection === section.key ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#aaa"
                />
              </Pressable>
            )}

            {(search || openSection === section.key || (!search && !openSection)) && (
              section.faqs.map((faq, fi) => {
                const faqKey = `${section.key}-${fi}`;
                const isOpen = openFaq === faqKey || !!search;
                return (
                  <View key={fi}>
                    {(fi > 0 || (!search && !openSection)) && <Divider />}
                    <Pressable
                      style={styles.faqRow}
                      onPress={() => setOpenFaq(isOpen && !search ? null : faqKey)}
                    >
                      <Text style={styles.faqQ}>{faq.q}</Text>
                      {!search && (
                        <MaterialCommunityIcons
                          name={isOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color="#aaa"
                        />
                      )}
                    </Pressable>
                    {isOpen && (
                      <View style={styles.faqABox}>
                        <Text style={styles.faqA}>{faq.a}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </Card>
        ))}

        {filtered.length === 0 && (
          <View style={styles.noResults}>
            <MaterialCommunityIcons name="magnify" size={40} color="#ddd" />
            <Text style={styles.noResultsText}>No results for "{search}"</Text>
            <Text style={styles.noResultsSub}>Try different keywords or contact support</Text>
          </View>
        )}

        {/* App version */}
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>Nexora POS v1.0.0</Text>
          <Text style={styles.versionSub}>Built for Kenyan SMEs · Offline-first</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  searchbar: { marginBottom: 16, borderRadius: 12, elevation: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  supportCard: { borderRadius: 14, marginBottom: 16, backgroundColor: brand.primary },
  supportTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 },
  supportSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 12 },
  supportBtns: { flexDirection: 'row', gap: 10 },
  supportBtn: { flex: 1, borderRadius: 8, borderColor: 'rgba(255,255,255,0.5)' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickCard: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 1 },
  quickIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 13, fontWeight: '700', color: '#111', lineHeight: 17 },
  quickCount: { fontSize: 11, color: '#aaa', marginTop: 3 },
  card: { borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  sectionCount: { fontSize: 12, color: '#aaa', marginRight: 4 },
  faqRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  faqQ: { flex: 1, fontSize: 13, fontWeight: '600', color: '#222', lineHeight: 18 },
  faqABox: { backgroundColor: '#f9f9f9', paddingHorizontal: 14, paddingBottom: 14 },
  faqA: { fontSize: 13, color: '#555', lineHeight: 20 },
  noResults: { alignItems: 'center', paddingVertical: 40 },
  noResultsText: { fontSize: 15, fontWeight: '600', color: '#bbb', marginTop: 12 },
  noResultsSub: { fontSize: 12, color: '#ccc', marginTop: 4 },
  versionRow: { alignItems: 'center', marginTop: 24 },
  versionText: { fontSize: 12, color: '#aaa' },
  versionSub: { fontSize: 11, color: '#ccc', marginTop: 2 },
});
