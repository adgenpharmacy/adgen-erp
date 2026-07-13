import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';

/// Shows a bottom sheet to adjust an existing batch's quantity or add a new manual batch.
/// [mode] = 'edit' for adjusting an existing batch, 'add' for adding a manual adjustment batch.
Future<bool> showBatchAdjustmentDialog(
  BuildContext context, {
  required WidgetRef ref,
  required String productId,
  required String productName,
  InventoryBatch? existingBatch, // null = add mode
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _BatchAdjustmentSheet(
      ref: ref,
      productId: productId,
      productName: productName,
      existingBatch: existingBatch,
    ),
  );
  return result ?? false;
}

class _BatchAdjustmentSheet extends ConsumerStatefulWidget {
  final WidgetRef ref;
  final String productId;
  final String productName;
  final InventoryBatch? existingBatch;

  const _BatchAdjustmentSheet({
    required this.ref,
    required this.productId,
    required this.productName,
    this.existingBatch,
  });

  @override
  ConsumerState<_BatchAdjustmentSheet> createState() => _BatchAdjustmentSheetState();
}

class _BatchAdjustmentSheetState extends ConsumerState<_BatchAdjustmentSheet> {
  late final bool _isEditMode;
  final _batchNoCtrl = TextEditingController();
  final _qtyCtrl = TextEditingController();
  final _mrpCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  DateTime _expiryDate = DateTime.now().add(const Duration(days: 365));
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _isEditMode = widget.existingBatch != null;
    if (_isEditMode) {
      final b = widget.existingBatch!;
      _batchNoCtrl.text = b.batchNumber;
      _qtyCtrl.text = b.quantity.toStringAsFixed(0);
      _mrpCtrl.text = b.mrp.toStringAsFixed(2);
      _expiryDate = b.expiryDate;
    }
  }

  @override
  void dispose() {
    _batchNoCtrl.dispose();
    _qtyCtrl.dispose();
    _mrpCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickExpiry() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiryDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Select Expiry Date',
    );
    if (picked != null) setState(() => _expiryDate = picked);
  }

  Future<void> _save() async {
    final qty = double.tryParse(_qtyCtrl.text);
    if (qty == null || qty < 0) {
      _showError('Enter a valid quantity (0 or more)');
      return;
    }
    if (_reasonCtrl.text.trim().isEmpty) {
      _showError('Please provide a reason for this adjustment');
      return;
    }
    if (!_isEditMode && _batchNoCtrl.text.trim().isEmpty) {
      _showError('Batch number is required');
      return;
    }

    final user = ref.read(authNotifierProvider).value;
    final adjustedByName = user?.name ?? 'Owner';
    final notifier = ref.read(inventoryNotifierProvider.notifier);

    setState(() => _isLoading = true);

    String? error;

    if (_isEditMode) {
      error = await notifier.adjustBatchQuantity(
        productId: widget.productId,
        batchNumber: widget.existingBatch!.batchNumber,
        newQuantity: qty,
        reason: _reasonCtrl.text.trim(),
        adjustedByName: adjustedByName,
      );
    } else {
      final mrp = double.tryParse(_mrpCtrl.text) ?? 0;
      final newBatch = InventoryBatch(
        batchNumber: _batchNoCtrl.text.trim(),
        expiryDate: _expiryDate,
        quantity: qty,
        mrp: mrp,
        purchaseRate: mrp,
        purchaseDate: DateTime.now(),
        isManualAdjustment: true,
        adjustmentReason: _reasonCtrl.text.trim(),
        adjustedByName: adjustedByName,
      );
      error = await notifier.addManualAdjustmentBatch(
        productId: widget.productId,
        batch: newBatch,
      );
    }

    if (mounted) {
      setState(() => _isLoading = false);
      if (error != null) {
        _showError(error);
      } else {
        Navigator.pop(context, true);
      }
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = _isEditMode ? 'Adjust Batch Quantity' : 'Add Manual Adjustment';
    final existingBatch = widget.existingBatch;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            const SizedBox(height: 12),
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.warningContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.tune_rounded, color: AppColors.warning, size: 20),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: AppTypography.h3),
                        Text(widget.productName, style: AppTypography.bodySmall),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context, false),
                    icon: const Icon(Icons.close_rounded, size: 20),
                  ),
                ],
              ),
            ),

            const SizedBox(height: AppSpacing.md),

            // Warning notice
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.warningContainer,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded, color: AppColors.warning, size: 16),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        _isEditMode
                          ? 'This manually overrides the batch stock count. Use only to correct errors. All changes are logged.'
                          : 'Use for opening stock, returns, or corrections not tied to a purchase bill.',
                        style: AppTypography.caption.copyWith(color: AppColors.warning),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: AppSpacing.lg),

            // Fields
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Column(
                children: [
                  // In edit mode, show the batch no. as read-only info
                  if (_isEditMode && existingBatch != null) ...[
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: AppColors.surface2,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.tag_rounded, size: 14, color: AppColors.textMuted),
                          const SizedBox(width: AppSpacing.sm),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Batch Number', style: AppTypography.caption),
                              Text(existingBatch.batchNumber, style: AppTypography.labelLarge),
                            ],
                          ),
                          const Spacer(),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('Current Qty', style: AppTypography.caption),
                              Text(
                                AppFormatters.formatQuantity(existingBatch.quantity),
                                style: AppTypography.numericSmall.copyWith(
                                    color: AppColors.primary, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  // Add mode: batch number input
                  if (!_isEditMode) ...[
                    AppTextField(
                      label: 'Batch Number *',
                      controller: _batchNoCtrl,
                      prefixIcon: Icons.tag_rounded,
                      hint: 'e.g. BATCH001',
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          label: _isEditMode ? 'New Quantity *' : 'Quantity *',
                          controller: _qtyCtrl,
                          prefixIcon: Icons.inventory_2_rounded,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                          hint: '0',
                        ),
                      ),
                      if (!_isEditMode) ...[
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: AppTextField(
                            label: 'MRP (₹)',
                            controller: _mrpCtrl,
                            prefixIcon: Icons.currency_rupee_rounded,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                          ),
                        ),
                      ],
                    ],
                  ),

                  // Add mode: expiry date picker
                  if (!_isEditMode) ...[
                    const SizedBox(height: AppSpacing.md),
                    InkWell(
                      onTap: _pickExpiry,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.md, vertical: 14),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.border),
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.calendar_today_rounded,
                                size: 16, color: AppColors.textMuted),
                            const SizedBox(width: AppSpacing.sm),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Expiry Date', style: AppTypography.caption),
                                Text(
                                  DateFormat('MMM yyyy').format(_expiryDate),
                                  style: AppTypography.labelLarge,
                                ),
                              ],
                            ),
                            const Spacer(),
                            const Icon(Icons.chevron_right_rounded,
                                color: AppColors.textMuted, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    label: 'Reason for Adjustment *',
                    controller: _reasonCtrl,
                    prefixIcon: Icons.comment_outlined,
                    maxLines: 2,
                    hint: 'e.g. Physical count correction, damage, opening stock...',
                  ),
                ],
              ),
            ),

            const SizedBox(height: AppSpacing.xl),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: AppOutlinedButton(
                      label: 'Cancel',
                      onPressed: () => Navigator.pop(context, false),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: AppButton(
                      label: _isEditMode ? 'Apply Adjustment' : 'Add Batch',
                      icon: Icons.check_rounded,
                      isLoading: _isLoading,
                      onPressed: _save,
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}
