/// Centralized billing calculation utilities.
/// Used by both sales entry and purchase entry screens.
abstract class BillingCalculations {
  /// Gross line value before discount (rate × quantity)
  static double grossAmount(double rate, double quantity) => rate * quantity;

  /// Discount rupee amount
  static double discountAmount(double rate, double quantity, double discountPercent) {
    return grossAmount(rate, quantity) * discountPercent / 100;
  }

  /// Taxable amount (gross minus discount)
  static double taxableAmount(double rate, double quantity, double discountPercent) {
    return grossAmount(rate, quantity) - discountAmount(rate, quantity, discountPercent);
  }

  /// GST rupee amount (on taxable amount)
  static double gstAmount(double rate, double quantity, double discountPercent, double gstPercent) {
    return taxableAmount(rate, quantity, discountPercent) * gstPercent / 100;
  }

  /// Total line amount (taxable + GST)
  static double lineTotal(double rate, double quantity, double discountPercent, double gstPercent) {
    return taxableAmount(rate, quantity, discountPercent) +
        gstAmount(rate, quantity, discountPercent, gstPercent);
  }

  /// Per-unit content rate from a pack price
  /// e.g. strip of 10 tablets costing ₹50 → ₹5 per tablet
  static double perUnitRate(double packPrice, int packSize) {
    if (packSize <= 0) return packPrice;
    return packPrice / packSize;
  }

  /// Total units from packs + loose units
  static double totalUnits(double packQty, int packSize, double looseUnits) {
    return (packQty * packSize) + looseUnits;
  }
}
