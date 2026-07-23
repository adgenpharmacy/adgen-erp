import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class PurchaseListScreen extends ConsumerStatefulWidget {
  const PurchaseListScreen({super.key});

  @override
  ConsumerState<PurchaseListScreen> createState() => _PurchaseListScreenState();
}

class _PurchaseListScreenState extends ConsumerState<PurchaseListScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _typeFilter = 'All';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final purchasesAsync = ref.watch(purchaseBillsProvider);
    final user = ref.watch(authNotifierProvider).value;

    return ScreenShell(
      title: 'Purchase Bills',
      subtitle: 'All purchase records',
      action: AppButton(
        label: 'New Purchase',
        icon: Icons.add_rounded,
        onPressed: () => context.push('/purchase/new'),
      ),
      fab: FloatingActionButton.extended(
        onPressed: () => context.push('/purchase/new'),
        backgroundColor: AppColors.secondary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Purchase',
            style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600)),
        elevation: 2,
      ),
      headerExtras: [
        // Search bar
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: 'Search by party, invoice, or item…',
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
        // Filter chips for payment type
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: ['All', 'Cash', 'Credit'].map((filter) {
              final isSelected = _typeFilter == filter;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(filter),
                  selected: isSelected,
                  onSelected: (_) => setState(() => _typeFilter = filter),
                  selectedColor: AppColors.secondaryContainer,
                  checkmarkColor: AppColors.secondary,
                  labelStyle: AppTypography.label.copyWith(
                    color: isSelected ? AppColors.secondary : AppColors.textSecondary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: isSelected ? AppColors.secondary : AppColors.border,
                  ),
                  backgroundColor: AppColors.surface,
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              );
            }).toList(),
          ),
        ),
      ],
      body: purchasesAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (bills) {
          var filtered = bills.where((b) {
            final q = _search.toLowerCase();
            final matchesSearch = q.isEmpty ||
                b.partyName.toLowerCase().contains(q) ||
                b.invoiceNumber.toLowerCase().contains(q) ||
                b.items.any((i) => i.productName.toLowerCase().contains(q));
            final matchesType = _typeFilter == 'All' ||
                (_typeFilter == 'Cash' && b.ledgerType == LedgerType.cash) ||
                (_typeFilter == 'Credit' && b.ledgerType == LedgerType.credit);
            return matchesSearch && matchesType;
          }).toList();

          if (bills.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.shopping_cart_outlined,
                        size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No purchases yet', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Add your first purchase bill',
                      style: AppTypography.bodySmall),
                  const SizedBox(height: AppSpacing.xxl),
                  AppButton(
                    label: 'Add Purchase',
                    icon: Icons.add_rounded,
                    onPressed: () => context.push('/purchase/new'),
                  ),
                ],
              ),
            );
          }

          if (filtered.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.search_off_rounded, size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No results found', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Try a different search or filter', style: AppTypography.bodySmall),
                ],
              ),
            );
          }

          return Column(
            children: [
              // Summary bar
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Text(
                      '${filtered.length} bill${filtered.length == 1 ? '' : 's'}',
                      style: AppTypography.caption,
                    ),
                    const Spacer(),
                    Text(
                      'Total: ${AppFormatters.formatCurrency(filtered.fold(0.0, (s, b) => s + b.grandTotal))}',
                      style: AppTypography.caption.copyWith(
                          color: AppColors.secondary, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (_, i) => _PurchaseBillCard(
                    bill: filtered[i],
                    canDelete: user?.canDeleteRecords ?? false,
                    onView: () => context.push('/purchase/detail/${filtered[i].id}', extra: filtered[i]),
                    onEdit: () => context.push('/purchase/edit/${filtered[i].id}'),
                    onDelete: () => _confirmDelete(context, ref, filtered[i]),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, PurchaseBillModel bill) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Purchase Bill?'),
        content: Text('Delete bill ${bill.invoiceNumber}? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref
                  .read(purchaseNotifierProvider.notifier)
                  .deletePurchase(bill.id!);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('Bill deleted'),
                      backgroundColor: AppColors.success),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _PurchaseBillCard extends StatelessWidget {
  final PurchaseBillModel bill;
  final bool canDelete;
  final VoidCallback onView, onEdit, onDelete;

  const _PurchaseBillCard({
    required this.bill,
    required this.canDelete,
    required this.onView,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    // Party initials
    final initials = bill.partyName.isNotEmpty
        ? bill.partyName[0].toUpperCase()
        : '?';

    return AppCard(
      onTap: onView,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.secondaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(initials,
                  style: AppTypography.h3.copyWith(
                    color: AppColors.secondary,
                    fontSize: 16,
                  )),
            ),
          ),
          const SizedBox(width: AppSpacing.md),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bill.partyName, style: AppTypography.labelLarge),
                const SizedBox(height: 2),
                Text(
                  'Inv: ${bill.invoiceNumber} • ${AppFormatters.formatDate(bill.invoiceDate)}',
                  style: AppTypography.caption,
                ),
                Text(
                  '${bill.items.length} items • ${bill.createdByName}',
                  style: AppTypography.caption,
                ),
              ],
            ),
          ),

          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                AppFormatters.formatCurrency(bill.grandTotal),
                style: AppTypography.numericSmall.copyWith(
                    fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 3),
              StatusChip(
                label: bill.ledgerType.name.toUpperCase(),
                type: bill.ledgerType == LedgerType.cash
                    ? StatusType.success
                    : StatusType.warning,
                small: true,
              ),
            ],
          ),
          const SizedBox(width: AppSpacing.sm),

          PopupMenuButton<String>(
            onSelected: (action) {
              if (action == 'view') onView();
              if (action == 'edit') onEdit();
              if (action == 'delete') onDelete();
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                  value: 'view',
                  child: Row(children: [
                    Icon(Icons.visibility_rounded, size: 16),
                    SizedBox(width: 8),
                    Text('View Details')
                  ])),
              const PopupMenuItem(
                  value: 'edit',
                  child: Row(children: [
                    Icon(Icons.edit_rounded, size: 16),
                    SizedBox(width: 8),
                    Text('Edit')
                  ])),
              if (canDelete)
                const PopupMenuItem(
                    value: 'delete',
                    child: Row(children: [
                      Icon(Icons.delete_outline_rounded,
                          size: 16, color: AppColors.error),
                      SizedBox(width: 8),
                      Text('Delete',
                          style: TextStyle(color: AppColors.error))
                    ])),
            ],
            icon: const Icon(Icons.more_vert_rounded,
                color: AppColors.textMuted, size: 20),
          ),
        ],
      ),
    );
  }
}
