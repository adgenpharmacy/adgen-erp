import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/purchase_return_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/widgets/app_card.dart';

// ─── Return Reason Options ────────────────────────────────────────────────────
const _reasons = [
  'Damaged / Defective Goods',
  'Wrong Items Supplied',
  'Near-Expiry / Expired Stock',
  'Quality Issues',
  'Excess Quantity',
  'Price Discrepancy',
  'Other',
];

// ─── Screen ───────────────────────────────────────────────────────────────────
class PurchaseReturnScreen extends ConsumerStatefulWidget {
  final PurchaseBillModel originalBill;
  const PurchaseReturnScreen({super.key, required this.originalBill});

  @override
  ConsumerState<PurchaseReturnScreen> createState() =>
      _PurchaseReturnScreenState();
}

class _PurchaseReturnScreenState
    extends ConsumerState<PurchaseReturnScreen> {
  // Per-item controllers
  final Map<String, TextEditingController> _qtyControllers = {};
  final Map<String, bool> _selected = {};

  String _reason = _reasons.first;
  final _notesCtrl = TextEditingController();
  bool _saving = false;

  PurchaseBillModel get bill => widget.originalBill;

  @override
  void initState() {
    super.initState();
    for (final item in bill.items) {
      final key = _key(item);
      _qtyControllers[key] = TextEditingController(
          text: item.quantity.toStringAsFixed(0));
      _selected[key] = false;
    }
  }

  @override
  void dispose() {
    for (final c in _qtyControllers.values) {
      c.dispose();
    }
    _notesCtrl.dispose();
    super.dispose();
  }

  String _key(PurchaseItem item) => '${item.productId}_${item.batchNumber}';

  double _returnQtyFor(PurchaseItem item) {
    final key = _key(item);
    if (_selected[key] != true) return 0;
    final v = double.tryParse(_qtyControllers[key]?.text ?? '0') ?? 0;
    return v.clamp(0, item.quantity);
  }

  double get _totalReturn {
    double total = 0;
    for (final item in bill.items) {
      final qty = _returnQtyFor(item);
      if (qty <= 0) continue;
      final gross = item.rate * qty;
      final disc = gross * item.discountPercent / 100;
      final taxable = gross - disc;
      total += taxable + (taxable * item.gstPercent / 100);
    }
    return total;
  }

  double get _totalGstReversed {
    double total = 0;
    for (final item in bill.items) {
      final qty = _returnQtyFor(item);
      if (qty <= 0) continue;
      final gross = item.rate * qty;
      final disc = gross * item.discountPercent / 100;
      final taxable = gross - disc;
      total += taxable * item.gstPercent / 100;
    }
    return total;
  }

  int get _selectedCount => _selected.values.where((v) => v).length;

  Future<void> _save() async {
    if (_selectedCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Select at least one item to return'),
        backgroundColor: AppColors.error,
      ));
      return;
    }
    if (_totalReturn <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Return quantity must be greater than zero'),
        backgroundColor: AppColors.error,
      ));
      return;
    }

    setState(() => _saving = true);

    final user = ref.read(authNotifierProvider).value;

    final returnItems = <PurchaseReturnItem>[];
    for (final item in bill.items) {
      final qty = _returnQtyFor(item);
      if (qty <= 0) continue;
      returnItems.add(PurchaseReturnItem(
        productId: item.productId,
        productName: item.productName,
        hsnCode: item.hsnCode,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        returnQty: qty,
        contentQtyReturned: qty * item.packSize,
        packSize: item.packSize,
        packUnit: item.packUnit,
        contentUnit: item.contentUnit,
        mrp: item.mrp,
        rate: item.rate,
        gstPercent: item.gstPercent,
        discountPercent: item.discountPercent,
      ));
    }

    final model = PurchaseReturnModel(
      debitNoteNumber: '',
      originalBillId: bill.id!,
      originalInvoiceNumber: bill.invoiceNumber,
      partyId: bill.partyId,
      partyName: bill.partyName,
      returnDate: DateTime.now(),
      createdAt: DateTime.now(),
      createdByUid: user?.uid ?? '',
      createdByName: user?.name ?? '',
      items: returnItems,
      totalReturnAmount: _totalReturn,
      totalGstReversed: _totalGstReversed,
      reason: _reason,
      notes: _notesCtrl.text.trim().isNotEmpty ? _notesCtrl.text.trim() : null,
    );

    final error = await ref
        .read(purchaseReturnNotifierProvider.notifier)
        .createPurchaseReturn(model);

    setState(() => _saving = false);

    if (!mounted) return;
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Error: $error'),
        backgroundColor: AppColors.error,
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            'Debit note created. Deduction: ${AppFormatters.formatCurrency(_totalReturn)}'),
        backgroundColor: AppColors.success,
      ));
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Purchase Return', style: AppTypography.h3),
            Text('Against ${bill.invoiceNumber}',
                style: AppTypography.caption),
          ],
        ),
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            TextButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.check_rounded),
              label: const Text('Create Return'),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                textStyle: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          // ── Original Bill Info ────────────────────────────────────────────
          AppCard(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(children: [
              const Icon(Icons.receipt_long_rounded,
                  color: AppColors.warning, size: 20),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Original Invoice: ${bill.invoiceNumber}',
                      style: AppTypography.labelLarge),
                  Text(
                    '${bill.partyName} · ${DateFormat('dd MMM yyyy').format(bill.invoiceDate)} · ${AppFormatters.formatCurrency(bill.grandTotal)}',
                    style: AppTypography.caption,
                  ),
                ]),
              ),
            ]),
          ),

          const SizedBox(height: AppSpacing.lg),
          Text('Select Items to Return', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Items go back to supplier. Stock is deducted from inventory.',
            style: AppTypography.bodySmall,
          ),
          const SizedBox(height: AppSpacing.md),

          // ── Item List ─────────────────────────────────────────────────────
          ...bill.items.map((item) {
            final key = _key(item);
            final isSelected = _selected[key] ?? false;
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: _PurchaseReturnItemRow(
                item: item,
                isSelected: isSelected,
                controller: _qtyControllers[key]!,
                onToggle: (v) => setState(() => _selected[key] = v),
                onQtyChanged: () => setState(() {}),
              ),
            );
          }),

          const SizedBox(height: AppSpacing.xl),
          const Divider(),
          const SizedBox(height: AppSpacing.md),

          // ── Reason ────────────────────────────────────────────────────────
          Text('Return Reason *', style: AppTypography.labelLarge),
          const SizedBox(height: AppSpacing.sm),
          DropdownButtonFormField<String>(
            initialValue: _reason,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            items: _reasons
                .map((r) => DropdownMenuItem(
                      value: r,
                      child: Text(r, style: AppTypography.body),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _reason = v!),
          ),
          const SizedBox(height: AppSpacing.md),

          // ── Notes ─────────────────────────────────────────────────────────
          TextField(
            controller: _notesCtrl,
            decoration: const InputDecoration(
              labelText: 'Additional notes (optional)',
              border: OutlineInputBorder(),
            ),
            maxLines: 2,
          ),

          const SizedBox(height: AppSpacing.xxl),

          // ── Debit Note Summary ────────────────────────────────────────────
          AppCard(
            backgroundColor: AppColors.warningContainer,
            borderColor: AppColors.warning.withValues(alpha: 0.3),
            child: Column(children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Items Selected', style: AppTypography.body),
                  Text('$_selectedCount item${_selectedCount == 1 ? '' : 's'}',
                      style: AppTypography.labelLarge),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('GST Reversed', style: AppTypography.body),
                  Text(
                    AppFormatters.formatCurrency(_totalGstReversed),
                    style: AppTypography.numeric.copyWith(color: AppColors.warning),
                  ),
                ],
              ),
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Total Debit Amount', style: AppTypography.h3),
                  Text(
                    AppFormatters.formatCurrency(_totalReturn),
                    style: AppTypography.numericLarge
                        .copyWith(color: AppColors.warning),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'A Debit Note will be raised against ${bill.partyName} for this amount.',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
            ]),
          ),
          const SizedBox(height: 48),
        ],
      ),
    );
  }
}

// ─── Purchase Return Item Row ─────────────────────────────────────────────────
class _PurchaseReturnItemRow extends StatelessWidget {
  final PurchaseItem item;
  final bool isSelected;
  final TextEditingController controller;
  final ValueChanged<bool> onToggle;
  final VoidCallback onQtyChanged;

  const _PurchaseReturnItemRow({
    required this.item,
    required this.isSelected,
    required this.controller,
    required this.onToggle,
    required this.onQtyChanged,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Row(children: [
        Checkbox(
          value: isSelected,
          onChanged: (v) => onToggle(v ?? false),
          activeColor: AppColors.warning,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.productName,
                style: AppTypography.labelLarge,
                overflow: TextOverflow.ellipsis),
            Text(
              'Batch: ${item.batchNumber}  ·  '
              'Qty: ${item.quantity.toStringAsFixed(0)} ${item.packUnit}  ·  '
              'Rate: ${AppFormatters.formatCurrency(item.rate)}',
              style: AppTypography.caption,
            ),
          ]),
        ),
        if (isSelected)
          SizedBox(
            width: 80,
            child: TextFormField(
              controller: controller,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: AppTypography.numeric,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
                hintText: 'Qty',
                hintStyle: AppTypography.caption,
              ),
              onChanged: (_) => onQtyChanged(),
            ),
          ),
        if (!isSelected)
          Text(
            AppFormatters.formatCurrency(item.lineTotal),
            style: AppTypography.numeric
                .copyWith(color: AppColors.textSecondary),
          ),
      ]),
    );
  }
}
