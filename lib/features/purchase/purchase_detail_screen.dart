import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/constants.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/widgets/app_card.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/purchase_return_provider.dart';
import '../../shared/models/return_model.dart';

class PurchaseDetailScreen extends ConsumerStatefulWidget {
  final PurchaseBillModel bill;

  const PurchaseDetailScreen({super.key, required this.bill});

  @override
  ConsumerState<PurchaseDetailScreen> createState() => _PurchaseDetailScreenState();
}

class _PurchaseDetailScreenState extends ConsumerState<PurchaseDetailScreen> {
  bool _isSharing = false;

  PurchaseBillModel get bill => widget.bill;

  Future<pw.Document> _buildPdf() async {
    final pdf = pw.Document();
    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a5,
        margin: const pw.EdgeInsets.all(20),
        build: (context) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                  pw.Text(AppConstants.shopName,
                      style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
                  pw.Text(AppConstants.shopAddress, style: const pw.TextStyle(fontSize: 8)),
                  pw.Text('Ph: ${AppConstants.shopPhone}', style: const pw.TextStyle(fontSize: 8)),
                  pw.Text('GST: ${AppConstants.shopGST}', style: const pw.TextStyle(fontSize: 8)),
                  pw.Text('DL: ${AppConstants.drugLicenseNo}', style: const pw.TextStyle(fontSize: 8)),
                ]),
                pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
                  pw.Text('PURCHASE INVOICE',
                      style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
                  pw.Text('Invoice: ${bill.invoiceNumber}', style: const pw.TextStyle(fontSize: 8)),
                  pw.Text('Date: ${DateFormat('dd MMM yyyy').format(bill.invoiceDate)}',
                      style: const pw.TextStyle(fontSize: 8)),
                  pw.Text('Vendor: ${bill.partyName}', style: const pw.TextStyle(fontSize: 8)),
                ]),
              ],
            ),
            pw.SizedBox(height: 6),
            pw.Divider(thickness: 0.5),
            pw.SizedBox(height: 4),
            pw.Container(
              color: PdfColors.grey200,
              padding: const pw.EdgeInsets.symmetric(vertical: 3, horizontal: 3),
              child: pw.Row(children: [
                pw.Expanded(flex: 3, child: pw.Text('Product', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7))),
                pw.Expanded(child: pw.Text('Batch', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7))),
                pw.Expanded(child: pw.Text('Exp', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7))),
                pw.Expanded(child: pw.Text('Qty', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text('Free', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text('MRP', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text('Rate', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text('Amount', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 7), textAlign: pw.TextAlign.right)),
              ]),
            ),
            ...bill.items.map((item) => pw.Container(
              padding: const pw.EdgeInsets.symmetric(vertical: 2, horizontal: 3),
              decoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: 0.3)),
              ),
              child: pw.Row(children: [
                pw.Expanded(flex: 3, child: pw.Text(item.productName, style: const pw.TextStyle(fontSize: 7))),
                pw.Expanded(child: pw.Text(item.batchNumber, style: const pw.TextStyle(fontSize: 6))),
                pw.Expanded(child: pw.Text(DateFormat('MM/yy').format(item.expiryDate), style: const pw.TextStyle(fontSize: 6))),
                pw.Expanded(child: pw.Text(item.quantity.toStringAsFixed(0), style: const pw.TextStyle(fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text(item.freeQuantity.toStringAsFixed(0), style: const pw.TextStyle(fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text(item.mrp.toStringAsFixed(2), style: const pw.TextStyle(fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text(item.rate.toStringAsFixed(2), style: const pw.TextStyle(fontSize: 7), textAlign: pw.TextAlign.right)),
                pw.Expanded(child: pw.Text(AppFormatters.formatPdfCurrency(item.lineTotal), style: const pw.TextStyle(fontSize: 7), textAlign: pw.TextAlign.right)),
              ]),
            )),
            pw.SizedBox(height: 6),
            pw.Divider(thickness: 0.5),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.end,
              children: [
                pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
                  _pdfRow('Subtotal', bill.subtotal),
                  if (bill.totalDiscount > 0) _pdfRow('Discount', -bill.totalDiscount),
                  _pdfRow('GST', bill.totalGst),
                  pw.Divider(thickness: 0.5),
                  _pdfRowBold('Grand Total', bill.grandTotal),
                  pw.SizedBox(height: 3),
                  pw.Text(
                    'Payment: ${bill.ledgerType.name.toUpperCase()}${bill.isPaid ? " (PAID)" : ""}',
                    style: const pw.TextStyle(fontSize: 8),
                  ),
                ]),
              ],
            ),
            pw.Spacer(),
            pw.Center(
              child: pw.Text('Generated by ${AppConstants.appName}',
                  style: const pw.TextStyle(fontSize: 7)),
            ),
          ],
        ),
      ),
    );
    return pdf;
  }

  pw.Widget _pdfRow(String label, double value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 1),
        child: pw.Row(children: [
          pw.SizedBox(width: 100, child: pw.Text(label, style: const pw.TextStyle(fontSize: 8))),
          pw.SizedBox(
              width: 70,
              child: pw.Text(AppFormatters.formatPdfCurrency(value.abs()),
                  style: const pw.TextStyle(fontSize: 8), textAlign: pw.TextAlign.right)),
        ]),
      );

  pw.Widget _pdfRowBold(String label, double value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(children: [
          pw.SizedBox(
              width: 100,
              child: pw.Text(label,
                  style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold))),
          pw.SizedBox(
              width: 70,
              child: pw.Text(AppFormatters.formatPdfCurrency(value),
                  style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
                  textAlign: pw.TextAlign.right)),
        ]),
      );

  Future<void> _printBill() async {
    final pdf = await _buildPdf();
    await Printing.layoutPdf(
      onLayout: (_) async => pdf.save(),
      name: 'PurchaseInvoice_${bill.invoiceNumber}',
    );
  }

  Future<void> _sharePdf(BuildContext context) async {
    setState(() => _isSharing = true);
    try {
      final pdf = await _buildPdf();
      final bytes = await pdf.save();
      await Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'application/pdf', name: 'Purchase_${bill.invoiceNumber}.pdf')],
        text: 'Purchase Invoice ${bill.invoiceNumber} — ${bill.partyName}',
      );
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Purchase'),
        content: const Text(
            'Are you sure you want to delete this purchase bill?\nThis will revert the inventory and delete associated ledger entries permanently.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(ctx);
              final error = await ref.read(purchaseNotifierProvider.notifier).deletePurchase(bill.id!);
              if (mounted) {
                if (error != null) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Purchase bill deleted successfully')));
                  context.pop();
                }
              }
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 600;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(bill.invoiceNumber, style: AppTypography.h3),
            Text(bill.partyName, style: AppTypography.caption),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_rounded, color: AppColors.error),
            tooltip: 'Delete',
            onPressed: _confirmDelete,
          ),
          IconButton(
            icon: const Icon(Icons.edit_rounded, color: AppColors.primary),
            tooltip: 'Edit',
            onPressed: () => context.push('/purchase/edit/${bill.id}'),
          ),
          IconButton(
            icon: const Icon(Icons.print_rounded, color: AppColors.secondary),
            tooltip: 'Print',
            onPressed: _printBill,
          ),
          IconButton(
            icon: _isSharing
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.success),
                  )
                : const Icon(Icons.share_rounded, color: AppColors.success),
            tooltip: 'Share PDF',
            onPressed: _isSharing ? null : () => _sharePdf(context),
          ),
          const SizedBox(width: 4),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.border),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(isMobile ? 16 : 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Paper header ──────────────────────────────────────────────
            AppCard(
              child: Column(
                children: [
                  // Store + title
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.secondary, AppColors.primary],
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.local_pharmacy_rounded,
                            color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('AdGen ERP',
                                style: AppTypography.h3),
                            Text('Purchase Invoice',
                                style: AppTypography.caption),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _badge(
                            bill.ledgerType == LedgerType.cash
                                ? 'CASH'
                                : bill.isPaid
                                    ? 'PAID'
                                    : 'CREDIT',
                            bill.ledgerType == LedgerType.cash
                                ? AppColors.success
                                : bill.isPaid
                                    ? AppColors.primary
                                    : AppColors.warning,
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(color: AppColors.border, height: 1),
                  const SizedBox(height: 14),

                  // Invoice meta grid
                  Wrap(
                    spacing: 24,
                    runSpacing: 10,
                    children: [
                      _MetaField('Invoice No.', bill.invoiceNumber),
                      _MetaField('Invoice Date',
                          DateFormat('dd MMM yyyy').format(bill.invoiceDate)),
                      _MetaField('Vendor', bill.partyName),
                      _MetaField('Created By', bill.createdByName),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ── Items table ────────────────────────────────────────────────
            AppCard(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Items', style: AppTypography.h3),
                  const SizedBox(height: 12),
                  // Table header
                  _tableHeader(isMobile),
                  const Divider(color: AppColors.border, height: 1),
                  const SizedBox(height: 4),
                  // Rows
                  ...bill.items.asMap().entries.map((e) =>
                      _ItemRow(
                        index: e.key + 1,
                        item: e.value,
                        isMobile: isMobile,
                      )),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ── Totals ─────────────────────────────────────────────────────
            AppCard(
              child: Column(
                children: [
                  _TotalRow('Subtotal',
                      AppFormatters.formatCurrency(bill.subtotal)),
                  _TotalRow('GST',
                      AppFormatters.formatCurrency(bill.totalGst)),
                  if (bill.totalDiscount > 0)
                    _TotalRow('Discount',
                        '- ${AppFormatters.formatCurrency(bill.totalDiscount)}',
                        valueColor: AppColors.success),
                  const Divider(color: AppColors.border, height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Grand Total', style: AppTypography.h3),
                      Text(
                        AppFormatters.formatCurrency(bill.grandTotal),
                        style: AppTypography.numericLarge
                            .copyWith(color: AppColors.primary),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            if (bill.notes != null && bill.notes!.isNotEmpty) ...[
              const SizedBox(height: 16),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Notes', style: AppTypography.label),
                    const SizedBox(height: 6),
                    Text(bill.notes!, style: AppTypography.body),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 32),

            // ── Return History ──────────────────────────────────────────────
            _ReturnHistorySection(billId: bill.id!),

            // ── Action buttons ─────────────────────────────────────────────
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _ActionBtn(
                  icon: Icons.edit_rounded,
                  label: 'Edit Bill',
                  color: AppColors.primary,
                  onTap: () => context.push('/purchase/edit/${bill.id}'),
                ),
                _ActionBtn(
                  icon: Icons.share_rounded,
                  label: 'Share PDF',
                  color: const Color(0xFF25D366),
                  onTap: () => _sharePdf(context),
                ),
                _ActionBtn(
                  icon: Icons.copy_rounded,
                  label: 'Copy',
                  color: AppColors.textSecondary,
                  onTap: () => _copyToClipboard(context),
                ),
                _ActionBtn(
                  icon: Icons.assignment_return_rounded,
                  label: 'Return / Debit Note',
                  color: AppColors.error,
                  onTap: () => context.push('/purchase/return/${bill.id}'),
                ),
              ],
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  // Build table header row
  Widget _tableHeader(bool isMobile) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: isMobile
          ? Row(
              children: [
                Expanded(
                    flex: 3,
                    child: Text('Product',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Qty',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Amt',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
              ],
            )
          : Row(
              children: [
                Expanded(
                    flex: 3,
                    child: Text('Product',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Batch',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Expiry',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Qty',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('MRP',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Rate',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Amount',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
              ],
            ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: AppTypography.caption
            .copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }

  String _buildText() {
    final buf = StringBuffer();
    buf.writeln('*PURCHASE INVOICE*');
    buf.writeln('AdGen ERP');
    buf.writeln('─────────────────────');
    buf.writeln('Invoice No: ${bill.invoiceNumber}');
    buf.writeln(
        'Date: ${DateFormat('dd MMM yyyy').format(bill.invoiceDate)}');
    buf.writeln('Vendor: ${bill.partyName}');
    buf.writeln('─────────────────────');
    for (final item in bill.items) {
      buf.writeln(
          '${item.productName}\n  Batch: ${item.batchNumber} | Exp: ${DateFormat('MM/yy').format(item.expiryDate)}\n  Qty: ${item.quantity} | Rate: ₹${item.rate} | MRP: ₹${item.mrp}');
    }
    buf.writeln('─────────────────────');
    buf.writeln('Subtotal: ${AppFormatters.formatCurrency(bill.subtotal)}');
    buf.writeln('GST: ${AppFormatters.formatCurrency(bill.totalGst)}');
    buf.writeln('Grand Total: *${AppFormatters.formatCurrency(bill.grandTotal)}*');
    buf.writeln(
        'Payment: ${bill.ledgerType.name.toUpperCase()}${bill.isPaid ? ' (PAID)' : ''}');
    return buf.toString();
  }


  void _copyToClipboard(BuildContext context) {
    Clipboard.setData(ClipboardData(text: _buildText()));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
          content: Text('Invoice copied to clipboard'),
          duration: Duration(seconds: 2)),
    );
  }
}

// ─── Item Row ─────────────────────────────────────────────────────────────────
class _ItemRow extends StatelessWidget {
  final int index;
  final PurchaseItem item;
  final bool isMobile;
  const _ItemRow({required this.index, required this.item, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    if (isMobile) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(item.productName,
                      style: AppTypography.labelLarge,
                      overflow: TextOverflow.ellipsis),
                ),
                Text(AppFormatters.formatCurrency(item.lineTotal),
                    style: AppTypography.numericSmall
                        .copyWith(color: AppColors.primary)),
              ],
            ),
            const SizedBox(height: 3),
            Wrap(
              spacing: 8,
              children: [
                _chip('Batch: ${item.batchNumber}', AppColors.surface2,
                    AppColors.textSecondary),
                _chip(
                    'Exp: ${DateFormat('MM/yy').format(item.expiryDate)}',
                    _expiryColor(item.expiryDate).withValues(alpha: 0.1),
                    _expiryColor(item.expiryDate)),
                _chip('MRP: ₹${item.mrp.toStringAsFixed(2)}',
                    AppColors.surface2, AppColors.textSecondary),
                _chip('Qty: ${item.quantity.toStringAsFixed(0)}',
                    AppColors.surface2, AppColors.textSecondary),
              ],
            ),
            const Divider(color: AppColors.border, height: 16),
          ],
        ),
      );
    }
    // Desktop row
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
              flex: 3,
              child: Text(item.productName,
                  style: AppTypography.body,
                  overflow: TextOverflow.ellipsis)),
          Expanded(
              child: Text(item.batchNumber,
                  style: AppTypography.caption)),
          Expanded(
              child: Text(
                  DateFormat('MM/yy').format(item.expiryDate),
                  style: AppTypography.caption.copyWith(
                      color: _expiryColor(item.expiryDate)))),
          Expanded(
              child: Text(item.quantity.toStringAsFixed(0),
                  textAlign: TextAlign.center,
                  style: AppTypography.body)),
          Expanded(
              child: Text(
                  '₹${item.mrp.toStringAsFixed(2)}',
                  textAlign: TextAlign.end,
                  style: AppTypography.numericSmall)),
          Expanded(
              child: Text(
                  '₹${item.rate.toStringAsFixed(2)}',
                  textAlign: TextAlign.end,
                  style: AppTypography.numericSmall)),
          Expanded(
              child: Text(AppFormatters.formatCurrency(item.lineTotal),
                  textAlign: TextAlign.end,
                  style: AppTypography.numericSmall
                      .copyWith(color: AppColors.primary))),
        ],
      ),
    );
  }

  Color _expiryColor(DateTime expiry) {
    final daysLeft = expiry.difference(DateTime.now()).inDays;
    if (daysLeft < 0) return AppColors.error;
    if (daysLeft < 90) return AppColors.warning;
    return AppColors.success;
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label,
          style: AppTypography.caption
              .copyWith(color: fg, fontSize: 10)),
    );
  }
}

// ─── Total Row ────────────────────────────────────────────────────────────────
class _TotalRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _TotalRow(this.label, this.value, {this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTypography.bodySmall),
          Text(value,
              style: AppTypography.numericSmall.copyWith(
                  color: valueColor ?? AppColors.textPrimary)),
        ],
      ),
    );
  }
}

// ─── Meta field ───────────────────────────────────────────────────────────────
class _MetaField extends StatelessWidget {
  final String label;
  final String value;
  const _MetaField(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTypography.caption
                .copyWith(color: AppColors.textMuted)),
        Text(value, style: AppTypography.labelLarge),
      ],
    );
  }
}

// ─── Action button ────────────────────────────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionBtn(
      {required this.icon,
      required this.label,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: color.withValues(alpha: 0.25)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 16),
              const SizedBox(width: 8),
              Text(label,
                  style: AppTypography.label.copyWith(color: color)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Return History Section ──────────────────────────────────────────────────
class _ReturnHistorySection extends ConsumerWidget {
  final String billId;
  const _ReturnHistorySection({required this.billId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final returnsAsync = ref.watch(purchaseReturnsByBillProvider(billId));

    return returnsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (returns) {
        if (returns.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            Text('Purchase Returns / Debit Notes',
                style: AppTypography.h3.copyWith(color: AppColors.error)),
            const SizedBox(height: 12),
            ...returns.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    backgroundColor: AppColors.error.withValues(alpha: 0.05),
                    borderColor: AppColors.error.withValues(alpha: 0.2),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.assignment_return_rounded,
                            color: AppColors.error, size: 20),
                        const SizedBox(width: 12),
                        Expanded(child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text(r.debitNoteNumber,
                                    style: AppTypography.labelLarge)),
                                Text(
                                  AppFormatters.formatCurrency(r.totalReturnAmount),
                                  style: AppTypography.numeric.copyWith(
                                    color: AppColors.error,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${DateFormat('dd MMM yyyy').format(r.returnDate)} · ${r.reason}',
                              style: AppTypography.caption,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${r.items.length} item(s) returned',
                              style: AppTypography.caption,
                            ),
                          ],
                        )),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 24),
          ],
        );
      },
    );
  }
}
