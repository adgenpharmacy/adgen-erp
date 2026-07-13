# AdGen Pharmacy ERP

A full-featured pharmacy management system built with Flutter + Firebase, optimized for Android tablets in landscape mode.

---

## 🚀 Quick Setup Guide (Step by Step)

### Step 1 — Install Flutter

1. Download Flutter SDK: https://docs.flutter.dev/get-started/install/windows
2. Extract to `C:\flutter`
3. Add `C:\flutter\bin` to your system PATH
4. Run `flutter doctor` to verify installation

### Step 2 — Set Up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → Name it `adgen-pharmacy-erp`
3. Enable **Google Analytics** (optional)
4. Click **"Create project"**

#### Add Android App to Firebase:
1. Click **Android icon** in your project
2. Package name: `com.adgen.pharmacy_erp`
3. Download `google-services.json`
4. Replace the placeholder at: `android/app/google-services.json`

#### Enable Firebase Services:
- **Authentication** → Sign-in methods → Enable **Email/Password**
- **Firestore Database** → Create database → Start in **production mode**
- **Storage** → Get started

#### Update `lib/firebase_options.dart`:
Replace all `YOUR_*` values with your actual Firebase project values from:
**Project Settings → General → Your apps → SDK setup and configuration**

### Step 3 — Configure the App

Edit `lib/core/utils/constants.dart`:
```dart
static const String shopName = 'YOUR PHARMACY NAME';
static const String shopAddress = 'Your Address, City, PIN';
static const String shopPhone = '+91 XXXXXXXXXX';
static const String shopGST = 'YOUR GST NUMBER';
static const String drugLicenseNo = 'YOUR DRUG LICENSE';
static const String upiId = 'yourname@upi';
static const String geminiApiKey = 'YOUR_GEMINI_API_KEY'; // From ai.google.dev
```

### Step 4 — Get a Gemini API Key (for AI features)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **"Get API Key"**
3. Copy the key into `AppConstants.geminiApiKey`

### Step 5 — Run the App

```bash
# Install dependencies
flutter pub get

# Connect Android tablet via USB (enable Developer Mode on tablet)
flutter devices

# Run on tablet
flutter run
```

### Step 6 — First Time Setup (Create User Accounts)

1. Launch the app → the Login screen appears
2. Navigate to **`/setup`** (type in browser or modify initial route temporarily)
3. Click **"Create Users & Setup Firebase"**
4. This creates 3 accounts:
   - `owner@adgen.com` / `AdGen@2024` — Full Owner Access
   - `staff1@adgen.com` / `Staff@2024` — Staff 1
   - `staff2@adgen.com` / `Staff@2024` — Staff 2
5. **Change passwords immediately** after first login!

### Step 7 — Deploy Firestore Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

---

## 👥 User Roles & Permissions

| Feature | Owner | Staff |
|---------|-------|-------|
| Purchase Entry | ✅ | ✅ |
| Sales Entry | ✅ | ✅ |
| View Inventory | ✅ | ✅ |
| Stock Correction | ✅ | ❌ |
| Delete Bills | ✅ | ❌ |
| Full Reports | ✅ | ❌ |
| Modify Accounts/Ledger | ✅ | ❌ |
| Add Parties/Products | ✅ | ✅ |
| AI Assistant | ✅ | ✅ |

---

## 📋 Features

### 🔐 Login & Attendance
- Email/Password login
- Role-based access (Owner / Staff)
- Auto attendance marking on login with timestamp
- Logout records session end time

### 🏢 Party Management
- Add/edit suppliers with GST + Drug License details
- Autocomplete party search in purchase entry
- Outstanding balance display

### 🛒 Purchase Entry
- Full invoice details: party, invoice no., date, ledger type
- Multi-row product entry: batch, expiry, MRP, rate, GST%, discount%
- Schedule H / H1 / X product warnings
- Free quantity (scheme) field
- Real-time totals calculation
- Auto inventory update after saving

### 💊 Sales Entry
- Customer autocomplete with history
- Doctor name + address + phone fields
- Product search from live inventory (FEFO — First Expired First Out)
- Strip + loose tablet unit conversion (e.g. "2 strips + 4 tablets = 24 units")
- Payment method: Cash / UPI / Card / Credit
- Prescription photo upload (camera)
- Restricted drug warning for Schedule H/H1/X

### 🧾 Invoice Generation
- Print sizes: A4, A5, Half Page, Thermal 58mm/80mm
- PDF generation with full shop details + GST breakdown
- WhatsApp share (sends PDF)
- Includes: batch number, expiry, HSN, doctor name, drug license

### 📦 Inventory
- Real-time stock per product + per batch
- FEFO batch selection for sales
- Expiry date alerts (expired + expiring within 90 days)
- Low stock alerts
- **Owner-only stock correction** with reason logging

### 📊 Reports
- Daily / Weekly / Monthly sales totals
- COGS estimate + Gross Profit + Margin %
- Top products by quantity sold
- Discount analysis

### 💳 Accounts / Ledger
- Auto-creates ledger entries from credit transactions
- Total receivable vs payable summary
- Net balance display

### 📱 Credit Reminders
- Pending credit bills on dashboard
- WhatsApp reminder message with UPI ID + amount
- Days overdue tracking

### 🤖 AI Assistant (Gemini)
- Drug information + interactions
- Prescription image decoding (camera upload)
- Schedule H/H1/X regulations
- Generic alternatives
- Quick query shortcuts

---

## 📁 Project Structure

```
lib/
├── core/
│   ├── theme/          # Colors, typography, spacing, Material theme
│   ├── providers/      # Riverpod state providers
│   ├── router/         # GoRouter navigation
│   └── utils/          # Constants, formatters
├── features/
│   ├── auth/           # Login, attendance, setup
│   ├── dashboard/      # Main dashboard + widgets
│   ├── parties/        # Party management
│   ├── purchase/       # Purchase entry + list
│   ├── sales/          # Sales entry + list + invoice
│   ├── inventory/      # Stock management + correction
│   ├── accounts/       # Ledger
│   ├── reports/        # Analytics
│   ├── customers/      # Customer directory
│   └── ai/             # Gemini AI assistant
└── shared/
    ├── models/         # Firestore data models
    └── widgets/        # Reusable UI components
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3.x |
| Backend | Firebase (Auth + Firestore + Storage) |
| State | Riverpod 2 |
| Navigation | GoRouter |
| PDF | `pdf` + `printing` packages |
| AI | Google Gemini 1.5 Flash |
| Fonts | Google Fonts — Inter |
| Charts | fl_chart |

---

## ⚠️ Important Notes

1. **Replace all `YOUR_*` placeholders** before running the app
2. The app is designed for **Android tablet landscape mode** (10"+ recommended)
3. The Gemini AI key is stored in `constants.dart` — keep this private
4. Firestore indexes may need to be created — Firebase console will show links
5. Run `firebase deploy --only firestore:rules` to apply security rules

---

Made with ❤️ for AdGen Pharma
