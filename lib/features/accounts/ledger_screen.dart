import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/ledger_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/ledger_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class LedgerScreen extends ConsumerStatefulWidget {
  const LedgerScreen({super.key});

  @override
  ConsumerState<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends ConsumerState<LedgerScreen> {
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
    final ledgerAsync = ref.watch(ledgerProvider);
    final user = ref.watch(authNotifierProvider).value;

    return ScreenShell(
      title: 'Accounts Ledger',
      subtitle: 'Credits & Debits',
      headerExtras: [
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: 'Search by party or description…',
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
            children: ['All', 'Credit', 'Debit', 'Settled'].map((filter) {
              final isSelected = _typeFilter == filter;
              Color filterColor = AppColors.primary;
              if (filter == 'Credit') filterColor = AppColors.success;
              if (filter == 'Debit') filterColor = AppColors.error;
              if (filter == 'Settled') filterColor = AppColors.textMuted;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(filter),
                  selected: isSelected,
                  onSelected: (_) => setState(() => _typeFilter = filter),
                  selectedColor: filterColor.withValues(alpha: 0.12),
                  checkmarkColor: filterColor,
                  labelStyle: AppTypography.label.copyWith(
                    color: isSelected ? filterColor : AppColors.textSecondary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: isSelected ? filterColor : AppColors.border,
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
      body: ledgerAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (entries) {
          if (entries.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.account_balance_wallet_outlined, size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No ledger entries yet', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Entries are created automatically from credit transactions', style: AppTypography.bodySmall, textAlign: TextAlign.center),
                ],
              ),
            );
          }

          final totalDebit = entries.where((e) => e.type == LedgerEntryType.debit && !e.isSettled).fold<double>(0, (s, e) => s + e.amount);
          final totalCredit = entries.where((e) => e.type == LedgerEntryType.credit && !e.isSettled).fold<double>(0, (s, e) => s + e.amount);

          // Apply search and type filter
          final q = _search.toLowerCase();
          final filtered = entries.where((e) {
            final matchesSearch = q.isEmpty ||
                e.partyName.toLowerCase().contains(q) ||
                e.description.toLowerCase().contains(q) ||
                (e.billNumber?.toLowerCase().contains(q) ?? false);
            final matchesType = _typeFilter == 'All' ||
                (_typeFilter == 'Credit' && e.type == LedgerEntryType.credit && !e.isSettled) ||
                (_typeFilter == 'Debit' && e.type == LedgerEntryType.debit && !e.isSettled) ||
                (_typeFilter == 'Settled' && e.isSettled);
            return matchesSearch && matchesType;
          }).toList();
          return Column(
            children: [
              const SizedBox(height: AppSpacing.lg),
                      // Summary row
                      Row(
                        children: [
                          Expanded(
                            child: AppCard(
                              backgroundColor: AppColors.errorContainer,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Total Payable (We Owe)', style: AppTypography.caption.copyWith(color: AppColors.error)),
                                  Text(AppFormatters.formatCurrency(totalDebit), style: AppTypography.numeric.copyWith(color: AppColors.error)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.lg),
                          Expanded(
                            child: AppCard(
                              backgroundColor: AppColors.successContainer,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Total Receivable (Owed to Us)', style: AppTypography.caption.copyWith(color: AppColors.success)),
                                  Text(AppFormatters.formatCurrency(totalCredit), style: AppTypography.numeric.copyWith(color: AppColors.success)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.lg),
                          Expanded(
                            child: AppCard(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Net Balance', style: AppTypography.caption),
                                  Text(
                                    AppFormatters.formatCurrency((totalCredit - totalDebit).abs()),
                                    style: AppTypography.numeric.copyWith(
                                      color: totalCredit >= totalDebit ? AppColors.success : AppColors.error,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      // Count bar
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Text('${filtered.length} entr${filtered.length == 1 ? 'y' : 'ies'}', style: AppTypography.caption),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Expanded(
                        child: filtered.isEmpty
                            ? Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.search_off_rounded, size: 36, color: AppColors.textMuted),
                                    const SizedBox(height: AppSpacing.md),
                                    Text('No entries match', style: AppTypography.bodySmall),
                                  ],
                                ),
                              )
                            : ListView.separated(
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                          itemBuilder: (_, i) {
                            final entry = filtered[i];
                            final isDebit = entry.type == LedgerEntryType.debit;
                            final canSettle = (user?.canModifyAccounts ?? false) && !entry.isSettled;
                            return AppCard(
                              borderColor: entry.isSettled
                                  ? AppColors.success.withValues(alpha: 0.3)
                                  : null,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        width: 40,
                                        height: 40,
                                        decoration: BoxDecoration(
                                          color: entry.isSettled
                                              ? AppColors.successContainer
                                              : isDebit
                                                  ? AppColors.errorContainer
                                                  : AppColors.successContainer,
                                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                        ),
                                        child: Icon(
                                          entry.isSettled
                                              ? Icons.check_circle_rounded
                                              : isDebit
                                                  ? Icons.arrow_upward_rounded
                                                  : Icons.arrow_downward_rounded,
                                          color: entry.isSettled
                                              ? AppColors.success
                                              : isDebit
                                                  ? AppColors.error
                                                  : AppColors.success,
                                          size: 18,
                                        ),
                                      ),
                                      const SizedBox(width: AppSpacing.md),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(entry.partyName, style: AppTypography.labelLarge),
                                            Text(entry.description, style: AppTypography.bodySmall),
                                            Text(AppFormatters.formatDate(entry.date), style: AppTypography.caption),
                                            if (entry.isSettled && entry.settledAt != null)
                                              Text(
                                                'Settled on ${AppFormatters.formatDate(entry.settledAt!)}',
                                                style: AppTypography.caption.copyWith(color: AppColors.success),
                                              ),
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            AppFormatters.formatCurrency(entry.amount),
                                            style: AppTypography.numericSmall.copyWith(
                                              color: isDebit ? AppColors.error : AppColors.success,
                                            ),
                                          ),
                                          StatusChip(
                                            label: entry.isSettled
                                                ? 'Settled'
                                                : isDebit
                                                    ? 'Debit'
                                                    : 'Credit',
                                            type: entry.isSettled
                                                ? StatusType.success
                                                : isDebit
                                                    ? StatusType.error
                                                    : StatusType.info,
                                            small: true,
                                          ),
                                        ],
                                      ),

                                    ],
                                  ),
                                  // Quick settle button for unsettled entries
                                  if (canSettle) ...[
                                    const SizedBox(height: 10),
                                    SizedBox(
                                      width: double.infinity,
                                      child: OutlinedButton.icon(
                                        onPressed: () => _confirmSettle(context, ref, entry),
                                        icon: Icon(
                                          isDebit ? Icons.payments_rounded : Icons.account_balance_wallet_rounded,
                                          size: 16,
                                          color: AppColors.success,
                                        ),
                                        label: Text(
                                          isDebit
                                              ? 'Mark as Paid (Credit → Cash)'
                                              : 'Mark Collected',
                                          style: AppTypography.label.copyWith(color: AppColors.success),
                                        ),
                                        style: OutlinedButton.styleFrom(
                                          side: BorderSide(color: AppColors.success.withValues(alpha: 0.5)),
                                          padding: const EdgeInsets.symmetric(vertical: 8),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
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

  void _confirmSettle(BuildContext context, WidgetRef ref, LedgerModel entry) {
    final isDebit = entry.type == LedgerEntryType.debit;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isDebit ? 'Mark Bill as Paid?' : 'Mark as Collected?'),
        content: Text(
          isDebit
              ? 'Mark ₹${entry.amount.toStringAsFixed(2)} owed to ${entry.partyName} as PAID?\n\nThis confirms you have paid this bill in cash/bank.'
              : 'Mark ₹${entry.amount.toStringAsFixed(2)} from ${entry.partyName} as COLLECTED?\n\nThis confirms you received this payment.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              final err = await ref
                  .read(ledgerNotifierProvider.notifier)
                  .markAsSettled(entry.id!, billId: entry.billId, entryType: entry.type);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(err == null
                        ? 'Marked as ${isDebit ? 'Paid' : 'Collected'} ✓'
                        : 'Error: $err'),
                    backgroundColor:
                        err == null ? AppColors.success : AppColors.error,
                  ),
                );
              }
            },
            icon: const Icon(Icons.check_rounded, size: 16),
            label: Text(isDebit ? 'Confirm Payment' : 'Confirm Collection'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.success,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
