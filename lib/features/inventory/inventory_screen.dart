import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/models/product_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _stockFilter = 'All';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inventoryAsync = ref.watch(inventoryProvider);
    final user = ref.watch(authNotifierProvider).value;
    // Build product map for packSize lookup
    final productsMap = <String, ProductModel>{};
    ref.watch(productsProvider).valueOrNull?.forEach((p) {
      if (p.id != null) productsMap[p.id!] = p;
    });

    return ScreenShell(
      title: 'Inventory',
      subtitle: 'Live stock & batch tracking',
      headerExtras: [
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: 'Search by product name or batch…',
            hintStyle: AppTypography.bodySmall,
            prefixIcon: const Icon(Icons.search_rounded, size: 18, color: AppColors.textMuted),
            suffixIcon: _search.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded, size: 16, color: AppColors.textMuted),
                    onPressed: () {
                      _searchCtrl.clear();
                      setState(() => _search = '');
                    },
                  )
                : null,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: ['All', 'In Stock', 'Low Stock', 'Out of Stock', 'Expiring Soon']
                .map((filter) {
              final isSelected = _stockFilter == filter;
              final color = _filterColor(filter);
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(filter),
                  selected: isSelected,
                  onSelected: (_) => setState(() => _stockFilter = filter),
                  selectedColor: color.withValues(alpha: 0.12),
                  checkmarkColor: color,
                  labelStyle: AppTypography.label.copyWith(
                    color: isSelected ? color : AppColors.textSecondary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(color: isSelected ? color : AppColors.border),
                  backgroundColor: AppColors.surface,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              );
            }).toList(),
          ),
        ),
      ],
      body: inventoryAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (inventory) {
          if (inventory.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.inventory_2_outlined,
                        size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No inventory yet', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Stock is updated automatically when you add purchases',
                    style: AppTypography.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          // Filter
          final q = _search.toLowerCase();
          final filtered = inventory.where((item) {
            final matchesSearch = q.isEmpty ||
                item.productName.toLowerCase().contains(q) ||
                item.batches.any((b) => b.batchNumber.toLowerCase().contains(q));
            final matchesFilter = _stockFilter == 'All' ||
                (_stockFilter == 'In Stock' && !item.isLowStock && !item.isOutOfStock) ||
                (_stockFilter == 'Low Stock' && item.isLowStock && !item.isOutOfStock) ||
                (_stockFilter == 'Out of Stock' && item.isOutOfStock) ||
                (_stockFilter == 'Expiring Soon' && item.expiringSoonBatches.isNotEmpty);
            return matchesSearch && matchesFilter;
          }).toList();

          if (filtered.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.search_off_rounded, size: 36, color: AppColors.textMuted),
                  const SizedBox(height: AppSpacing.md),
                  Text('No products match', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Try a different search or filter', style: AppTypography.bodySmall),
                ],
              ),
            );
          }

          final lowCount = inventory.where((i) => i.isLowStock && !i.isOutOfStock).length;
          final outCount = inventory.where((i) => i.isOutOfStock).length;

          return Column(
            children: [
              // Summary bar
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Text('${filtered.length} products', style: AppTypography.caption),
                    const Spacer(),
                    if (lowCount > 0) ...[
                      const Icon(Icons.warning_amber_rounded,
                          size: 12, color: AppColors.warning),
                      const SizedBox(width: 4),
                      Text('$lowCount low',
                          style: AppTypography.caption.copyWith(color: AppColors.warning)),
                      const SizedBox(width: 12),
                    ],
                    if (outCount > 0) ...[
                      const Icon(Icons.error_outline_rounded,
                          size: 12, color: AppColors.error),
                      const SizedBox(width: 4),
                      Text('$outCount out',
                          style: AppTypography.caption.copyWith(color: AppColors.error)),
                    ],
                  ],
                ),
              ),

              Expanded(
                child: ListView.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (_, i) {
                    final inv = filtered[i];
                    final product = productsMap[inv.productId];
                    return _InventoryCard(
                      item: inv,
                      packSize: product?.packSize ?? 1,
                      packUnit: product?.packUnit ?? 'Unit',
                      contentUnit: product?.contentUnit ?? 'Unit',
                      hasPack: product?.productType.hasPack ?? false,
                      canDelete: user?.canDeleteRecords ?? false,
                      canCorrect: user?.canCorrectStock ?? false,
                      onTap: () => context.push(
                        '/inventory/detail/${filtered[i].productId}',
                        extra: filtered[i],
                      ),
                      onCorrect: () =>
                          context.push('/inventory/correct/${filtered[i].productId}'),
                      onDelete: () => _confirmDelete(context, ref, filtered[i]),
                    ).animate(delay: Duration(milliseconds: i * 30)).fadeIn(duration: 200.ms).slideY(begin: 0.04, end: 0);
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Color _filterColor(String filter) {
    switch (filter) {
      case 'Low Stock':     return AppColors.warning;
      case 'Out of Stock':  return AppColors.error;
      case 'Expiring Soon': return AppColors.scheduleH;
      case 'In Stock':      return AppColors.success;
      default:              return AppColors.primary;
    }
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, InventoryModel item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          const Icon(Icons.delete_outline_rounded, color: AppColors.error, size: 20),
          const SizedBox(width: 8),
          const Text('Delete Record?'),
        ]),
        content: Text(
          'Remove "${item.productName}" from inventory?\n\n'
          'This only removes the inventory tracking record, not the product master. '
          'Use this only for dummy or false records.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              final error = await ref
                  .read(inventoryNotifierProvider.notifier)
                  .deleteInventory(item.productId);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(error ?? 'Record deleted'),
                  backgroundColor: error != null ? AppColors.error : AppColors.success,
                ));
              }
            },
            icon: const Icon(Icons.delete_rounded, size: 16),
            label: const Text('Delete'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
              elevation: 0,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Inventory Card ───────────────────────────────────────────────────────────
class _InventoryCard extends StatelessWidget {
  final InventoryModel item;
  final int packSize;
  final String packUnit;
  final String contentUnit;
  final bool hasPack;
  final bool canDelete;
  final bool canCorrect;
  final VoidCallback onTap;
  final VoidCallback onCorrect;
  final VoidCallback onDelete;

  const _InventoryCard({
    required this.item,
    required this.packSize,
    required this.packUnit,
    required this.contentUnit,
    required this.hasPack,
    required this.canDelete,
    required this.canCorrect,
    required this.onTap,
    required this.onCorrect,
    required this.onDelete,
  });

  /// Format total content units as “X strips Y tablets”
  String get _stockLabel {
    if (item.isOutOfStock) return 'Out of Stock';
    if (item.isLowStock) return 'Low';
    return 'In Stock';
  }

  String _formatStock(double total) {
    if (!hasPack || packSize <= 1) {
      return '${AppFormatters.formatQuantity(total)} ${contentUnit}s';
    }
    final strips = (total ~/ packSize);
    final loose = (total % packSize).toInt();
    if (strips == 0) return '$loose $contentUnit${loose == 1 ? '' : 's'}';
    if (loose == 0) return '$strips $packUnit${strips == 1 ? '' : 's'}';
    return '$strips $packUnit${strips == 1 ? '' : 's'} $loose $contentUnit${loose == 1 ? '' : 's'}';
  }

  StatusType get _stockStatusType {
    if (item.isOutOfStock) return StatusType.error;
    if (item.isLowStock) return StatusType.warning;
    return StatusType.success;
  }

  Color get _avatarColor {
    if (item.isOutOfStock) return AppColors.errorContainer;
    if (item.isLowStock) return AppColors.warningContainer;
    if (item.expiredBatches.isNotEmpty) return AppColors.errorContainer;
    if (item.expiringSoonBatches.isNotEmpty) return AppColors.warningContainer;
    return AppColors.primaryContainer;
  }

  Color get _avatarIconColor {
    if (item.isOutOfStock) return AppColors.error;
    if (item.isLowStock) return AppColors.warning;
    if (item.expiredBatches.isNotEmpty) return AppColors.error;
    if (item.expiringSoonBatches.isNotEmpty) return AppColors.warning;
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final initials = item.productName.isNotEmpty
        ? item.productName[0].toUpperCase()
        : '?';

    return AppCard(
      onTap: onTap,
      borderColor: item.expiredBatches.isNotEmpty
          ? AppColors.error.withValues(alpha: 0.3)
          : item.expiringSoonBatches.isNotEmpty
              ? AppColors.warning.withValues(alpha: 0.3)
              : null,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: _avatarColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(initials,
                  style: AppTypography.h3.copyWith(
                    color: _avatarIconColor,
                    fontSize: 18,
                  )),
            ),
          ),
          const SizedBox(width: AppSpacing.md),

          // Main info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.productName,
                    style: AppTypography.labelLarge,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.layers_rounded,
                        size: 11, color: AppColors.textMuted),
                    const SizedBox(width: 3),
                    Text(
                      '${item.batches.length} batch${item.batches.length == 1 ? '' : 'es'}',
                      style: AppTypography.caption,
                    ),
                    if (item.expiredBatches.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      const Icon(Icons.warning_amber_rounded,
                          size: 11, color: AppColors.error),
                      const SizedBox(width: 2),
                      Text('${item.expiredBatches.length} expired',
                          style: AppTypography.caption
                              .copyWith(color: AppColors.error)),
                    ] else if (item.expiringSoonBatches.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      const Icon(Icons.access_time_rounded,
                          size: 11, color: AppColors.warning),
                      const SizedBox(width: 2),
                      Text('${item.expiringSoonBatches.length} expiring',
                          style: AppTypography.caption
                              .copyWith(color: AppColors.warning)),
                    ],
                  ],
                ),
              ],
            ),
          ),

          // Stock quantity + status
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatStock(item.totalStock),
                style: AppTypography.numericSmall.copyWith(
                  fontWeight: FontWeight.w700,
                  color: item.isOutOfStock
                      ? AppColors.error
                      : item.isLowStock
                          ? AppColors.warning
                          : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 3),
              StatusChip(label: _stockLabel, type: _stockStatusType, small: true),
            ],
          ),
          const SizedBox(width: AppSpacing.xs),

          // Actions menu
          PopupMenuButton<String>(
            onSelected: (action) {
              if (action == 'view') onTap();
              if (action == 'correct') onCorrect();
              if (action == 'delete') onDelete();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'view',
                child: Row(children: [
                  Icon(Icons.visibility_rounded, size: 16),
                  SizedBox(width: 8),
                  Text('View Batches'),
                ]),
              ),
              if (canCorrect)
                const PopupMenuItem(
                  value: 'correct',
                  child: Row(children: [
                    Icon(Icons.tune_rounded, size: 16, color: AppColors.warning),
                    SizedBox(width: 8),
                    Text('Correct Stock',
                        style: TextStyle(color: AppColors.warning)),
                  ]),
                ),
              if (canDelete) ...[
                const PopupMenuDivider(),
                const PopupMenuItem(
                  value: 'delete',
                  child: Row(children: [
                    Icon(Icons.delete_outline_rounded,
                        size: 16, color: AppColors.error),
                    SizedBox(width: 8),
                    Text('Delete Record',
                        style: TextStyle(color: AppColors.error)),
                  ]),
                ),
              ],
            ],
            icon: const Icon(Icons.more_vert_rounded,
                color: AppColors.textMuted, size: 20),
          ),
        ],
      ),
    );
  }
}
