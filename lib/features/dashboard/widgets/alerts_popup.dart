import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/providers/inventory_provider.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/models/inventory_batch_model.dart';
import '../../../shared/widgets/status_chip.dart';

class AlertsPopup extends ConsumerWidget {
  const AlertsPopup({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventoryAsync = ref.watch(inventoryProvider);

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700, maxHeight: 600),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.warningContainer,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    ),
                    child: const Icon(Icons.notifications_active_rounded,
                        color: AppColors.warning, size: 20),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Text('Stock Alerts', style: AppTypography.h2),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xxl),
              Expanded(
                child: inventoryAsync.when(
                  loading: () => const Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                  error: (e, _) => Text('Error: $e'),
                  data: (inventory) {
                    final expired = <Map<String, dynamic>>[];
                    final expiringSoon = <Map<String, dynamic>>[];
                    final lowStock = <InventoryModel>[];

                    for (final item in inventory) {
                      for (final batch in item.batches) {
                        if (batch.quantity > 0) {
                          if (batch.isExpired) {
                            expired.add({'product': item.productName, 'batch': batch});
                          } else if (batch.isExpiringSoon) {
                            expiringSoon.add({'product': item.productName, 'batch': batch});
                          }
                        }
                      }
                      if (item.isLowStock || item.isOutOfStock) {
                        lowStock.add(item);
                      }
                    }

                    if (expired.isEmpty && expiringSoon.isEmpty && lowStock.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.check_circle_rounded,
                                color: AppColors.success, size: 48),
                            const SizedBox(height: AppSpacing.lg),
                            Text('All stock looks good! 🎉',
                                style: AppTypography.h3),
                          ],
                        ),
                      );
                    }

                    return DefaultTabController(
                      length: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TabBar(
                            tabs: [
                              _AlertTab('Expired', expired.length, AppColors.error),
                              _AlertTab('Expiring Soon', expiringSoon.length, AppColors.warning),
                              _AlertTab('Low Stock', lowStock.length, AppColors.lowStock),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          Expanded(
                            child: TabBarView(
                              children: [
                                _BatchAlertList(items: expired, type: StatusType.error),
                                _BatchAlertList(items: expiringSoon, type: StatusType.warning),
                                _LowStockList(items: lowStock),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AlertTab extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _AlertTab(this.label, this.count, this.color);

  @override
  Widget build(BuildContext context) {
    return Tab(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          if (count > 0) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                count.toString(),
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BatchAlertList extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final StatusType type;

  const _BatchAlertList({required this.items, required this.type});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Text('No items', style: AppTypography.bodySmall),
      );
    }
    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (_, __) =>
          const Divider(color: AppColors.border, height: 1),
      itemBuilder: (_, i) {
        final item = items[i];
        final batch = item['batch'] as dynamic;
        final days = AppFormatters.daysUntilExpiry(batch.expiryDate);
        return ListTile(
          leading: StatusChip(
            label: days < 0 ? 'Expired' : 'Exp. in ${days}d',
            type: type,
            small: true,
          ),
          title: Text(item['product'] as String, style: AppTypography.labelLarge),
          subtitle: Text(
            'Batch: ${batch.batchNumber} • Qty: ${AppFormatters.formatQuantity(batch.quantity)}',
            style: AppTypography.caption,
          ),
          trailing: Text(
            AppFormatters.formatShortDate(batch.expiryDate),
            style: AppTypography.label.copyWith(color: type == StatusType.error
                ? AppColors.error
                : AppColors.warning),
          ),
        );
      },
    );
  }
}

class _LowStockList extends StatelessWidget {
  final List<InventoryModel> items;

  const _LowStockList({required this.items});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(child: Text('No items', style: AppTypography.bodySmall));
    }
    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (_, __) =>
          const Divider(color: AppColors.border, height: 1),
      itemBuilder: (_, i) {
        final item = items[i];
        return ListTile(
          leading: StatusChip(
            label: item.isOutOfStock ? 'Out of Stock' : 'Low Stock',
            type: item.isOutOfStock ? StatusType.error : StatusType.warning,
            small: true,
          ),
          title: Text(item.productName, style: AppTypography.labelLarge),
          trailing: Text(
            'Qty: ${AppFormatters.formatQuantity(item.totalStock)}',
            style: AppTypography.numericSmall.copyWith(
              color: item.isOutOfStock ? AppColors.error : AppColors.warning,
            ),
          ),
        );
      },
    );
  }
}
