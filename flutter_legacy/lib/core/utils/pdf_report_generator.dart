import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';

import 'constants.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/return_model.dart';
import '../../shared/models/inventory_batch_model.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/sale_return_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/providers/settings_provider.dart';

class PdfReportGenerator {
  /// Generates and shares a PDF report for the currently selected tab.
  /// 
  /// [tabIndex] represents the active tab in `reports_screen.dart`:
  /// 0: Overview, 1: Sales, 2: Purchases, 3: Profit & Loss, 4: GST
  static Future<void> generateAndShareReports({
    required WidgetRef ref,
    required int tabIndex,
    required DateTimeRange dateRange,
  }) async {
    final pdf = pw.Document();
    
    Map<String, dynamic> appSettings = {};
    try {
      appSettings = await ref.read(appSettingsProvider.future);
    } catch (e) {
      debugPrint('Failed to read app settings (using fallback): $e');
    }

    List<SalesBillModel> allSales = [];
    try { allSales = await ref.read(salesBillsProvider.future); } catch (_) {}

    List<PurchaseBillModel> allPurchases = [];
    try { allPurchases = await ref.read(purchaseBillsProvider.future); } catch (_) {}

    List<SaleReturnModel> allReturns = [];
    try { allReturns = await ref.read(allSaleReturnsProvider.future); } catch (_) {}

    List<InventoryModel> allInventory = [];
    try { allInventory = await ref.read(inventoryProvider.future); } catch (_) {}

    final sales = allSales.where((b) => _matchesRange(b.saleDate, dateRange)).toList();
    final purchases = allPurchases.where((b) => _matchesRange(b.invoiceDate, dateRange)).toList();
    final returns = allReturns.where((r) => _matchesRange(r.returnDate, dateRange)).toList();

    final totalNetSales = sales.fold<double>(0, (s, b) => s + b.grandTotal);
    final totalPurchases = purchases.fold<double>(0, (s, b) => s + b.grandTotal);
    final totalReturns = returns.fold<double>(0, (s, r) => s + r.totalRefundAmount);
    final effectiveSales = totalNetSales - totalReturns;

    final totalOutputGst = sales.fold<double>(0, (s, b) => 
        s + b.items.fold<double>(0, (si, i) => 
            si + (i.taxableAmount - (i.taxableAmount / (1 + i.gstPercent / 100)))));
    
    final totalInputGst = purchases.fold<double>(0, (s, b) =>
        s + b.items.fold<double>(0, (si, i) => si + i.gstAmount));

    double cogs = 0;
    final invMap = {for (final inv in allInventory) inv.productId: inv};
    for (final bill in sales) {
      for (final item in bill.items) {
        final inv = invMap[item.productId];
        final batch = (inv?.batches ?? [])
            .where((b) => b.batchNumber == item.batchNumber)
            .firstOrNull;
        final purchaseRate = batch?.purchaseRate ?? 0;
        final perUnitCost = item.packSize > 0 ? purchaseRate / item.packSize : purchaseRate;
        cogs += perUnitCost * item.quantity;
      }
    }
    final totalGrossProfit = (effectiveSales - totalOutputGst) - cogs;
    
    final shopName = appSettings['shopName'] ?? AppConstants.shopName;
    final shopAddress = appSettings['shopAddress'] ?? AppConstants.shopAddress;
    final shopPhone = appSettings['shopPhone'] ?? AppConstants.shopPhone;
    final shopGST = appSettings['shopGST'] ?? AppConstants.shopGST;

    // Header builder
    pw.Widget buildHeader(String title) {
      return pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          pw.Text(shopName, style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          pw.Text(shopAddress, style: const pw.TextStyle(fontSize: 12)),
          pw.SizedBox(height: 2),
          pw.Text('Phone: $shopPhone | GSTIN: $shopGST', style: const pw.TextStyle(fontSize: 12)),
          pw.SizedBox(height: 12),
          pw.Divider(),
          pw.SizedBox(height: 12),
          pw.Text(title, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          pw.Text(
            'Period: ${DateFormat('dd MMM yyyy').format(dateRange.start)} - ${DateFormat('dd MMM yyyy').format(dateRange.end)}',
            style: const pw.TextStyle(fontSize: 12, color: PdfColors.grey700),
          ),
          pw.SizedBox(height: 20),
        ],
      );
    }

    String formatCurrency(double amount) => 'Rs. ${amount.toStringAsFixed(2)}';

    // Build the specific tab content
    if (tabIndex == 0) {
      // Overview Tab
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          build: (pw.Context context) {
            return pw.Column(
              children: [
                buildHeader('Overview Report'),
                pw.Table.fromTextArray(
                  context: context,
                  headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
                  cellAlignment: pw.Alignment.centerRight,
                  data: <List<String>>[
                    ['Metric', 'Amount'],
                    ['Gross Sales', formatCurrency(totalNetSales + totalReturns)],
                    ['Sales Returns', formatCurrency(totalReturns)],
                    ['Net Sales', formatCurrency(totalNetSales)],
                    ['Total Purchases', formatCurrency(totalPurchases)],
                    ['Gross Profit', formatCurrency(totalGrossProfit)],
                  ],
                ),
              ],
            );
          },
        ),
      );
    } else if (tabIndex == 1) {
      // Sales Tab
      pdf.addPage(
        pw.MultiPage(
          pageFormat: PdfPageFormat.a4,
          build: (pw.Context context) {
            return [
              buildHeader('Sales Report'),
              pw.Table.fromTextArray(
                context: context,
                headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                cellStyle: const pw.TextStyle(fontSize: 9),
                headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
                cellAlignment: pw.Alignment.centerRight,
                data: <List<String>>[
                  ['Date', 'Invoice', 'Customer', 'Payment', 'Amount'],
                  ...sales.map((s) => [
                    DateFormat('dd MMM').format(s.saleDate),
                    s.invoiceNumber,
                    s.customerName,
                    s.paymentMethod.displayName,
                    formatCurrency(s.grandTotal),
                  ]),
                ],
              ),
              pw.SizedBox(height: 20),
              pw.Container(
                alignment: pw.Alignment.centerRight,
                child: pw.Text(
                  'Total Sales: ${formatCurrency(totalNetSales)}',
                  style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14),
                ),
              ),
            ];
          },
        ),
      );
    } else if (tabIndex == 2) {
      // Purchases Tab
      pdf.addPage(
        pw.MultiPage(
          pageFormat: PdfPageFormat.a4,
          build: (pw.Context context) {
            return [
              buildHeader('Purchases Report'),
              pw.Table.fromTextArray(
                context: context,
                headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                cellStyle: const pw.TextStyle(fontSize: 9),
                headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
                cellAlignment: pw.Alignment.centerRight,
                data: <List<String>>[
                  ['Date', 'Invoice', 'Party', 'Type', 'Amount'],
                  ...purchases.map((p) => [
                    DateFormat('dd MMM').format(p.invoiceDate),
                    p.invoiceNumber,
                    p.partyName,
                    p.ledgerType.name.toUpperCase(),
                    formatCurrency(p.grandTotal),
                  ]),
                ],
              ),
              pw.SizedBox(height: 20),
              pw.Container(
                alignment: pw.Alignment.centerRight,
                child: pw.Text(
                  'Total Purchases: ${formatCurrency(totalPurchases)}',
                  style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14),
                ),
              ),
            ];
          },
        ),
      );
    } else if (tabIndex == 3) {
      // Profit & Loss Tab
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          build: (pw.Context context) {
            return pw.Column(
              children: [
                buildHeader('Profit & Loss Statement'),
                pw.Table.fromTextArray(
                  context: context,
                  headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
                  cellAlignment: pw.Alignment.centerRight,
                  data: <List<String>>[
                    ['Metric', 'Amount'],
                    ['Revenue (Net Sales)', formatCurrency(totalNetSales)],
                    ['Cost of Goods Sold (COGS)', formatCurrency(totalNetSales - totalGrossProfit)],
                    ['Gross Profit', formatCurrency(totalGrossProfit)],
                    ['Profit Margin', '${totalNetSales > 0 ? ((totalGrossProfit / totalNetSales) * 100).toStringAsFixed(1) : 0}%'],
                  ],
                ),
              ],
            );
          },
        ),
      );
    } else if (tabIndex == 4) {
      // GST Tab
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          build: (pw.Context context) {
            return pw.Column(
              children: [
                buildHeader('GST Report'),
                pw.Table.fromTextArray(
                  context: context,
                  headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
                  cellAlignment: pw.Alignment.centerRight,
                  data: <List<String>>[
                    ['Metric', 'Amount'],
                    ['Output GST (Collected on Sales)', formatCurrency(totalOutputGst)],
                    ['Input GST (Paid on Purchases)', formatCurrency(totalInputGst)],
                    ['Net GST Payable / (Credit)', formatCurrency(totalOutputGst - totalInputGst)],
                  ],
                ),
              ],
            );
          },
        ),
      );
    }

    // Share the document
    await Printing.sharePdf(
      bytes: await pdf.save(),
      filename: 'report_${DateFormat('yyyyMMdd').format(DateTime.now())}.pdf',
    );
  }

  static bool _matchesRange(DateTime date, DateTimeRange range) {
    final start = range.start.subtract(const Duration(seconds: 1));
    final end = range.end.add(const Duration(seconds: 1));
    return date.isAfter(start) && date.isBefore(end);
  }
}
