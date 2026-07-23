import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:intl/intl.dart';
import 'package:flutter/services.dart';
import '../../shared/models/sales_bill_model.dart';
import 'formatters.dart';

class PdfGenerator {
  static Future<pw.Document> generateSalesInvoice(SalesBillModel bill, {String paperSize = 'A5'}) async {
    final pdf = pw.Document();

    final logoBytes = (await rootBundle.load('assets/images/logo.png')).buffer.asUint8List();
    final logoImage = pw.MemoryImage(logoBytes);

    PdfPageFormat pageFormat;
    switch (paperSize) {
      case 'A4': pageFormat = PdfPageFormat.a4; break;
      case 'A5': pageFormat = PdfPageFormat.a5; break;
      case 'Half Page': pageFormat = const PdfPageFormat(148 * PdfPageFormat.mm, 105 * PdfPageFormat.mm); break;
      case 'Thermal 58mm': pageFormat = const PdfPageFormat(58 * PdfPageFormat.mm, double.infinity); break;
      case 'Thermal 80mm': pageFormat = const PdfPageFormat(80 * PdfPageFormat.mm, double.infinity); break;
      default: pageFormat = PdfPageFormat.a5;
    }

    pdf.addPage(
      pw.MultiPage(
        pageFormat: pageFormat,
        margin: const pw.EdgeInsets.all(24),
        build: (context) {
          return [
            // ─── Header ──────────────────────────────────────────────────
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Image(logoImage, width: 80, height: 40),
                    pw.SizedBox(height: 4),
                    pw.Text('ADGEN PHARMACY', style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: PdfColors.black)),
                    pw.SizedBox(height: 4),
                    pw.Text('27-A CHANDRA NAGAR, BARFANI DHAM MR-9, INDORE (M.P)', style: const pw.TextStyle(fontSize: 8, color: PdfColors.black)),
                    pw.Text('Phone: 8839640968, 8462984313', style: const pw.TextStyle(fontSize: 8, color: PdfColors.black)),
                    pw.Text('E-Mail: adgenpharmacy2024@gmail.com', style: const pw.TextStyle(fontSize: 8, color: PdfColors.black)),
                    pw.Text('DL NO: 20B/5441/12/2024, 21B/5442/12/2024', style: const pw.TextStyle(fontSize: 8, color: PdfColors.black)),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text('CASH MEMO', style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: PdfColors.black)),
                    pw.SizedBox(height: 8),
                    pw.Text('No: ${bill.invoiceNumber}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.black)),
                    pw.Text('Date: ${DateFormat('dd-MM-yyyy').format(bill.saleDate)}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.black)),
                    pw.Text('User: ${bill.createdByName}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.black)),
                  ],
                ),
              ],
            ),
            pw.SizedBox(height: 12),
            pw.Divider(thickness: 1, color: PdfColors.black),
            pw.SizedBox(height: 8),

            // ─── Patient Info ─────────────────────────────────────────────
            pw.Row(
              children: [
                pw.Expanded(
                  child: pw.Text('Patient Name: ${bill.customerName.isEmpty ? 'CASH' : bill.customerName.toUpperCase()}', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColors.black)),
                ),
                pw.Expanded(
                  child: pw.Text('Doctor: ${bill.doctorName ?? ''}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.black)),
                ),
              ],
            ),
            pw.SizedBox(height: 12),

            // ─── Items Table ──────────────────────────────────────────────
            pw.Table(
              columnWidths: {
                0: const pw.FlexColumnWidth(0.5), // S.No
                1: const pw.FlexColumnWidth(3),   // Particulars
                2: const pw.FlexColumnWidth(1),   // Pack
                3: const pw.FlexColumnWidth(1.2), // Batch
                4: const pw.FlexColumnWidth(1),   // Exp
                5: const pw.FlexColumnWidth(1),   // Strip
                6: const pw.FlexColumnWidth(1),   // Drop/Tab
                7: const pw.FlexColumnWidth(1.2), // M.R.P
                8: const pw.FlexColumnWidth(1.5), // Amount
              },
              children: [
                // Header Row
                pw.TableRow(
                  decoration: const pw.BoxDecoration(
                    border: pw.Border(
                      top: pw.BorderSide(color: PdfColors.black),
                      bottom: pw.BorderSide(color: PdfColors.black),
                    )
                  ),
                  children: [
                    _th('S.No.'),
                    _th('Particulars'),
                    _th('Pack'),
                    _th('Batch'),
                    _th('Exp'),
                    _th('Strip', align: pw.TextAlign.right),
                    _th('Drop/Tab', align: pw.TextAlign.right),
                    _th('M.R.P', align: pw.TextAlign.right),
                    _th('Amount', align: pw.TextAlign.right),
                  ],
                ),
                // Items Rows
                ...bill.items.asMap().entries.map((e) {
                  final i = e.key;
                  final item = e.value;
                  final stripQty = item.packQuantity.toInt();
                  final looseQty = (item.quantity - (item.packQuantity * item.packSize)).toInt();
                  
                  return pw.TableRow(
                    children: [
                      _td('${i + 1}'),
                      _td(item.productName),
                      _td('${item.packSize}'),
                      _td(item.batchNumber),
                      _td(DateFormat('MM/yy').format(item.expiryDate)),
                      _td('$stripQty', align: pw.TextAlign.right),
                      _td('$looseQty', align: pw.TextAlign.right),
                      _td(item.mrp.toStringAsFixed(2), align: pw.TextAlign.right),
                      _td(item.rate.toStringAsFixed(2), align: pw.TextAlign.right),
                    ],
                  );
                }),
              ],
            ),
            pw.SizedBox(height: 12),
            pw.Divider(thickness: 1, color: PdfColors.black),

            // ─── Footer Details ──────────────────────────────────────────
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                // QR & Wishes
                pw.Expanded(
                  flex: 2,
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.SizedBox(
                        width: 60,
                        height: 60,
                        child: pw.BarcodeWidget(
                          data: 'UPI://pay?pa=adgenpharmacy@upi&pn=Adgen Pharmacy&am=${bill.grandTotal}',
                          barcode: pw.Barcode.qrCode(),
                        ),
                      ),
                      pw.SizedBox(height: 4),
                      pw.Text('Scan to Pay', style: const pw.TextStyle(fontSize: 8, color: PdfColors.black)),
                      pw.SizedBox(height: 16),
                      pw.Text('** GET WELL SOON **', style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: PdfColors.black)),
                    ],
                  ),
                ),
                // Totals
                pw.Expanded(
                  flex: 3,
                  child: pw.Column(
                    children: [
                      _totalRow('Sub Total', bill.subtotal),
                      if (bill.totalDiscount > 0)
                        _totalRow('Item Discount', bill.totalDiscount),
                      if (bill.schemeDiscountAmount > 0)
                        _totalRow('Scheme Discount', bill.schemeDiscountAmount),
                      if (bill.isRoundOff && bill.roundOffAmount != 0)
                        _totalRow('Round Off', bill.roundOffAmount),
                      pw.Divider(thickness: 1, color: PdfColors.black),
                      _totalRow('BILL TOTAL', bill.grandTotal, bold: true),
                      pw.SizedBox(height: 4),
                      if (bill.totalDiscount > 0 || bill.schemeDiscountAmount > 0)
                        pw.Row(
                          mainAxisAlignment: pw.MainAxisAlignment.end,
                          children: [
                            pw.Text(
                              'Your Savings: ${AppFormatters.formatPdfCurrency(bill.totalDiscount + bill.schemeDiscountAmount)}',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ];
        },
      ),
    );

    return pdf;
  }

  static pw.Widget _th(String text, {pw.TextAlign align = pw.TextAlign.left}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      child: pw.Text(
        text,
        textAlign: align,
        style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.black),
      ),
    );
  }

  static pw.Widget _td(String text, {pw.TextAlign align = pw.TextAlign.left}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      child: pw.Text(
        text,
        textAlign: align,
        style: const pw.TextStyle(fontSize: 8, color: PdfColors.black),
      ),
    );
  }

  static pw.Widget _totalRow(String label, double value, {bool bold = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(fontSize: 9, fontWeight: bold ? pw.FontWeight.bold : null, color: PdfColors.black),
          ),
          pw.Text(
            AppFormatters.formatPdfCurrency(value),
            style: pw.TextStyle(fontSize: 9, fontWeight: bold ? pw.FontWeight.bold : null, color: PdfColors.black),
          ),
        ],
      ),
    );
  }
}
