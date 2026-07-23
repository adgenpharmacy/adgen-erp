import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/app_card.dart';

class StockCorrectionScreen extends ConsumerStatefulWidget {
  final String productId;

  const StockCorrectionScreen({super.key, required this.productId});

  @override
  ConsumerState<StockCorrectionScreen> createState() => _StockCorrectionScreenState();
}

class _StockCorrectionScreenState extends ConsumerState<StockCorrectionScreen> {
  final _correctedQtyCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  bool _isLoading = false;

  Future<void> _save(InventoryModel item) async {
    final qty = double.tryParse(_correctedQtyCtrl.text);
    if (qty == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid quantity'), backgroundColor: AppColors.error),
      );
      return;
    }
    if (_reasonCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please provide a reason'), backgroundColor: AppColors.error),
      );
      return;
    }

    setState(() => _isLoading = true);
    final error = await ref.read(inventoryNotifierProvider.notifier).correctStock(
      productId: widget.productId,
      correctedQty: qty,
      reason: _reasonCtrl.text.trim(),
    );

    if (mounted) {
      setState(() => _isLoading = false);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error'), backgroundColor: AppColors.error),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Stock corrected!'), backgroundColor: AppColors.success),
        );
        context.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final inventoryAsync = ref.watch(inventoryProvider);
    final user = ref.watch(authNotifierProvider).value;

    // Owner check
    if (user?.canCorrectStock != true) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_rounded, color: AppColors.error, size: 48),
              const SizedBox(height: AppSpacing.lg),
              Text('Access Restricted', style: AppTypography.h2),
              const SizedBox(height: AppSpacing.sm),
              Text('Only the owner can correct stock', style: AppTypography.bodySmall),
            ],
          ),
        ),
      );
    }

    final item = inventoryAsync.value?.firstWhere(
      (i) => i.productId == widget.productId,
      orElse: () => throw Exception('Product not found'),
    );

    if (item == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isMobile = MediaQuery.of(context).size.width < 700;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text('Stock Correction', style: AppTypography.h3),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(isMobile ? AppSpacing.lg : AppSpacing.screenPadding),
        child: isMobile
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildForm(context, item),
                  const SizedBox(height: AppSpacing.xxl),
                  _buildBatches(item),
                ],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _buildForm(context, item)),
                  const SizedBox(width: AppSpacing.xxl),
                  SizedBox(width: 280, child: _buildBatches(item)),
                ],
              ),
      ),
    );
  }

  Widget _buildForm(BuildContext context, InventoryModel item) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: AppColors.warning),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text('Stock Correction (Owner Only)', style: AppTypography.h3)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.warningContainer,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
            child: Text(
              'This action overwrites the system stock count. Use only when physical count differs from system. All corrections are logged.',
              style: AppTypography.bodySmall.copyWith(color: AppColors.warning),
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(item.productName, style: AppTypography.h2),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.md,
            children: [
              _InfoBox(label: 'System Stock', value: AppFormatters.formatQuantity(item.systemStock)),
              _InfoBox(label: 'Physical Stock', value: AppFormatters.formatQuantity(item.physicalStock)),
              _InfoBox(
                label: 'Difference',
                value: AppFormatters.formatQuantity((item.physicalStock - item.systemStock).abs()),
                color: item.physicalStock == item.systemStock ? AppColors.success : AppColors.error,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxl),
          AppTextField(
            label: 'Corrected Physical Stock *',
            controller: _correctedQtyCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
            prefixIcon: Icons.inventory_rounded,
            hint: 'Enter actual physical count',
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Reason for Correction *',
            controller: _reasonCtrl,
            prefixIcon: Icons.comment_outlined,
            maxLines: 3,
            hint: 'e.g. Physical count after verification, damage, theft...',
          ),
          const SizedBox(height: AppSpacing.xxl),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              AppOutlinedButton(label: 'Cancel', onPressed: () => context.pop()),
              const SizedBox(width: AppSpacing.lg),
              AppButton(
                label: 'Apply Correction',
                icon: Icons.check_rounded,
                onPressed: () => _save(item),
                isLoading: _isLoading,
                color: AppColors.warning,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBatches(InventoryModel item) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Batch Details', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.lg),
          ...item.batches.map((batch) => Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(
                color: batch.isExpired ? AppColors.error.withValues(alpha: 0.4) : AppColors.border,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Batch: ${batch.batchNumber}', style: AppTypography.labelLarge),
                Text('Qty: ${AppFormatters.formatQuantity(batch.quantity)}', style: AppTypography.body),
                Text('Expiry: ${AppFormatters.formatDate(batch.expiryDate)}', style: AppTypography.bodySmall),
              ],
            ),
          )),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _correctedQtyCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }
}

class _InfoBox extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;

  const _InfoBox({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTypography.caption),
          Text(
            value,
            style: AppTypography.numericSmall.copyWith(color: color ?? AppColors.textPrimary),
          ),
        ],
      ),
    );
  }
}
