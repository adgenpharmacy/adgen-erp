import 'package:intl/intl.dart';

abstract class AppFormatters {
  static final _currencyFormatter = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 2,
  );

  static final _compactCurrencyFormatter = NumberFormat.compactCurrency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 1,
  );

  static final _dateFormatter = DateFormat('dd MMM yyyy');
  static final _dateTimeFormatter = DateFormat('dd MMM yyyy, hh:mm a');
  static final _timeFormatter = DateFormat('hh:mm a');
  static final _shortDateFormatter = DateFormat('dd/MM/yy');
  static final _invoiceDateFormatter = DateFormat('dd-MM-yyyy');

  // ─── Currency ─────────────────────────────────────────────────────────────
  static String formatCurrency(double amount) {
    return _currencyFormatter.format(amount);
  }

  static String formatPdfCurrency(double amount) {
    // PDF default fonts don't support the ₹ symbol
    return 'Rs. ${amount.abs().toStringAsFixed(2)}';
  }

  static String formatCompactCurrency(double amount) {
    return _compactCurrencyFormatter.format(amount);
  }

  static String formatNumber(double number, {int decimals = 2}) {
    return number.toStringAsFixed(decimals);
  }

  // ─── Date / Time ──────────────────────────────────────────────────────────
  static String formatDate(DateTime date) => _dateFormatter.format(date);
  static String formatDateTime(DateTime date) => _dateTimeFormatter.format(date);
  static String formatTime(DateTime date) => _timeFormatter.format(date);
  static String formatShortDate(DateTime date) => _shortDateFormatter.format(date);
  static String formatInvoiceDate(DateTime date) => _invoiceDateFormatter.format(date);

  // ─── Percentage ──────────────────────────────────────────────────────────
  static String formatPercent(double value) {
    return '${value.toStringAsFixed(1)}%';
  }

  // ─── Quantity ─────────────────────────────────────────────────────────────
  static String formatQuantity(double qty) {
    if (qty == qty.truncate()) {
      return qty.toInt().toString();
    }
    return qty.toStringAsFixed(2);
  }

  // ─── Invoice Number ───────────────────────────────────────────────────────
  static String generateInvoiceNumber(String prefix, int sequence) {
    final year = DateTime.now().year.toString().substring(2);
    final month = DateTime.now().month.toString().padLeft(2, '0');
    return '$prefix/$year$month/${sequence.toString().padLeft(4, '0')}';
  }

  // ─── Phone Number ─────────────────────────────────────────────────────────
  static String formatPhone(String phone) {
    final cleaned = phone.replaceAll(RegExp(r'\D'), '');
    if (cleaned.length == 10) {
      return '+91 ${cleaned.substring(0, 5)} ${cleaned.substring(5)}';
    }
    return phone;
  }

  // ─── Days Until Expiry ────────────────────────────────────────────────────
  static int daysUntilExpiry(DateTime expiry) {
    return expiry.difference(DateTime.now()).inDays;
  }

  static String expiryStatus(DateTime expiry) {
    final days = daysUntilExpiry(expiry);
    if (days < 0) return 'Expired';
    if (days == 0) return 'Expires Today';
    if (days <= 30) return 'Exp. in $days days';
    if (days <= 90) return 'Exp. ${formatDate(expiry)}';
    return formatShortDate(expiry);
  }
}
