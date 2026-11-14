# Nexora POS

A standalone Android Point of Sale app for Kenyan businesses. Works fully offline with local SQLite storage. No server required. Sold separately from the Nexora ERP web system.

**KES 600/month** subscription via Google Play Billing.

---

## Features

- **Full POS Terminal** — split-panel product grid + live cart, cash/M-Pesa/credit payments
- **Inventory Management** — products with categories, barcode support, optional stock tracking
- **Customer Accounts** — customer database with credit balance tracking
- **Sales History** — full transaction log with itemised receipts
- **Reports** — daily, weekly and monthly revenue; payment breakdown; top products
- **Multi-User** — cashier and admin roles, each with their own 4-digit PIN
- **Business Settings** — name, address, VAT/PIN number, receipt footer, M-Pesa paybill/till
- **100% Offline** — all data stored locally in SQLite, no internet required for day-to-day use
- **eTIMS Ready** — VAT tracking and KRA PIN field prepared for eTIMS integration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 58 + React Native 0.88 |
| Navigation | Expo Router (file-based) |
| UI | React Native Paper v5 |
| Database | expo-sqlite (SQLite, WAL mode) |
| State/Cache | TanStack Query v5 |
| Subscriptions | RevenueCat (react-native-purchases) |
| Billing | Google Play Billing |
| Language | TypeScript |
| Build | EAS Build |

---

## App Flow

```
Launch
  │
  ├── Not subscribed ──► Subscription Screen (KES 600/month Google Play)
  │
  ├── First launch ────► Business Setup Screen
  │
  └── Returning user ──► PIN Login ──► Main App Tabs
```

### Main Tabs

| Tab | Description |
|---|---|
| Dashboard | Today's stats, top products, 7-day revenue trend |
| POS | Product grid, cart, checkout (Cash/M-Pesa/Credit) |
| Products | CRUD with categories, stock tracking, barcode, VAT |
| Customers | Customer database with credit balance |
| Sales | Transaction history with receipt viewer |
| Reports | Today / This Week / This Month revenue reports |
| Settings | Business details, M-Pesa config, user management |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Android Studio with an emulator **or** a physical Android device

### Install dependencies

```bash
cd nexora-pos
npm install
```

### Run in development (no Play Store needed)

The app detects when the RevenueCat API key is the placeholder value and skips the subscription check automatically, so you can test the full app without a Google Play subscription.

```bash
# Connect an Android device via USB with USB Debugging ON
# OR start an Android emulator in Android Studio

npx expo run:android
```

First run takes ~5 minutes to compile. Subsequent runs are fast.

**Default admin PIN:** `1234`

---

## Project Structure

```
nexora-pos/
├── app/
│   ├── _layout.tsx          # Root layout — DB init, RevenueCat gate, routing
│   ├── subscription.tsx     # Google Play paywall
│   ├── setup.tsx            # First-launch business setup
│   ├── (auth)/
│   │   └── index.tsx        # PIN login screen
│   └── (app)/
│       ├── _layout.tsx      # Bottom tab bar
│       ├── index.tsx        # Dashboard
│       ├── pos.tsx          # POS terminal
│       ├── products.tsx     # Product management
│       ├── customers.tsx    # Customer management
│       ├── sales.tsx        # Sales history
│       ├── reports.tsx      # Reports
│       └── settings.tsx     # Settings & users
├── src/
│   ├── theme.ts             # Brand colours and Paper theme
│   ├── components/
│   │   └── SplashScreen.tsx
│   └── db/
│       ├── database.ts      # SQLite init, schema, WAL mode
│       ├── settings.ts      # Key-value settings store
│       ├── products.ts      # Product & category queries
│       ├── customers.ts     # Customer queries
│       └── sales.ts         # Sale creation, reports, receipt fetch
├── app.json                 # Expo config — package ID, RevenueCat plugin
└── eas.json                 # EAS build profiles
```

---

## Database Schema

All data is stored locally in SQLite on the device.

| Table | Purpose |
|---|---|
| `settings` | Key-value store for business info, M-Pesa details |
| `categories` | Product categories with colour |
| `products` | Products with price, cost, VAT rate, stock |
| `customers` | Customers with credit balance |
| `users` | Cashier/admin users with PIN |
| `sales` | Sale header: invoice no, payment method, totals |
| `sale_items` | Line items per sale with VAT breakdown |
| `etims_submissions` | eTIMS KRA submission log (future use) |

---

## Building for Google Play

### 1. Set up RevenueCat

1. Create a [RevenueCat](https://www.revenuecat.com) account (free up to $2,500 MRR)
2. Create an Android app and get your API key
3. Create a product `nexora_pos_monthly` in Google Play Console (KES 600/month)
4. Link the product to a RevenueCat entitlement
5. Replace the API key placeholder in `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["react-native-purchases", { "androidApiKey": "YOUR_REVENUECAT_ANDROID_KEY" }]
    ],
    "extra": {
      "rcApiKey": "YOUR_REVENUECAT_ANDROID_KEY"
    }
  }
}
```

### 2. Build production AAB

```bash
eas build --platform android --profile production
```

### 3. Submit to Google Play

```bash
eas submit --platform android --profile production
```

> Place your Google Play service account JSON key at `./google-play-key.json` before submitting.

---

## Connecting to Nexora ERP (Optional)

This app works standalone without any server. If a customer also subscribes to [Nexora ERP](https://github.com/eliudm/erp), the POS can be extended to sync products and sales with the central ERP system over the local network.

---

## Subscription Model

| Plan | Price | Platform |
|---|---|---|
| Nexora POS (Android) | KES 600/month | Google Play |
| Nexora ERP (Web) | From KES 2,500/month | Direct / LAN |

Customers who purchase the ERP web system get access to the companion mobile app (C:\rn) that manages the ERP remotely. The standalone POS (this app) is a separate product for businesses that need only a POS without a full ERP.

---

## License

Proprietary — All rights reserved.
