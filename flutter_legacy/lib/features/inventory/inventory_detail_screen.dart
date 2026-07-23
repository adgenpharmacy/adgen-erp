import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/providers/product_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/models/product_model.dart';
import '../../shared/widgets/status_chip.dart';
import 'batch_adjustment_dialog.dart';

class InventoryDetailScreen extends ConsumerWidget {
  final String productId;
  final InventoryModel? initialData;

  const InventoryDetailScreen({
    super.key,
    required this.productId,
    this.initialData,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventoryAsync = ref.watch(inventoryProvider);
    final user = ref.watch(authNotifierProvider).value;
    final productAsync = ref.watch(productCatalogProvider);

    // Resolve item from stream or fall back to initial data
    final item = inventoryAsync.valueOrNull
            ?.where((i) => i.productId == productId)
            .firstOrNull ??
        initialData;

    // Get product for extra info (type, company, packSize, etc.)
    final product = productAsync.valueOrNull
        ?.where((p) => p.id == productId)
        .firstOrNull;

    if (item == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Inventory')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final isLow = item.isLowStock && !item.isOutOfStock;
    final isOut = item.isOutOfStock;
    final canManage = user?.canCorrectStock ?? false;

    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () async {
                final changed = await showBatchAdjustmentDialog(
                  context,
                  ref: ref,
                  productId: productId,
                  productName: item.productName,
                  existingBatch: null, // add mode
                );
                if (changed && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Manual batch added successfully'),
                    backgroundColor: AppColors.success,
                  ));
                }
              },
              backgroundColor: AppColors.warning,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Manual Adjustment'),
            )
          : null,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            // ─── Sticky Header ─────────────────────────────────────────
            SliverAppBar(
              backgroundColor: AppColors.surface,
              surfaceTintColor: Colors.transparent,
              elevation: 0,
              pinned: true,
              expandedHeight: 160,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_ios_rounded,
                    size: 18, color: AppColors.textPrimary),
                onPressed: () => context.pop(),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg, 72, AppSpacing.lg, AppSpacing.md),
                  decoration: const BoxDecoration(color: AppColors.surface),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: isOut
                                  ? AppColors.errorContainer
                                  : isLow
                                      ? AppColors.warningContainer
                                      : AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Center(
                              child: Text(
                                item.productName.isNotEmpty
                                    ? item.productName[0].toUpperCase()
                                    : '?',
                                style: AppTypography.h2.copyWith(
                                  color: isOut
                                      ? AppColors.error
                                      : isLow
                                          ? AppColors.warning
                                          : AppColors.primary,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.productName,
                                    style: AppTypography.h2,
                                    overflow: TextOverflow.ellipsis),
                                if (product != null) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    '${product.companyName} · ${product.productType.displayName}',
                                    style: AppTypography.bodySmall,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // ─── Summary Stats ─────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Stock summary cards
                    Row(
                      children: [
                        _StatCard(
                          label: 'Total Stock',
                          value: AppFormatters.formatQuantity(item.totalStock),
                          subtitle: product != null ? product.contentUnit : 'units',
                          icon: Icons.inventory_2_rounded,
                          color: isOut
                              ? AppColors.error
                              : isLow
                                  ? AppColors.warning
                                  : AppColors.primary,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        _StatCard(
                          label: 'Batches',
                          value: item.batches.length.toString(),
                          subtitle: 'total batches',
                          icon: Icons.layers_rounded,
                          color: AppColors.secondary,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        _StatCard(
                          label: 'Alert Below',
                          value: item.lowStockThreshold.toStringAsFixed(0),
                          subtitle: 'units threshold',
                          icon: Icons.notifications_active_rounded,
                          color: AppColors.warning,
                        ),
                      ],
                    ),

                    // Status pills
                    if (item.expiredBatches.isNotEmpty ||
                        item.expiringSoonBatches.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.md),
                      Wrap(
                        spacing: 8,
                        children: [
                          if (item.expiredBatches.isNotEmpty)
                            _AlertPill(
                              icon: Icons.dangerous_rounded,
                              label:
                                  '${item.expiredBatches.length} expired batch${item.expiredBatches.length > 1 ? 'es' : ''}',
                              color: AppColors.error,
                            ),
                          if (item.expiringSoonBatches.isNotEmpty)
                            _AlertPill(
                              icon: Icons.access_time_rounded,
                              label:
                                  '${item.expiringSoonBatches.length} expiring soon',
                              color: AppColors.warning,
                            ),
                        ],
                      ),
                    ],

                    const SizedBox(height: AppSpacing.xl),

                    // Batches section header
                    Row(
                      children: [
                        Text('Batch Details', style: AppTypography.h3),
                        const SizedBox(width: AppSpacing.sm),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            borderRadius:
                                BorderRadius.circular(AppSpacing.radiusSm),
                          ),
                          child: Text(
                            '${item.batches.length}',
                            style: AppTypography.label
                                .copyWith(color: AppColors.primary),
                          ),
                        ),
                        const Spacer(),
                        if (canManage)
                          Text(
                            'Tap ⋮ to manage',
                            style: AppTypography.caption,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),

                    // Batch list
                    if (item.batches.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(AppSpacing.xxl),
                        decoration: BoxDecoration(
                          color: AppColors.surface2,
                          borderRadius:
                              BorderRadius.circular(AppSpacing.radiusMd),
                        ),
                        child: Center(
                          child: Column(
                            children: [
                              const Icon(Icons.layers_clear_rounded,
                                  size: 32, color: AppColors.textMuted),
                              const SizedBox(height: AppSpacing.sm),
                              Text('No batches recorded',
                                  style: AppTypography.body),
                              const SizedBox(height: 4),
                              Text(
                                'Batches appear automatically after purchases.\nUse the "Manual Adjustment" button to add opening stock.',
                                style: AppTypography.caption,
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      ...item.batches
                          .asMap()
                          .entries
                          .map((entry) => Padding(
                                padding:
                                    const EdgeInsets.only(bottom: AppSpacing.sm),
                                child: _BatchCard(
                                  batch: entry.value,
                                  productUnit:
                                      product?.contentUnit ?? 'units',
                                  canManage: canManage,
                                  onEditQty: () async {
                                    final changed = await showBatchAdjustmentDialog(
                                      context,
                                      ref: ref,
                                      productId: productId,
                                      productName: item.productName,
                                      existingBatch: entry.value,
                                    );
                                    if (changed && context.mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Batch updated'),
                                          backgroundColor: AppColors.success,
                                        ),
                                      );
                                    }
                                  },
                                  onRemove: () => _confirmRemoveBatch(
                                    context, ref, item, entry.value,
                                    user?.name ?? 'Owner',
                                  ),
                                ),
                              )
                              .animate(
                                  delay: Duration(
                                      milliseconds: 50 + entry.key * 40))
                              .fadeIn(duration: 200.ms)
                              .slideY(begin: 0.05, end: 0)),

                    // Bottom padding for FAB
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmRemoveBatch(
    BuildContext context,
    WidgetRef ref,
    InventoryModel item,
    InventoryBatch batch,
    String removedByName,
  ) async {
    final reasonCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(children: [
          Icon(Icons.delete_outline_rounded, color: AppColors.error, size: 20),
          SizedBox(width: 8),
          Text('Remove Batch?'),
        ]),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Remove batch "${batch.batchNumber}" with '
                '${AppFormatters.formatQuantity(batch.quantity)} units?'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtrl,
              decoration: const InputDecoration(
                labelText: 'Reason *',
                hintText: 'e.g. Expired stock, returned to supplier...',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.delete_rounded, size: 16),
            label: const Text('Remove'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      if (reasonCtrl.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Please provide a reason'),
          backgroundColor: AppColors.error,
        ));
        return;
      }
      final error = await ref.read(inventoryNotifierProvider.notifier).removeBatch(
        productId: item.productId,
        batchNumber: batch.batchNumber,
        reason: reasonCtrl.text.trim(),
        removedByName: removedByName,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(error ?? 'Batch removed'),
          backgroundColor: error != null ? AppColors.error : AppColors.success,
        ));
      }
    }
    reasonCtrl.dispose();
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String label, value, subtitle;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 6),
            Text(value,
                style: AppTypography.numericSmall.copyWith(
                    color: color, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(label,
                style: AppTypography.overline.copyWith(color: AppColors.textMuted)),
          ],
        ),
      ),
    );
  }
}

// ─── Alert Pill ───────────────────────────────────────────────────────────────
class _AlertPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _AlertPill({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Text(label,
              style: AppTypography.label.copyWith(color: color, fontSize: 11)),
        ],
      ),
    );
  }
}

// ─── Batch Card (with management menu for owner) ──────────────────────────────
class _BatchCard extends StatelessWidget {
  final InventoryBatch batch;
  final String productUnit;
  final bool canManage;
  final VoidCallback onEditQty;
  final VoidCallback onRemove;

  const _BatchCard({
    required this.batch,
    required this.productUnit,
    required this.canManage,
    required this.onEditQty,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    String statusLabel;
    StatusType statusType;
    if (batch.isExpired) {
      statusColor = AppColors.error;
      statusLabel = 'Expired';
      statusType = StatusType.error;
    } else if (batch.isExpiringSoon) {
      statusColor = AppColors.warning;
      statusLabel = 'Expiring Soon';
      statusType = StatusType.warning;
    } else {
      statusColor = AppColors.success;
      statusLabel = 'Good';
      statusType = StatusType.success;
    }

    final daysToExpiry = batch.expiryDate.difference(DateTime.now()).inDays;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: batch.isExpired
              ? AppColors.error.withValues(alpha: 0.35)
              : batch.isExpiringSoon
                  ? AppColors.warning.withValues(alpha: 0.35)
                  : batch.isManualAdjustment
                      ? AppColors.warning.withValues(alpha: 0.2)
                      : AppColors.border,
        ),
      ),
      child: Column(
        children: [
          // Main row
          Row(
            children: [
              // Batch icon
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  batch.isManualAdjustment ? Icons.tune_rounded : Icons.qr_code_2_rounded,
                  size: 18,
                  color: statusColor,
                ),
              ),
              const SizedBox(width: AppSpacing.md),

              // Batch info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(batch.batchNumber,
                            style: AppTypography.labelLarge
                                .copyWith(fontFamily: 'monospace')),
                        if (batch.isManualAdjustment) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.warningContainer,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text('Manual',
                                style: AppTypography.overline.copyWith(
                                    color: AppColors.warning, fontSize: 9)),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(Icons.calendar_today_rounded,
                            size: 11, color: AppColors.textMuted),
                        const SizedBox(width: 3),
                        Text(
                          'Exp: ${AppFormatters.formatShortDate(batch.expiryDate)}',
                          style: AppTypography.caption.copyWith(
                              color: batch.isExpired
                                  ? AppColors.error
                                  : batch.isExpiringSoon
                                      ? AppColors.warning
                                      : AppColors.textMuted),
                        ),
                        if (!batch.isExpired && daysToExpiry <= 90) ...[
                          const SizedBox(width: 6),
                          Text(
                            '($daysToExpiry days)',
                            style: AppTypography.caption.copyWith(
                                color: daysToExpiry <= 30
                                    ? AppColors.error
                                    : AppColors.warning),
                          ),
                        ],
                      ],
                    ),
                    if (batch.adjustmentReason != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        '📝 ${batch.adjustmentReason}',
                        style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),

              // Quantity + status
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${AppFormatters.formatQuantity(batch.quantity)} $productUnit',
                    style: AppTypography.numericSmall.copyWith(
                        fontWeight: FontWeight.w700, color: statusColor),
                  ),
                  const SizedBox(height: 3),
                  StatusChip(label: statusLabel, type: statusType, small: true),
                ],
              ),

              // Management menu (owner only)
              if (canManage) ...[
                const SizedBox(width: 4),
                PopupMenuButton<String>(
                  onSelected: (action) {
                    if (action == 'edit') onEditQty();
                    if (action == 'remove') onRemove();
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(children: [
                        Icon(Icons.edit_rounded, size: 16, color: AppColors.warning),
                        SizedBox(width: 8),
                        Text('Edit Quantity', style: TextStyle(color: AppColors.warning)),
                      ]),
                    ),
                    const PopupMenuDivider(),
                    const PopupMenuItem(
                      value: 'remove',
                      child: Row(children: [
                        Icon(Icons.delete_outline_rounded, size: 16, color: AppColors.error),
                        SizedBox(width: 8),
                        Text('Remove Batch', style: TextStyle(color: AppColors.error)),
                      ]),
                    ),
                  ],
                  icon: const Icon(Icons.more_vert_rounded,
                      size: 18, color: AppColors.textMuted),
                ),
              ],
            ],
          ),

          // MRP / Purchase Rate row
          const SizedBox(height: AppSpacing.sm),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              _BatchDetail(label: 'MRP', value: '₹${batch.mrp.toStringAsFixed(2)}'),
              const SizedBox(width: AppSpacing.lg),
              _BatchDetail(
                  label: 'Purchase Rate',
                  value: '₹${batch.purchaseRate.toStringAsFixed(2)}'),
              const Spacer(),
              if (batch.quantity <= 0)
                const _AlertPill(
                  icon: Icons.remove_circle_outline_rounded,
                  label: 'Depleted',
                  color: AppColors.textMuted,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BatchDetail extends StatelessWidget {
  final String label, value;
  const _BatchDetail({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.overline.copyWith(color: AppColors.textMuted)),
        Text(value, style: AppTypography.label.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }
}
