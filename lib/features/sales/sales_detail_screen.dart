import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/constants.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../core/utils/pdf_generator.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/sale_return_provider.dart';
import '../../shared/models/return_model.dart';

class SalesDetailScreen extends ConsumerStatefulWidget {
  final SalesBillModel bill;

  const SalesDetailScreen({super.key, required this.bill});

  @override
  ConsumerState<SalesDetailScreen> createState() => _SalesDetailScreenState();
}

class _SalesDetailScreenState extends ConsumerState<SalesDetailScreen> {
  bool _isSharing = false;

  SalesBillModel get bill => widget.bill;

  Future<void> _printBill() async {
    context.push('/sales/invoice/${bill.id}');
  }

  Future<void> _sharePdf(BuildContext context) async {
    setState(() => _isSharing = true);
    try {
      final pdf = await PdfGenerator.generateSalesInvoice(bill, paperSize: AppConstants.defaultPrintSize);
      final bytes = await pdf.save();
      await Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'application/pdf', name: 'Sales_${bill.invoiceNumber}.pdf')],
        text: 'Sales Invoice ${bill.invoiceNumber} — ${bill.customerName}',
      );
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Sale'),
        content: const Text(
            'Are you sure you want to delete this sale?\nThis will revert the inventory and delete associated ledger entries permanently.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.pop(ctx);
              final error = await ref.read(salesNotifierProvider.notifier).deleteSale(bill.id!);
              if (mounted) {
                if (error != null) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sale deleted successfully')));
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
            Text(bill.customerName, style: AppTypography.caption),
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
            onPressed: () => context.push('/Sales/edit/${bill.id}'),
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
                            Text('Sales Invoice',
                                style: AppTypography.caption),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _badge(
                            bill.paymentMethod == PaymentMethod.cash
                                ? 'CASH'
                                : bill.isCreditPaid
                                    ? 'PAID'
                                    : 'CREDIT',
                            bill.paymentMethod == PaymentMethod.cash
                                ? AppColors.success
                                : bill.isCreditPaid
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
                          DateFormat('dd MMM yyyy').format(bill.saleDate)),
                      _MetaField('Vendor', bill.customerName),
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

            // ── Action buttons ─────────────────────────────────────────────
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _ActionBtn(
                  icon: Icons.edit_rounded,
                  label: 'Edit Bill',
                  color: AppColors.primary,
                  onTap: () => context.push('/Sales/edit/${bill.id}'),
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
                  icon: Icons.undo_rounded,
                  label: 'Return / Refund',
                  color: AppColors.warning,
                  onTap: () => context.push(
                    '/sales/return/${bill.id}',
                    extra: bill,
                  ),
                ),
              ],
            ),

            const SizedBox(height: AppSpacing.xl),

            // ── Return History ────────────────────────────────────────────
            _ReturnHistorySection(billId: bill.id!),

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
    buf.writeln('*Sales INVOICE*');
    buf.writeln('AdGen ERP');
    buf.writeln('─────────────────────');
    buf.writeln('Invoice No: ${bill.invoiceNumber}');
    buf.writeln(
        'Date: ${DateFormat('dd MMM yyyy').format(bill.saleDate)}');
    buf.writeln('Vendor: ${bill.customerName}');
    buf.writeln('─────────────────────');
    for (final item in bill.items) {
      buf.writeln(
          '${item.productName}\n  Batch: ${item.batchNumber} | Exp: ${DateFormat('MM/yy').format(item.expiryDate)}\n  Qty: ${item.quantity} | Rate: â‚¹${item.rate} | MRP: â‚¹${item.mrp}');
    }
    buf.writeln('─────────────────────');
    buf.writeln('Subtotal: ${AppFormatters.formatCurrency(bill.subtotal)}');
    buf.writeln('GST: ${AppFormatters.formatCurrency(bill.totalGst)}');
    buf.writeln('Grand Total: *${AppFormatters.formatCurrency(bill.grandTotal)}*');
    buf.writeln(
        'Payment: ${bill.paymentMethod.name.toUpperCase()}${bill.isCreditPaid ? ' (PAID)' : ''}');
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
  final SalesItem item;
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
                _chip('MRP: â‚¹${item.mrp.toStringAsFixed(2)}',
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
                  'â‚¹${item.mrp.toStringAsFixed(2)}',
                  textAlign: TextAlign.end,
                  style: AppTypography.numericSmall)),
          Expanded(
              child: Text(
                  'â‚¹${item.rate.toStringAsFixed(2)}',
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

// ─── Return History Section ───────────────────────────────────────────────────
class _ReturnHistorySection extends ConsumerWidget {
  final String billId;
  const _ReturnHistorySection({required this.billId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final returnsAsync = ref.watch(saleReturnsByBillProvider(billId));

    return returnsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (returns) {
        if (returns.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.undo_rounded, color: AppColors.warning, size: 16),
              const SizedBox(width: 6),
              Text('Returns / Credit Notes',
                  style: AppTypography.h3.copyWith(color: AppColors.warning)),
            ]),
            const SizedBox(height: AppSpacing.md),
            ...returns.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: AppCard(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(r.creditNoteNumber,
                        style: AppTypography.labelLarge)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: r.isSettled
                            ? AppColors.success.withValues(alpha: 0.1)
                            : AppColors.warning.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(r.isSettled ? 'Settled' : 'Pending',
                          style: AppTypography.caption.copyWith(
                            color: r.isSettled ? AppColors.success : AppColors.warning,
                            fontWeight: FontWeight.w700,
                          )),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    '${DateFormat('dd MMM yyyy').format(r.returnDate)} â€¢ ${r.reason.displayName}',
                    style: AppTypography.caption,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${r.items.length} item(s) returned â€¢ Refund: ${AppFormatters.formatCurrency(r.totalRefundAmount)} via ${r.refundMethod.toUpperCase()}',
                    style: AppTypography.bodySmall,
                  ),
                ]),
              ),
            )),
          ],
        );
      },
    );
  }
}
