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
        q: 'How do I set up Nexora POS for the first time?',
        a: '1) Open the app and log in with the default PIN (1234 — change it immediately in Settings → User Management).\n2) Go to Settings → Business Details and fill in your business name, phone, address, and VAT/PIN number. Tap Save.\n3) Go to Products and add your products with prices.\n4) Go to Settings → Receipt Printer and connect your thermal printer.\n5) Open a shift from Settings → Shift Management.\nYou are ready to make your first sale!',
      },
      {
        q: 'How do I open a shift?',
        a: 'Go to Settings → Shift Management. Tap "No Open Shift" and enter your opening cash amount (the float in the drawer). Tap "Open Shift". Your shift is now live and all sales are tracked to this session.',
      },
      {
        q: 'How do I add my business details?',
        a: 'Go to Settings → Business Details. Fill in your business name, phone, address, VAT/PIN number, and receipt footer message, then tap Save Business Settings. These details appear on every printed receipt.',
      },
      {
        q: 'How do I add products?',
        a: 'Go to Products → tap the + button (bottom right). Fill in:\n• Name — what shows on the receipt\n• Selling Price — what the customer pays\n• Cost Price — what you paid (used for profit reports)\n• VAT Rate — 16% for standard goods, 0% for exempt\n• Stock Qty — current stock on hand\nTap Save. The product immediately appears on the POS screen.',
      },
      {
        q: 'How do I add product categories?',
        a: 'On the Products screen, tap the category icon in the top bar. Tap + to add a new category with a name and colour. Categories appear as filter chips on the POS screen to help cashiers find products faster.',
      },
      {
        q: 'How do I add customers?',
        a: 'Go to Customers → tap the + button. Enter the customer\'s name, phone number, and email. The phone number is used for WhatsApp and SMS receipts. Customers can also earn loyalty points and buy on credit.',
      },
      {
        q: 'How do I change my PIN?',
        a: 'Go to Settings → User Management. Add a new user with your name and a new 4-digit PIN. If you are the Admin, you can also edit existing users. The PIN is what you use to log in from the lock screen.',
      },
      {
        q: 'How do I add more cashiers?',
        a: 'Go to Settings → User Management. Enter the cashier\'s full name, choose a 4-digit PIN, select the role (CASHIER or ADMIN), and tap Add User. Each cashier logs in with their own PIN and all their sales are tracked separately.',
      },
      {
        q: 'Does Nexora POS work without internet?',
        a: 'Yes. All sales, inventory, and customer data are stored locally on your device. You can sell, print receipts, and manage stock with no internet connection. Internet is only needed for M-Pesa STK Push, eTIMS submission, WhatsApp/SMS receipts, and app updates.',
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
        a: 'On the POS screen, tap products to add them to the cart. Adjust quantities with + / −. When ready, tap Checkout, choose a payment method (Cash, M-Pesa, Credit, or Split), and tap Confirm Sale. A receipt prints automatically if a printer is connected.',
      },
      {
        q: 'How do I apply a discount to the whole order?',
        a: 'On the checkout screen, there is an "Order Discount (KES)" field. Enter the discount amount before confirming the sale. This is deducted from the subtotal before VAT calculation.',
      },
      {
        q: 'How do I apply a discount to a single item?',
        a: 'On the cart, tap the item\'s price/total (right side). An "Item Discount" dialog appears. Enter the discount amount in KES and tap Apply. The item total updates immediately.',
      },
      {
        q: 'How do I change the quantity of an item?',
        a: 'Tap the + or − buttons next to an item in the cart. For a specific or decimal quantity (e.g. 2.5 kg), long-press the quantity number to open a keyboard input. Tap 0 or − to remove the item.',
      },
      {
        q: 'How do I remove an item from the cart?',
        a: 'Tap the − button until the quantity reaches zero — the item is removed. Or swipe left on the item and tap Delete.',
      },
      {
        q: 'How do I accept split payment (Cash + M-Pesa)?',
        a: 'On the checkout screen, select "Split (Cash + M-Pesa)". Enter the cash amount the customer is paying — the M-Pesa portion fills in automatically. Send the STK Push or enter the M-Pesa confirmation code when done.',
      },
      {
        q: 'How do I park a sale and serve another customer?',
        a: 'Tap the "Hold" button in the cart footer. Give the hold a label (e.g. "Table 3" or "John"). To resume, tap the pause icon in the top bar of the POS screen and select the held sale.',
      },
      {
        q: 'How do I void or refund a sale?',
        a: 'Go to Sales → find the sale → tap it to open details → tap "Void Sale". Voiding restores stock automatically. For a cash refund, record the outflow in the Cash Drawer (Settings → Cash Drawer → Cash Out).',
      },
      {
        q: 'How do I process an M-Pesa payment?',
        a: 'Select M-Pesa as the payment method. If Daraja API is configured, enter the customer\'s phone number and tap "Send STK Push" — the customer receives a prompt on their phone. After they confirm, the payment is complete. Without Daraja, ask the customer to send manually and enter their confirmation code.',
      },
      {
        q: 'How do I sell on credit?',
        a: 'First select a customer using the "+ Customer" button. The customer must exist in your Customers list. Then choose "CREDIT" as the payment method. The sale amount is added to the customer\'s outstanding balance.',
      },
      {
        q: 'How do I use loyalty points?',
        a: 'Select a customer who has loyalty points. On the checkout screen, a "Redeem Loyalty Points" field appears showing their available balance. Enter the points to redeem (each point = KES 0.10). The discount is applied to the total.',
      },
      {
        q: 'How do I create a quotation?',
        a: 'Go to Quotations (via Settings menu). Tap + to create a new quote. Add a customer, add items, and set prices. Share the quote as a PDF. When the customer accepts, open the quote and tap "Convert to Sale".',
      },
      {
        q: 'How do I search for a product quickly?',
        a: 'On the POS screen, tap the search icon (top right of the product grid). Type the product name or scan its barcode. Use category chips to filter by category.',
      },
      {
        q: 'Can I add a note to a sale?',
        a: 'Yes. On the checkout screen, there is an "Add Note" field. This note appears on the receipt and in the sale record. Useful for order instructions, table numbers, or reference codes.',
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
        a: 'Enable "Track Stock" on a product. Each confirmed sale automatically deducts from stock. When you receive a Purchase Order, stock is added. The stock history (stock log) records every movement.',
      },
      {
        q: 'How do I receive stock from a supplier?',
        a: 'Go to Purchase Orders → tap + to create a new PO. Select your supplier, add items and quantities ordered. When stock arrives physically, open the PO → tap "Receive Stock" → enter actual quantities received. Stock is added immediately.',
      },
      {
        q: 'How do I do a stock count (stocktake)?',
        a: 'Go to Stocktake → tap "Start Stock Count". The app lists all products. Count each one physically and enter the actual number. The app shows the difference (variance). Tap the ✓ to complete and apply the corrections.',
      },
      {
        q: 'How do I record wasted or damaged stock?',
        a: 'On the Products screen, tap ⋮ on a product → "Record Wastage". Enter the quantity lost, choose a reason (Damaged, Expired, Theft, Spillage, etc.). Stock is deducted and the reason is logged.',
      },
      {
        q: 'How do I set a low stock alert?',
        a: 'Edit a product → enable "Track Stock" → set the "Low Stock Alert at" quantity. The dashboard and product card show a red warning badge when stock reaches this threshold.',
      },
      {
        q: 'How do I add a supplier?',
        a: 'Go to Suppliers (via Settings menu). Tap + and enter the supplier name, phone, email, and payment terms. Suppliers appear in the Purchase Order form for restocking.',
      },
      {
        q: 'What are product variants?',
        a: 'Variants let you manage different versions of one product — e.g. "T-Shirt" in Small, Medium, Large, or "Juice" in 250ml, 500ml. Tap ⋮ → "Manage Variants" on a product to add variants with their own price adjustments and stock quantities.',
      },
      {
        q: 'How do I update a product\'s price?',
        a: 'On the Products screen, tap the product card to open it, or tap ⋮ → Edit. Change the Selling Price and tap Save. The new price applies to all future sales immediately.',
      },
      {
        q: 'How do I bulk import products?',
        a: 'Go to Products → tap the import icon (top bar). Download the CSV template, fill it in with your product data, and upload it. Each row is one product. Required columns: Name, Price, Cost, VAT Rate.',
      },
      {
        q: 'My stock count is wrong after a sale — what happened?',
        a: 'Stock only deducts when "Track Stock" is enabled on the product. Check the product\'s settings. Also check the stock log (Products → ⋮ → Stock History) to see all movements and find the discrepancy.',
      },
      {
        q: 'How do I record expenses?',
        a: 'Go to Expenses (via Settings menu). Tap + to log an expense with the category, amount, payment method, and date. Expenses appear in the Profit/Loss report as deductions.',
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
        a: 'Customers earn 1 point for every KES 100 spent. Points are awarded automatically on each paid sale. 1 point = KES 0.10 when redeemed as a discount. Points are shown on the customer profile and on receipts.',
      },
      {
        q: 'How do I manually adjust a customer\'s loyalty points?',
        a: 'Go to Customers → tap the customer → tap ⋮ → "Adjust Points". Enter the number to add (positive) or deduct (negative) and a reason. This is useful for correcting errors or running a promotion.',
      },
      {
        q: 'How do I view a customer\'s purchase history?',
        a: 'Go to Customers → tap the customer card. The detail screen shows their total spend, number of visits, loyalty points, credit balance, and a list of all past sales. Tap a sale to see its full details.',
      },
      {
        q: 'How do I view and share a customer statement?',
        a: 'Go to Customers → tap ⋮ on a customer → "View Statement". This shows their credit balance, all credit transactions, and payments. Tap "Share PDF" to send via WhatsApp or email.',
      },
      {
        q: 'How do I collect payment on a credit balance?',
        a: 'When a customer pays their credit: on the POS screen, select the customer. In the checkout dialog, the outstanding credit balance is shown. Take the payment (Cash or M-Pesa) and record a "Credit Payment" — this reduces the balance.',
      },
      {
        q: 'How do I set a customer\'s credit limit?',
        a: 'Go to Customers → tap the customer → tap ⋮ → Edit. Set the "Credit Limit (KES)" field. The POS will warn you if a credit sale would exceed this limit.',
      },
      {
        q: 'What is a Layaway?',
        a: 'A layaway lets a customer reserve an item by paying a deposit, then pays the remaining balance in instalments. The goods are held until fully paid. Go to the POS screen → tap "Layaway". Create the layaway with total amount and initial deposit.',
      },
      {
        q: 'How do I add a payment to a layaway?',
        a: 'Go to Layaway → tap the customer\'s layaway record → tap "Add Payment". Enter the amount and payment method. The balance updates automatically. When the balance reaches zero, the layaway is marked COMPLETED.',
      },
      {
        q: 'How do I cancel a layaway?',
        a: 'Go to Layaway → tap the layaway record → tap "Cancel Layaway". Decide whether to refund the deposit. Mark the refund method (Cash or M-Pesa) if applicable.',
      },
      {
        q: 'How do I send bulk SMS/WhatsApp to customers?',
        a: 'Go to Customers → tap the broadcast icon. Select customers or a segment (e.g. all with loyalty points). Write your message and tap Send. SMS requires Africa\'s Talking API configured in Settings.',
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
        a: 'The Dashboard shows today\'s total revenue, number of transactions, top products, and payment method breakdown. Pull down to refresh. For detailed reports, go to the Reports tab.',
      },
      {
        q: 'How do I filter reports by date range?',
        a: 'On the Reports screen, the date pickers at the top let you set a custom From and To date. Tap "Today", "This Week", or "This Month" for quick shortcuts.',
      },
      {
        q: 'What is the Profit/Loss report?',
        a: 'Go to Reports → Profit/Loss tab. This shows gross revenue minus COGS (cost of goods sold, calculated from product cost price × quantity sold). The difference is your gross profit. Add expenses from the Expenses screen to get net profit.',
      },
      {
        q: 'What is the daily reconciliation?',
        a: 'Go to Reports → Reconcile tab. This shows expected Cash in the drawer (opening cash + cash sales) and expected M-Pesa total. Enter your actual physical cash count. The variance tells you if cash is over or short.',
      },
      {
        q: 'How do I prepare my VAT report for KRA?',
        a: 'Go to Reports → VAT Report tab. Select the month. The report shows total VAT collected, taxable sales, and gross revenue. Use the "Export" button to download a CSV for your accountant or iTax monthly filing.',
      },
      {
        q: 'What is the Stock Report?',
        a: 'Go to Reports → Stock Report tab. This lists every product with current stock, value at cost, and value at selling price. Useful for insurance, banking, or understanding tied-up capital.',
      },
      {
        q: 'What does the Analytics screen show?',
        a: 'Analytics shows visual charts: revenue trend over time, peak selling hours, payment method mix (donut chart), top-selling products, category performance bars, and cashier performance. Filter by 7, 14, or 30 days.',
      },
      {
        q: 'How do I see which cashier is selling the most?',
        a: 'Go to Analytics → scroll to the "Cashier Performance" section. It shows each cashier\'s total revenue and number of sales for the selected period with a progress bar comparison.',
      },
      {
        q: 'How do I export a report to Excel or PDF?',
        a: 'On any report screen, tap the share icon (top right). Choose CSV (opens in Excel) or PDF. The file is shared via the Android share sheet — save to Google Drive, WhatsApp, or email.',
      },
      {
        q: 'My report totals don\'t match my M-Pesa statement — why?',
        a: 'The app records what is entered during the sale. If a cashier entered the wrong M-Pesa code or skipped entering one, the report may differ. Check individual sale records in the Sales screen and cross-reference with your M-Pesa statement.',
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
        a: '1) Pair the printer in Android Settings → Bluetooth first.\n2) Open Nexora POS → Settings → Receipt Printer → tap "Setup Printer".\n3) Select Bluetooth from the list.\n4) The paired printer appears — tap it to connect.\n5) Tap "Test Print" to confirm.',
      },
      {
        q: 'How do I connect a Wi-Fi receipt printer?',
        a: 'Go to Settings → Receipt Printer → select Wi-Fi/TCP. Enter your printer\'s IP address (find it on the printer\'s network config printout, usually 192.168.x.x) and port (usually 9100). Tap Save, then Test Print.',
      },
      {
        q: 'My printer is not printing — what do I do?',
        a: '1) Is the printer powered on and loaded with paper?\n2) Bluetooth: open Android Settings → Bluetooth → verify it shows "Connected" for your printer.\n3) Wi-Fi: check the printer\'s IP has not changed (some printers get a new IP after restart — set a static IP in your router).\n4) Tap "Test Print" in Settings → Receipt Printer.\n5) Restart both the printer and the app.',
      },
      {
        q: 'The receipt is printing blank — what\'s wrong?',
        a: 'The paper is probably loaded upside down. Thermal paper only prints on the coated side. Take out the roll, turn it over, and reload. The shiny/smooth side should face the print head.',
      },
      {
        q: 'The receipt text is garbled or has symbols — what do I do?',
        a: 'The character encoding might not match. Go to Settings → Receipt Printer → Character Set → try "UTF-8" or "PC437" depending on your printer model. Most Epson and Xprinter models use PC437.',
      },
      {
        q: 'Can I print without a thermal printer?',
        a: 'Yes. If no printer is configured, the app offers to share the receipt as a PDF. You can print it from any cloud-connected printer or send it digitally. You can also send it via WhatsApp or SMS.',
      },
      {
        q: 'How do I reprint a past receipt?',
        a: 'Go to Sales → find the sale (search by invoice number or customer) → tap the sale → tap "Reprint Receipt". The receipt prints again on the connected printer or opens as a PDF.',
      },
      {
        q: 'How do I add my business logo to receipts?',
        a: 'Go to Settings → Business Details → tap "Upload Logo". The logo appears at the top of every printed receipt. Keep the image under 200×200 pixels for best results on thermal paper.',
      },
      {
        q: 'How do I send a receipt via WhatsApp or SMS?',
        a: 'After every sale where the customer has a phone number, a share dialog appears automatically. Tap "Send via WhatsApp" to open WhatsApp with the receipt pre-written. For SMS, Africa\'s Talking API must be configured in Settings → Integrations.',
      },
      {
        q: 'How do I change the receipt footer message?',
        a: 'Go to Settings → Business Details → "Receipt Footer". Enter a message like "Thank you! Come again." or your return policy. This appears at the bottom of every receipt.',
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
        a: '1) Register at developer.safaricom.co.ke and create an account.\n2) Create a new app under "My Apps" and note the Consumer Key and Consumer Secret.\n3) Apply for the M-Pesa Express (STK Push) API.\n4) Get your Passkey from the sandbox or Safaricom support.\n5) Enter all details in Settings → M-Pesa → Daraja API.\n6) Start with Sandbox environment for testing.',
      },
      {
        q: 'What phone numbers work in Sandbox mode?',
        a: 'In Sandbox, only Safaricom test numbers work: 254708374149 is the standard test number. The PIN for sandbox is always 1234. No real money moves in Sandbox.',
      },
      {
        q: 'What is the difference between Sandbox and Live mode?',
        a: 'Sandbox is for testing — no real money moves. Switch to Live only when your Daraja app has been approved for production by Safaricom. Live mode processes real M-Pesa payments.',
      },
      {
        q: 'The STK Push is not reaching the customer — what do I do?',
        a: '1) Verify the phone number format: must start with 2547... (e.g. 254712345678).\n2) Check your Consumer Key and Secret are correct and not expired.\n3) Ensure your Callback URL is a live, publicly accessible HTTPS endpoint.\n4) Check the Daraja portal to see if your app is active.\n5) Try the Daraja API test tool on the developer portal.',
      },
      {
        q: 'How do I record an M-Pesa payment manually?',
        a: 'On POS checkout, select M-Pesa. Skip the STK Push. Enter the M-Pesa confirmation code (e.g. QHX1234567) in the "M-Pesa Transaction Code" field and confirm. This records the reference on the receipt for your records.',
      },
      {
        q: 'How do I set up my M-Pesa Paybill or Till number?',
        a: 'Go to Settings → M-Pesa Configuration → Paybill/Till section. Enter your Paybill number or Till number. This number prints on receipts as instructions for customers who prefer to pay manually.',
      },
      {
        q: 'Can I use M-Pesa without Daraja API?',
        a: 'Yes. Without Daraja, the app shows the customer your Paybill/Till number and account number on screen. After the customer sends the money manually, you enter their confirmation code to complete the sale.',
      },
      {
        q: 'A customer was charged but the sale did not go through — what do I do?',
        a: 'First, do NOT process the sale again without verifying. Check your M-Pesa statement to confirm the payment. If confirmed, complete the sale manually by entering the M-Pesa code. If the customer was double-charged, initiate an M-Pesa reversal from your M-Pesa agent or Safaricom.',
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
        a: 'eTIMS (Electronic Tax Invoice Management System) is KRA\'s system for submitting sales invoices electronically in real time. VAT-registered businesses are required by law to submit each sale. The app does this automatically in the background.',
      },
      {
        q: 'Am I required to use eTIMS?',
        a: 'If you are VAT-registered in Kenya, yes. KRA requires all VAT-registered businesses to submit invoices electronically. For non-VAT businesses, it is currently optional but KRA has indicated it will become mandatory for all businesses.',
      },
      {
        q: 'How do I configure eTIMS?',
        a: 'Go to Settings → eTIMS / KRA. Enter:\n• Device Serial Number — from your KRA eTIMS device registration\n• Branch ID — usually "00" for single-branch businesses\n• Server URL — the KRA eTIMS endpoint\n• Your VAT/PIN in Business Details is used as the TIN automatically.',
      },
      {
        q: 'How do I know if a sale was submitted to eTIMS?',
        a: 'After each sale, the app submits in the background. If successful, an eTIMS QR code appears on the receipt. In the Sales screen, each sale shows a submission status badge (Submitted / Pending / Failed).',
      },
      {
        q: 'eTIMS submission is failing — what do I do?',
        a: '1) Check your internet connection is active.\n2) Verify your Device Serial Number and Branch ID in Settings → eTIMS.\n3) Ensure your VAT PIN in Business Details exactly matches your KRA PIN (no spaces or dashes).\n4) Check the eTIMS Server URL is correct and the KRA system is online.\n5) Check the Sales screen for the specific error message on the failed sale.',
      },
      {
        q: 'What is a Control Unit (CU)?',
        a: 'A Control Unit is a hardware device or software module approved by KRA to sign and submit invoices. Nexora POS uses a software-based CU integration. You do not need separate hardware.',
      },
      {
        q: 'Can I resubmit a failed eTIMS invoice?',
        a: 'Yes. In the Sales screen, tap a sale with "Failed" eTIMS status → tap "Retry eTIMS Submission". Ensure internet is connected. Failed submissions are queued automatically and retry when connectivity returns.',
      },
      {
        q: 'How does eTIMS affect my receipts?',
        a: 'Each submitted receipt includes a KRA-approved QR code and a unique CU Invoice Number. Customers can scan the QR code to verify the invoice on KRA\'s website. This is a legal requirement for VAT receipts.',
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
        a: 'All data is stored locally on your Android device in a SQLite database. No cloud account is required. The database is in the app\'s private storage — it is not accessible to other apps and is not sent anywhere without your action.',
      },
      {
        q: 'How do I back up my data?',
        a: 'Go to Settings → Data Management → Backup Database. This creates a timestamped copy of your database and opens the Android share sheet. Options: Save to Google Drive (recommended), WhatsApp to yourself, email, or USB to PC.',
      },
      {
        q: 'How often should I back up?',
        a: 'We recommend daily backups at the end of business. With Google Drive auto-sync, you can set a reminder to tap "Backup" each evening. A backup takes under 10 seconds.',
      },
      {
        q: 'How do I restore from a backup?',
        a: 'Go to Settings → Data Management → Restore Database. Tap "Choose Backup File" and select your .db file. WARNING: this replaces ALL current data with the backup. Take a fresh backup first if you want to preserve current data. Restart the app after restoring.',
      },
      {
        q: 'Can I move my data to a new phone?',
        a: '1) On old phone: backup to Google Drive or transfer the .db file via Bluetooth/USB.\n2) On new phone: install Nexora POS.\n3) Go to Settings → Data Management → Restore Database.\n4) Select the backup file and restore.\n5) Restart the app.',
      },
      {
        q: 'What happens if my phone is lost or stolen?',
        a: 'If you have been backing up regularly, install Nexora POS on your new phone and restore from the latest backup. If you had not backed up, that data is lost — which is why daily backups to Google Drive are strongly recommended.',
      },
      {
        q: 'How do I clear all data and start fresh?',
        a: 'Go to Settings → Data Management → Reset All Data. You will be asked to type your business name to confirm. This permanently deletes all sales, products, customers, and settings. This cannot be undone.',
      },
      {
        q: 'Can multiple devices share the same data?',
        a: 'Currently, Nexora POS is single-device only — data lives on one device. For multi-device use, back up from the main device and restore on others periodically to sync. Cloud/multi-device sync is on the roadmap.',
      },
    ],
  },
  {
    key: 'troubleshooting',
    icon: 'wrench',
    color: '#f97316',
    title: 'Troubleshooting',
    faqs: [
      {
        q: 'The app is running slowly — how do I fix it?',
        a: '1) Restart the app (fully close and reopen).\n2) Restart your Android device.\n3) Free up storage space — the app needs at least 500 MB free.\n4) Check how much data is stored: Settings → Data Management shows the database size.\n5) If you have tens of thousands of sales records, consider archiving old data.',
      },
      {
        q: 'I can\'t log in — I forgot my PIN.',
        a: 'If you are the only user and forgot your PIN, go to Settings from the login screen (there is a small "Admin Access" or "Forgot PIN?" option). You will need to enter your business registration details. Contact support with your business name if you are locked out completely.',
      },
      {
        q: 'The app crashed during a sale — did the sale go through?',
        a: 'Check the Sales screen. If the sale is listed, it was saved. If not, the sale did not complete. The stock was not deducted for incomplete sales. Re-enter the sale. For M-Pesa, check if the customer was charged before re-processing.',
      },
      {
        q: 'Products are not appearing on the POS screen.',
        a: '1) Check that the product is marked as "Active" (not disabled).\n2) If you are filtering by category, tap "All" to remove the filter.\n3) Pull down to refresh the product list.\n4) Try the search bar.',
      },
      {
        q: 'A sale shows the wrong total — what happened?',
        a: '1) Check if a discount was applied (order or item level).\n2) Check the VAT rate on the product — 16% adds to the total.\n3) Check if loyalty points were redeemed as a discount.\n4) Open the sale in Sales screen and review the full item breakdown.',
      },
      {
        q: 'WhatsApp receipt sharing is not working.',
        a: '1) Ensure WhatsApp is installed on the device.\n2) The customer must have a valid phone number saved (with country code 254).\n3) If WhatsApp opens but the message is blank, the customer\'s number may be incorrect.\n4) Check the number is registered on WhatsApp (the customer must be on WhatsApp).',
      },
      {
        q: 'SMS receipts are not sending.',
        a: '1) Go to Settings → Integrations → check Africa\'s Talking API Key is correctly entered.\n2) Check your Africa\'s Talking account has sufficient SMS credits.\n3) Ensure the Sender ID matches what is registered on your Africa\'s Talking account.\n4) Check your internet connection — SMS sending requires internet.',
      },
      {
        q: 'The dashboard numbers look wrong — sales not showing.',
        a: '1) The dashboard shows "today" by default. Check the date on your device is correct.\n2) Pull down to refresh.\n3) If sales are there but not showing, check the sale status — only "PAID" sales appear in revenue totals (VOIDED sales are excluded).',
      },
      {
        q: 'Stock is not being deducted after sales.',
        a: 'Go to Products → tap the product → edit it → ensure "Track Stock" is switched ON. Only products with stock tracking enabled have their stock deducted on sale.',
      },
      {
        q: 'The app asks for permissions I don\'t understand — which are needed?',
        a: '• Bluetooth — required for Bluetooth receipt printers\n• Local Network — required for Wi-Fi printers\n• Storage — required for backup/restore\n• Camera — required for barcode scanning\n• Notifications — optional, for low-stock alerts\n\nAll permissions are used only for the stated purpose and no data leaves your device.',
      },
      {
        q: 'How do I report a bug or request a feature?',
        a: 'Tap "Contact Support" at the top of this Help screen and message us on WhatsApp or email. Describe what you were doing, what you expected, and what happened instead. Screenshots are very helpful. We respond within 24 hours.',
      },
    ],
  },
  {
    key: 'tips',
    icon: 'lightbulb-on',
    color: '#eab308',
    title: 'Tips & Tricks',
    faqs: [
      {
        q: 'Speed up checkout with product shortcuts',
        a: 'The POS screen remembers which products you sell most. Your top products appear first. Use category chips to jump quickly to a specific product group. Assign barcodes to products so cashiers can scan instead of searching.',
      },
      {
        q: 'Use the search bar to find any product instantly',
        a: 'On the POS screen, tap the search icon and type the first 2–3 letters of a product name. This is faster than scrolling, especially for shops with 100+ products.',
      },
      {
        q: 'Set up product favourites for your best sellers',
        a: 'Go to Products → tap ⋮ on a product → "Mark as Favourite". Favourites appear at the top of the POS grid so cashiers can tap them without searching.',
      },
      {
        q: 'Use Hold to manage multiple orders at once',
        a: 'You can hold up to 5 sales simultaneously (e.g. for restaurant tables). Give each hold a clear label. Access held sales by tapping the pause icon on the POS screen. Great for restaurants and food stalls.',
      },
      {
        q: 'Speed up shift close with pre-counts',
        a: 'Before closing a shift, go to Reports → Reconcile tab. It shows your expected cash. Count your physical cash while the till is still open and enter the actual amount. Any variance is immediately visible so you can investigate before closing.',
      },
      {
        q: 'Use customer accounts to build loyalty',
        a: 'Always ask customers if they want to earn points. Assign the customer before the sale — even cash customers can build up points. Regular customers with points tend to come back more often. Run a double-points promotion on slow days.',
      },
      {
        q: 'Set a low stock level to avoid running out',
        a: 'For fast-moving items, set the low-stock threshold to 2–3 days\' supply. The dashboard shows a warning before you actually run out. Check the low-stock section of the Products screen every morning.',
      },
      {
        q: 'Use notes on sales for special orders',
        a: 'On the checkout screen, add a note (e.g. "No sugar", "Gift wrap", "Deliver to room 12"). The note prints on the receipt and shows in the sale record. Very useful for custom orders or service businesses.',
      },
      {
        q: 'Export reports at month-end for your accountant',
        a: 'On the last day of each month: export Sales (CSV), VAT Report (CSV), and Profit/Loss report (PDF). Email them to your accountant along with your M-Pesa statement. This covers all KRA and banking requirements.',
      },
      {
        q: 'Back up every evening to protect your data',
        a: 'Make it a habit: before locking up, go to Settings → Backup → save to Google Drive. It takes under 10 seconds. Store the last 7 backups so you can recover from any point in the past week.',
      },
      {
        q: 'Use the Analytics screen to make better buying decisions',
        a: 'Check Analytics → Top Products weekly. This shows what is actually selling vs what sits on the shelf. Use it to decide what to reorder (and in what quantity) and what products to discontinue.',
      },
      {
        q: 'The 24-hour peak hours chart helps with staffing',
        a: 'Analytics → scroll to Peak Hours. This shows when you are busiest. Use it to decide when to schedule extra staff and when you can operate lean. Most shops see peaks at 12–1 pm and 5–6 pm.',
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
