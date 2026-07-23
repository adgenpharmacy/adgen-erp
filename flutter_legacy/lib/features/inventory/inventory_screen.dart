import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
import '../../shared/widgets/alphabet_scrollbar.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  String _search = '';
  String _stockFilter = 'In Stock';
  String _sortBy = 'Alphabetical';

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
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

    double totalValue = 0;
    int totalItems = 0;
    inventoryAsync.whenData((inv) {
      totalItems = inv.length;
      for (final item in inv) {
        final p = productsMap[item.productId];
        final packSize = p?.packSize ?? 1;
        for (final b in item.batches) {
          final packQty = b.quantity / packSize;
          totalValue += packQty * b.purchaseRate;
        }
      }
    });

    return ScreenShell(
      title: 'Inventory',
      subtitle: 'Live stock & batch tracking',
      headerExtras: [
        if (totalItems > 0) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total Inventory Value', style: AppTypography.caption),
                    Text(
                      AppFormatters.formatCurrency(totalValue),
                      style: AppTypography.h3.copyWith(color: AppColors.primary),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Total Items', style: AppTypography.caption),
                    Text(
                      totalItems.toString(),
                      style: AppTypography.labelLarge,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],

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
                (_stockFilter == 'In Stock' && !item.isOutOfStock) ||
                (_stockFilter == 'Low Stock' && item.isLowStock && !item.isOutOfStock) ||
                (_stockFilter == 'Out of Stock' && item.isOutOfStock) ||
                (_stockFilter == 'Expiring Soon' && item.expiringSoonBatches.isNotEmpty);
            return matchesSearch && matchesFilter;
          }).toList();

          // Sort
          filtered.sort((a, b) {
            switch (_sortBy) {
              case 'Highest Stock':
                return b.systemStock.compareTo(a.systemStock);
              case 'Lowest Stock':
                return a.systemStock.compareTo(b.systemStock);
              case 'Alphabetical':
              default:
                return a.productName.toLowerCase().compareTo(b.productName.toLowerCase());
            }
          });

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
                    const SizedBox(width: AppSpacing.md),
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
                    const Spacer(),
                    // Sort Dropdown
                    Container(
                      height: 28,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _sortBy,
                          icon: const Icon(Icons.sort_rounded, size: 14),
                          style: AppTypography.caption,
                          isDense: true,
                          items: ['Alphabetical', 'Highest Stock', 'Lowest Stock']
                              .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) setState(() => _sortBy = v);
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: Stack(
                  children: [
                    ListView.builder(
                      controller: _scrollCtrl,
                      itemCount: filtered.length + 1,
                      itemBuilder: (_, i) {
                        if (i == 0) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                            child: _InventorySummaryCard(inventory: inventory, productsMap: productsMap),
                          );
                        }
                        final index = i - 1;
                        final inv = filtered[index];
                        final product = productsMap[inv.productId];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: _InventoryCard(
                            item: inv,
                            packSize: product?.packSize ?? 1,
                            packUnit: product?.packUnit ?? 'Unit',
                            contentUnit: product?.contentUnit ?? 'Unit',
                            hasPack: product?.productType.hasPack ?? false,
                            canDelete: user?.canDeleteRecords ?? false,
                            canCorrect: user?.canCorrectStock ?? false,
                            onTap: () => context.push(
                              '/inventory/detail/${inv.productId}',
                              extra: inv,
                            ),
                            onCorrect: () =>
                                context.push('/inventory/correct/${inv.productId}'),
                            onDelete: () => _confirmDelete(context, ref, inv),
                          ),
                        );
                      },
                    ),
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      child: AlphabetScrollbar(
                        scrollController: _scrollCtrl,
                        items: filtered.map((i) => i.productName).toList(),
                        estimatedItemHeight: 120,
                        topOffset: 120,
                      ),
                    ),
                  ],
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
        title: const Row(children: [
          Icon(Icons.delete_outline_rounded, color: AppColors.error, size: 20),
          SizedBox(width: 8),
          Text('Delete Record?'),
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

// --- Inventory Value Summary Card ---
class _InventorySummaryCard extends StatelessWidget {
  final List<InventoryModel> inventory;
  final Map<String, ProductModel> productsMap;
  const _InventorySummaryCard({required this.inventory, required this.productsMap});

  @override
  Widget build(BuildContext context) {
    if (inventory.isEmpty) return const SizedBox.shrink();
    double mrpValue = 0, costValue = 0;
    int skusWithStock = 0;
    for (final item in inventory) {
      if (item.totalStock > 0) skusWithStock++;
      final product = productsMap[item.productId];
      final packSize = product?.packSize ?? 1;
      final effectivePackSize = packSize > 0 ? packSize : 1;

      for (final batch in item.batches) {
        final perUnitMrp = batch.mrp / effectivePackSize;
        final perUnitCost = batch.purchaseRate / effectivePackSize;
        mrpValue += perUnitMrp * batch.quantity;
        costValue += perUnitCost * batch.quantity;
      }
    }
    final margin = mrpValue > 0 ? (mrpValue - costValue) / mrpValue * 100 : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        child: Row(children: [
          _SummaryPill('SKUs', '$skusWithStock / ${inventory.length}', AppColors.primary),
          const VerticalDivider(width: 20, thickness: 1),
          _SummaryPill('@ MRP', '\u20b9${_compact(mrpValue)}', AppColors.secondary),
          const VerticalDivider(width: 20, thickness: 1),
          _SummaryPill('@ Cost', '\u20b9${_compact(costValue)}', AppColors.textSecondary),
          const VerticalDivider(width: 20, thickness: 1),
          _SummaryPill('Margin', '${margin.toStringAsFixed(1)}%', AppColors.success),
        ]),
      ),
    );
  }

  String _compact(double v) {
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}k';
    return v.toStringAsFixed(0);
  }
}

class _SummaryPill extends StatelessWidget {
  final String label, value;
  final Color color;
  const _SummaryPill(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(children: [
        Text(value,
            style: AppTypography.numericSmall.copyWith(
                color: color, fontSize: 14, fontWeight: FontWeight.w800),
            textAlign: TextAlign.center),
        Text(label,
            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
            textAlign: TextAlign.center),
      ]),
    );
  }
}
