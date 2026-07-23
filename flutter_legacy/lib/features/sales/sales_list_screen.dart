import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class SalesListScreen extends ConsumerStatefulWidget {
  const SalesListScreen({super.key});

  @override
  ConsumerState<SalesListScreen> createState() => _SalesListScreenState();
}

class _SalesListScreenState extends ConsumerState<SalesListScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _paymentFilter = 'All';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final salesAsync = ref.watch(salesBillsProvider);
    final user = ref.watch(authNotifierProvider).value;

    return ScreenShell(
      title: 'Sales Bills',
      subtitle: 'All sales records',
      action: AppButton(
        label: 'New Sale',
        icon: Icons.add_rounded,
        onPressed: () => context.push('/sales/new'),
      ),
      fab: FloatingActionButton.extended(
        onPressed: () => context.push('/sales/new'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Sale',
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
            hintText: 'Search by customer, invoice, or doctor…',
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
        // Filter chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: ['All', 'Cash', 'Credit', 'UPI', 'Card'].map((filter) {
              final isSelected = _paymentFilter == filter;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  child: FilterChip(
                    label: Text(filter),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _paymentFilter = filter),
                    selectedColor: AppColors.primaryContainer,
                    checkmarkColor: AppColors.primary,
                    labelStyle: AppTypography.label.copyWith(
                      color: isSelected ? AppColors.primary : AppColors.textSecondary,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                    side: BorderSide(
                      color: isSelected ? AppColors.primary : AppColors.border,
                    ),
                    backgroundColor: AppColors.surface,
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
      body: salesAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (bills) {
          // Apply search and payment filter
          var filtered = bills.where((b) {
            final q = _search.toLowerCase();
            final matchesSearch = q.isEmpty ||
                b.customerName.toLowerCase().contains(q) ||
                b.invoiceNumber.toLowerCase().contains(q) ||
                (b.doctorName?.toLowerCase().contains(q) ?? false) ||
                (b.customerPhone?.contains(q) ?? false) ||
                b.items.any((item) => item.productName.toLowerCase().contains(q));
            final matchesPayment = _paymentFilter == 'All' ||
                b.paymentMethod.displayName == _paymentFilter;
            return matchesSearch && matchesPayment;
          }).toList();

          if (bills.isEmpty) {
            return _EmptyState(
              icon: Icons.receipt_outlined,
              title: 'No sales yet',
              subtitle: 'Start by creating your first sale',
              actionLabel: 'Create Sale',
              onAction: () => context.push('/sales/new'),
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
              // Result count bar
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
                          color: AppColors.primary, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (_, i) => _SalesBillCard(
                    bill: filtered[i],
                    canDelete: user?.canDeleteRecords ?? false,
                    onEdit: () => context.push('/sales/edit/${filtered[i].id}'),
                    onView: () => context.push('/sales/detail/${filtered[i].id}', extra: filtered[i]),
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

  void _confirmDelete(BuildContext context, WidgetRef ref, SalesBillModel bill) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Sales Bill?'),
        content: Text('Delete bill ${bill.invoiceNumber}? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref.read(salesNotifierProvider.notifier).deleteSale(bill.id!);
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

// ─── Sales Bill Card ──────────────────────────────────────────────────────────
class _SalesBillCard extends StatelessWidget {
  final SalesBillModel bill;
  final bool canDelete;
  final VoidCallback onEdit, onView, onDelete;

  const _SalesBillCard({
    required this.bill,
    required this.canDelete,
    required this.onEdit,
    required this.onView,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final initials = bill.customerName.isNotEmpty
        ? bill.customerName[0].toUpperCase()
        : '?';

    return AppCard(
      onTap: onView,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      borderColor: bill.hasOutstandingCredit
          ? AppColors.warning.withValues(alpha: 0.3)
          : null,
      child: Row(
        children: [
          // Avatar
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: bill.hasOutstandingCredit
                  ? AppColors.warningContainer
                  : AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                initials,
                style: AppTypography.h3.copyWith(
                  color: bill.hasOutstandingCredit
                      ? AppColors.warning
                      : AppColors.primary,
                  fontSize: 16,
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(bill.customerName, style: AppTypography.labelLarge),
                const SizedBox(height: 2),
                Text(
                  '${bill.invoiceNumber} • ${AppFormatters.formatDateTime(bill.saleDate)}',
                  style: AppTypography.caption,
                ),
                if (bill.doctorName != null)
                  Text('Dr: ${bill.doctorName}', style: AppTypography.caption),
              ],
            ),
          ),

          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                AppFormatters.formatCurrency(bill.grandTotal),
                style: AppTypography.numericSmall.copyWith(
                    color: AppColors.textPrimary, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 3),
              StatusChip(
                label: bill.paymentMethod.displayName,
                type: bill.hasOutstandingCredit
                    ? StatusType.warning
                    : StatusType.success,
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
                    Text('View Invoice')
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

// ─── Shared Empty State ───────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, subtitle, actionLabel;
  final VoidCallback onAction;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              color: AppColors.surface2,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 36, color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(title, style: AppTypography.h3),
          const SizedBox(height: AppSpacing.sm),
          Text(subtitle,
              style: AppTypography.bodySmall, textAlign: TextAlign.center),
          const SizedBox(height: AppSpacing.xxl),
          AppButton(
              label: actionLabel,
              icon: Icons.add_rounded,
              onPressed: onAction),
        ],
      ),
    );
  }
}
