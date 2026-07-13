/// Application-wide constants for AdGen Pharmacy ERP
abstract class AppConstants {
  // ─── App Info ──────────────────────────────────────────────────────────────
  static const String appName = 'AdGen ERP';
  static const String appVersion = '1.0.0';

  // ─── Business Info (Update these!) ────────────────────────────────────────
  static const String shopName = 'AdGen Pharma';
  static const String shopAddress = '27-A Chandra Nagar, Barfani Dham, MR-9, Indore (M.P) 452001';
  static const String shopPhone = '+918839640968';
  static const String shopEmail = 'adgenpharmacy2024@email.com';
  static const String shopGST = 'GST Number Here';
  static const String drugLicenseNo = 'Drug License No. Here';
  static const String whatsappNumber = '+91XXXXXXXXXX'; // AdGen's WhatsApp number
  static const String googleReviewLink = 'https://g.page/r/YOUR_REVIEW_LINK';
  static const String upiId = 'adgen@upi'; // UPI ID for QR

  // ─── Firestore Collections ────────────────────────────────────────────────
  static const String colUsers = 'users';
  static const String colParties = 'parties';
  static const String colProducts = 'products';
  static const String colPurchaseBills = 'purchase_bills';
  static const String colSalesBills = 'sales_bills';
  static const String colInventory = 'inventory';
  static const String colLedger = 'ledger';
  static const String colCustomers = 'customers';
  static const String colAttendance = 'attendance';
  static const String colReminders = 'reminders';

  // ─── Hive Box Names ───────────────────────────────────────────────────────
  static const String hiveUsers = 'users_box';
  static const String hivePurchase = 'purchase_box';
  static const String hiveSales = 'sales_box';
  static const String hiveProducts = 'products_box';
  static const String hiveParties = 'parties_box';
  static const String hiveCustomers = 'customers_box';
  static const String hiveInventory = 'inventory_box';
  static const String hiveSettings = 'settings_box';

  // ─── Stock Thresholds ─────────────────────────────────────────────────────
  static const int lowStockDefault = 10;
  static const int expiryWarnDays = 90; // Warn if expiring within 90 days

  // ─── Tax Rates ─────────────────────────────────────────────────────────────
  static const List<double> gstRates = [0, 5, 12, 18, 28];

  // ─── Payment Methods ──────────────────────────────────────────────────────
  static const List<String> paymentMethods = ['Cash', 'UPI', 'Card', 'Credit'];

  // ─── Schedule Divisions ───────────────────────────────────────────────────
  static const List<String> schedules = ['General', 'Schedule H', 'Schedule H1', 'Schedule X'];

  // ─── Invoice Print Sizes ──────────────────────────────────────────────────
  static const List<String> printSizes = ['A4', 'A5', 'Half Page', 'Thermal 58mm', 'Thermal 80mm'];
  static const String defaultPrintSize = 'A5';

  // ─── Gemini AI ────────────────────────────────────────────────────────────
  static const String geminiApiKey = 'YOUR_GEMINI_API_KEY'; // Replace with actual key

  // ─── User Roles ───────────────────────────────────────────────────────────
  static const String roleOwner = 'owner';
  static const String roleEmployee = 'employee';

  // ─── Default Credentials (Change after first login!) ──────────────────────
  // These are seeded in Firebase Auth by running the setup screen
  static const List<Map<String, String>> defaultUsers = [
    {'email': 'owner@adgen.com', 'password': 'AdGen@2024', 'name': 'Owner', 'role': 'owner'},
    {'email': 'staff1@adgen.com', 'password': 'Staff@2024', 'name': 'Staff 1', 'role': 'employee'},
    {'email': 'staff2@adgen.com', 'password': 'Staff@2024', 'name': 'Staff 2', 'role': 'employee'},
  ];
}
