import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/product_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../shared/models/product_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key});

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  ProductType? _typeFilter;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productCatalogProvider);
    final inventoryAsync = ref.watch(inventoryProvider);

    // Build inventory map for stock display
    final inventoryMap = <String, double>{};
    inventoryAsync.valueOrNull?.forEach((inv) {
      inventoryMap[inv.productId] = inv.totalStock;
    });

    return ScreenShell(
      title: 'Products',
      subtitle: 'Product catalog & master',
      action: AppButton(
        label: 'Add Product',
        icon: Icons.add_rounded,
        onPressed: () => context.push('/products/add'),
      ),
      fab: FloatingActionButton.extended(
        onPressed: () => context.push('/products/add'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Product',
            style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600)),
        elevation: 2,
      ),
      headerExtras: [
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: 'Search by name, generic, company…',
            hintStyle: AppTypography.bodySmall,
            prefixIcon: const Icon(Icons.search_rounded, size: 18, color: AppColors.textMuted),
            suffixIcon: _search.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded, size: 16, color: AppColors.textMuted),
                    onPressed: () {
                      _searchCtrl.clear();
                      setState(() => _search = '');
                    })
                : null,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: const Text('All'),
                  selected: _typeFilter == null,
                  onSelected: (_) => setState(() => _typeFilter = null),
                  selectedColor: AppColors.primaryContainer,
                  checkmarkColor: AppColors.primary,
                  labelStyle: AppTypography.label.copyWith(
                    color: _typeFilter == null ? AppColors.primary : AppColors.textSecondary,
                    fontWeight: _typeFilter == null ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(color: _typeFilter == null ? AppColors.primary : AppColors.border),
                  backgroundColor: AppColors.surface,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              ...ProductType.values.map((type) {
                final isSelected = _typeFilter == type;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(type.displayName),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _typeFilter = isSelected ? null : type),
                    selectedColor: AppColors.primaryContainer,
                    checkmarkColor: AppColors.primary,
                    labelStyle: AppTypography.label.copyWith(
                      color: isSelected ? AppColors.primary : AppColors.textSecondary,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                    side: BorderSide(color: isSelected ? AppColors.primary : AppColors.border),
                    backgroundColor: AppColors.surface,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                );
              }),
            ],
          ),
        ),
      ],
      body: productsAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (products) {
          if (products.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.medication_outlined,
                        size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No products yet', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Add products to your catalog first',
                      style: AppTypography.bodySmall, textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.xxl),
                  AppButton(
                    label: 'Add First Product',
                    icon: Icons.add_rounded,
                    onPressed: () => context.push('/products/add'),
                  ),
                ],
              ),
            );
          }

          final q = _search.toLowerCase();
          final filtered = products.where((p) {
            final matchesSearch = q.isEmpty ||
                p.name.toLowerCase().contains(q) ||
                (p.genericName?.toLowerCase().contains(q) ?? false) ||
                p.companyName.toLowerCase().contains(q) ||
                p.hsnCode.contains(q);
            final matchesType = _typeFilter == null || p.productType == _typeFilter;
            return matchesSearch && matchesType;
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
                  Text('Try a different search or filter',
                      style: AppTypography.bodySmall),
                ],
              ),
            );
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Text('${filtered.length} products', style: AppTypography.caption),
                    const Spacer(),
                    Text(
                      '${products.where((p) => p.requiresColdStorage).length} cold chain',
                      style: AppTypography.caption.copyWith(color: const Color(0xFF0EA5E9)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (_, i) {
                    final product = filtered[i];
                    final stock = inventoryMap[product.id] ?? 0;
                    return _ProductCard(
                      product: product,
                      stock: stock,
                      onTap: () => context.push('/products/edit/${product.id}'),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Product Card ──────────────────────────────────────────────────────────────
class _ProductCard extends StatelessWidget {
  final ProductModel product;
  final double stock;
  final VoidCallback onTap;

  const _ProductCard({
    required this.product,
    required this.stock,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isLow = stock > 0 && stock <= product.lowStockThreshold;
    final isOut = stock <= 0;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        children: [
          // Type icon avatar
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: product.requiresColdStorage
                  ? const Color(0xFF0EA5E9).withValues(alpha: 0.1)
                  : AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              _typeIcon(product.productType),
              size: 22,
              color: product.requiresColdStorage
                  ? const Color(0xFF0EA5E9)
                  : AppColors.primary,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(product.name,
                          style: AppTypography.labelLarge,
                          overflow: TextOverflow.ellipsis),
                    ),
                    const SizedBox(width: 8),
                    StatusChip(
                      label: product.productType.displayName,
                      type: StatusType.info,
                      small: true,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  product.companyName,
                  style: AppTypography.bodySmall,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (product.productType.hasPack) ...[
                      Text(
                        '${product.packSize} ${product.contentUnit}s/${product.packUnit}',
                        style: AppTypography.caption,
                      ),
                      const Text(' · ', style: TextStyle(color: AppColors.textMuted)),
                    ],
                    Text(
                      'GST ${product.gstPercent.toInt()}%',
                      style: AppTypography.caption,
                    ),
                    if (product.requiresColdStorage) ...[
                      const SizedBox(width: 6),
                      const Icon(Icons.ac_unit_rounded,
                          size: 12, color: Color(0xFF0EA5E9)),
                    ],
                    if (product.division.isRestricted) ...[
                      const SizedBox(width: 6),
                      const Icon(Icons.warning_amber_rounded,
                          size: 12, color: AppColors.warning),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${stock.toStringAsFixed(stock.truncateToDouble() == stock ? 0 : 1)} ${product.contentUnit}s',
                style: AppTypography.numericSmall.copyWith(
                  color: isOut ? AppColors.error : isLow ? AppColors.warning : AppColors.textPrimary,
                ),
              ),
              if (isOut)
                StatusChip(label: 'Out of Stock', type: StatusType.error, small: true)
              else if (isLow)
                StatusChip(label: 'Low Stock', type: StatusType.warning, small: true)
              else
                StatusChip(label: 'In Stock', type: StatusType.success, small: true),
            ],
          ),
        ],
      ),
    );
  }

  IconData _typeIcon(ProductType type) {
    switch (type) {
      case ProductType.tablet:    return Icons.medication_rounded;
      case ProductType.capsule:   return Icons.medication_liquid_rounded;
      case ProductType.syrup:     return Icons.local_drink_rounded;
      case ProductType.injection: return Icons.vaccines_rounded;
      case ProductType.cream:     return Icons.soap_rounded;
      case ProductType.drops:     return Icons.opacity_rounded;
      case ProductType.ointment:  return Icons.sanitizer_rounded;
      case ProductType.powder:    return Icons.grain_rounded;
      case ProductType.others:    return Icons.category_rounded;
    }
  }
}
