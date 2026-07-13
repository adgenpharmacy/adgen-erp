import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/screen_shell.dart';

// ─── Month filter model ───────────────────────────────────────────────────────
class _MonthFilter {
  final String label;
  final DateTime? from;
  final DateTime? to;
  const _MonthFilter(this.label, this.from, this.to);

  static _MonthFilter get allTime => const _MonthFilter('All Time', null, null);
  static _MonthFilter get thisMonth {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, 1);
    final end = DateTime(now.year, now.month + 1, 1)
        .subtract(const Duration(seconds: 1));
    return _MonthFilter('This Month', start, end);
  }

  static List<_MonthFilter> yearMonths(int year) {
    return List.generate(12, (i) {
      final start = DateTime(year, i + 1, 1);
      final end = DateTime(year, i + 2, 1).subtract(const Duration(seconds: 1));
      return _MonthFilter(DateFormat('MMM').format(start), start, end);
    });
  }

  bool matches(DateTime date) {
    if (from == null) return true;
    return date.isAfter(from!.subtract(const Duration(seconds: 1))) &&
        date.isBefore(to!.add(const Duration(seconds: 1)));
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  _MonthFilter _filter = _MonthFilter.thisMonth;
  final int _year = DateTime.now().year;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authNotifierProvider).value;
    final width = MediaQuery.of(context).size.width;
    final isMobile = width < 600;

    if (!(user?.canViewFullReports ?? false)) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_rounded, color: AppColors.error, size: 48),
              const SizedBox(height: AppSpacing.lg),
              Text('Owner Access Required', style: AppTypography.h2),
              Text('Full reports are restricted to the owner',
                  style: AppTypography.bodySmall),
            ],
          ),
        ),
      );
    }

    return ScreenShell(
      title: 'Reports',
      subtitle: 'Sales & Purchase analytics',
      body: Column(
        children: [
          // ── Tab bar ──────────────────────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(
                  bottom: BorderSide(color: AppColors.border, width: 1)),
            ),
            child: TabBar(
              controller: _tabController,
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.textMuted,
              indicatorColor: AppColors.primary,
              indicatorWeight: 2.5,
              labelStyle: AppTypography.label
                  .copyWith(fontWeight: FontWeight.w700, fontSize: 13),
              tabs: const [
                Tab(text: 'Sales'),
                Tab(text: 'Purchase'),
              ],
            ),
          ),

          // ── Month filter row ──────────────────────────────────────────────
          _MonthFilterRow(
            selected: _filter,
            year: _year,
            onSelect: (f) => setState(() => _filter = f),
          ),

          // ── Tab views ─────────────────────────────────────────────────────
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _SalesTab(filter: _filter, isMobile: isMobile),
                _PurchaseTab(filter: _filter, isMobile: isMobile),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Month Filter Row ─────────────────────────────────────────────────────────
class _MonthFilterRow extends StatelessWidget {
  final _MonthFilter selected;
  final int year;
  final ValueChanged<_MonthFilter> onSelect;

  const _MonthFilterRow({
    required this.selected,
    required this.year,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final months = <_MonthFilter>[
      _MonthFilter.allTime,
      _MonthFilter.thisMonth,
      ..._MonthFilter.yearMonths(year),
    ];

    return Container(
      height: 42,
      color: AppColors.background,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: months.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final m = months[i];
          final isSelected = m.label == selected.label;
          return GestureDetector(
            onTap: () => onSelect(m),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primary
                    : AppColors.surface,
                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                border: Border.all(
                  color: isSelected ? AppColors.primary : AppColors.border,
                ),
              ),
              child: Text(
                m.label,
                style: AppTypography.label.copyWith(
                  color: isSelected ? Colors.white : AppColors.textSecondary,
                  fontWeight:
                      isSelected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 11,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Sales Tab ───────────────────────────────────────────────────────────────
class _SalesTab extends ConsumerWidget {
  final _MonthFilter filter;
  final bool isMobile;
  const _SalesTab({required this.filter, required this.isMobile});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(salesBillsProvider);

    return salesAsync.when(
      loading: () => const Center(
          child: CircularProgressIndicator(
              color: AppColors.primary, strokeWidth: 2)),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (allBills) {
        final bills =
            allBills.where((b) => filter.matches(b.saleDate)).toList();

        // Compute metrics
        final netSales =
            bills.fold<double>(0, (s, b) => s + b.grandTotal);
        final salesMrp = bills.fold<double>(
            0,
            (s, b) =>
                s +
                b.items.fold<double>(
                    0, (si, i) => si + i.mrp * i.quantity));
        final totalGst =
            bills.fold<double>(0, (s, b) => s + b.totalGst);
        final discount = salesMrp - netSales;
        final discountPct =
            salesMrp > 0 ? (discount / salesMrp * 100) : 0.0;

        // Top products by qty
        final productMap = <String, double>{};
        for (final bill in bills) {
          for (final item in bill.items) {
            productMap[item.productName] =
                (productMap[item.productName] ?? 0) + item.quantity;
          }
        }
        final topProducts = productMap.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));

        final cards = [
          _StatCard(
            title: 'Sales MRP',
            value: AppFormatters.formatCurrency(salesMrp),
            sub: '${bills.length} bills',
            color: AppColors.primary,
            icon: Icons.sell_rounded,
          ),
          _StatCard(
            title: 'Net Sales',
            value: AppFormatters.formatCurrency(netSales),
            sub: 'Billed amount',
            color: AppColors.secondary,
            icon: Icons.trending_up_rounded,
          ),
          _StatCard(
            title: 'GST Collected',
            value: AppFormatters.formatCurrency(totalGst),
            sub: 'Tax component',
            color: AppColors.warning,
            icon: Icons.receipt_rounded,
          ),
          _StatCard(
            title: 'Discount Given',
            value: AppFormatters.formatCurrency(discount.clamp(0, double.infinity)),
            sub: '${discountPct.toStringAsFixed(1)}% off MRP',
            color: AppColors.error,
            icon: Icons.local_offer_rounded,
          ),
        ];

        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Stat grid – 2×2 on mobile, 1×4 on desktop
              if (isMobile)
                GridView.count(
                  crossAxisCount: 2,
                  crossAxisSpacing: AppSpacing.md,
                  mainAxisSpacing: AppSpacing.md,
                  childAspectRatio: 1.3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: cards,
                )
              else
                Row(
                  children: cards
                      .expand((c) => [
                            Expanded(child: c),
                            const SizedBox(width: AppSpacing.md),
                          ])
                      .toList()
                    ..removeLast(),
                ),

              const SizedBox(height: AppSpacing.xxl),

              // Top Products
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.bar_chart_rounded,
                            color: AppColors.primary, size: 18),
                        const SizedBox(width: 8),
                        Text('Top Products by Quantity',
                            style: AppTypography.h3),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    if (topProducts.isEmpty)
                      Center(
                          child: Text('No data for this period',
                              style: AppTypography.bodySmall))
                    else
                      ...topProducts.take(10).map((entry) => Padding(
                            padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.sm),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: Text(entry.key,
                                      style: AppTypography.body,
                                      overflow: TextOverflow.ellipsis),
                                ),
                                Expanded(
                                  flex: 5,
                                  child: LinearProgressIndicator(
                                    value: topProducts.isNotEmpty
                                        ? entry.value /
                                            topProducts.first.value
                                        : 0,
                                    backgroundColor: AppColors.surface2,
                                    valueColor:
                                        const AlwaysStoppedAnimation(
                                            AppColors.primary),
                                    minHeight: 6,
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.md),
                                Text(
                                  AppFormatters.formatQuantity(entry.value),
                                  style: AppTypography.numericSmall
                                      .copyWith(color: AppColors.primary),
                                ),
                              ],
                            ),
                          )),
                  ],
                ),
              ),

              const SizedBox(height: AppSpacing.xxl),

              // Month-wise breakdown table
              if (filter.from == null) _MonthBreakdownTable(bills: allBills),
            ],
          ),
        );
      },
    );
  }
}

// ─── Purchase Tab ─────────────────────────────────────────────────────────────
class _PurchaseTab extends ConsumerWidget {
  final _MonthFilter filter;
  final bool isMobile;
  const _PurchaseTab({required this.filter, required this.isMobile});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final purchasesAsync = ref.watch(purchaseBillsProvider);

    return purchasesAsync.when(
      loading: () => const Center(
          child: CircularProgressIndicator(
              color: AppColors.primary, strokeWidth: 2)),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (allBills) {
        final bills =
            allBills.where((b) => filter.matches(b.invoiceDate)).toList();

        final totalPurchased =
            bills.fold<double>(0, (s, b) => s + b.grandTotal);
        final cashPurchased = bills
            .where((b) => b.ledgerType == LedgerType.cash)
            .fold<double>(0, (s, b) => s + b.grandTotal);
        final creditPurchased = bills
            .where((b) =>
                b.ledgerType == LedgerType.credit && !b.isPaid)
            .fold<double>(0, (s, b) => s + b.grandTotal);
        final paidCredit = bills
            .where((b) =>
                b.ledgerType == LedgerType.credit && b.isPaid)
            .fold<double>(0, (s, b) => s + b.grandTotal);

        // Top vendors
        final vendorMap = <String, double>{};
        for (final b in bills) {
          vendorMap[b.partyName] =
              (vendorMap[b.partyName] ?? 0) + b.grandTotal;
        }
        final topVendors = vendorMap.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));

        final cards = [
          _StatCard(
            title: 'Total Purchased',
            value: AppFormatters.formatCurrency(totalPurchased),
            sub: '${bills.length} bills',
            color: AppColors.primary,
            icon: Icons.shopping_cart_rounded,
          ),
          _StatCard(
            title: 'Cash / Bank',
            value: AppFormatters.formatCurrency(cashPurchased),
            sub: 'Paid immediately',
            color: AppColors.success,
            icon: Icons.payments_rounded,
          ),
          _StatCard(
            title: 'Credit Outstanding',
            value: AppFormatters.formatCurrency(creditPurchased),
            sub: 'Unpaid to vendors',
            color: AppColors.error,
            icon: Icons.pending_actions_rounded,
          ),
          _StatCard(
            title: 'Credit Settled',
            value: AppFormatters.formatCurrency(paidCredit),
            sub: 'Cleared credit bills',
            color: AppColors.secondary,
            icon: Icons.check_circle_rounded,
          ),
        ];

        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isMobile)
                GridView.count(
                  crossAxisCount: 2,
                  crossAxisSpacing: AppSpacing.md,
                  mainAxisSpacing: AppSpacing.md,
                  childAspectRatio: 1.3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: cards,
                )
              else
                Row(
                  children: cards
                      .expand((c) => [
                            Expanded(child: c),
                            const SizedBox(width: AppSpacing.md),
                          ])
                      .toList()
                    ..removeLast(),
                ),

              const SizedBox(height: AppSpacing.xxl),

              // Top vendors
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.business_rounded,
                            color: AppColors.secondary, size: 18),
                        const SizedBox(width: 8),
                        Text('Top Vendors by Amount', style: AppTypography.h3),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    if (topVendors.isEmpty)
                      Center(
                          child: Text('No data for this period',
                              style: AppTypography.bodySmall))
                    else
                      ...topVendors.take(10).map((entry) => Padding(
                            padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.sm),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: Text(entry.key,
                                      style: AppTypography.body,
                                      overflow: TextOverflow.ellipsis),
                                ),
                                Expanded(
                                  flex: 5,
                                  child: LinearProgressIndicator(
                                    value: topVendors.isNotEmpty
                                        ? entry.value /
                                            topVendors.first.value
                                        : 0,
                                    backgroundColor: AppColors.surface2,
                                    valueColor:
                                        const AlwaysStoppedAnimation(
                                            AppColors.secondary),
                                    minHeight: 6,
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                                const SizedBox(width: AppSpacing.md),
                                Text(
                                  AppFormatters.formatCurrency(entry.value),
                                  style: AppTypography.numericSmall.copyWith(
                                      color: AppColors.secondary),
                                ),
                              ],
                            ),
                          )),
                  ],
                ),
              ),

              const SizedBox(height: AppSpacing.xxl),
              if (filter.from == null)
                _PurchaseMonthBreakdown(bills: allBills),
            ],
          ),
        );
      },
    );
  }
}

// ─── Month Breakdown Tables ───────────────────────────────────────────────────
class _MonthBreakdownTable extends StatelessWidget {
  final List<SalesBillModel> bills;
  const _MonthBreakdownTable({required this.bills});

  @override
  Widget build(BuildContext context) {
    // Group by year-month
    final months = <String, List<SalesBillModel>>{};
    for (final b in bills) {
      final key = DateFormat('MMM yyyy').format(b.saleDate);
      (months[key] ??= []).add(b);
    }

    if (months.isEmpty) return const SizedBox();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Month-wise Sales', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.md),
          // Header
          Padding(
            padding:
                const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                    flex: 2,
                    child: Text('Month',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Bills',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    flex: 2,
                    child: Text('Amount',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          ...months.entries.map((e) {
            final total = e.value
                .fold<double>(0, (s, b) => s + b.grandTotal);
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                      flex: 2,
                      child: Text(e.key, style: AppTypography.body)),
                  Expanded(
                      child: Text('${e.value.length}',
                          textAlign: TextAlign.center,
                          style: AppTypography.body)),
                  Expanded(
                      flex: 2,
                      child: Text(
                          AppFormatters.formatCurrency(total),
                          textAlign: TextAlign.end,
                          style: AppTypography.numericSmall
                              .copyWith(color: AppColors.primary))),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _PurchaseMonthBreakdown extends StatelessWidget {
  final List<PurchaseBillModel> bills;
  const _PurchaseMonthBreakdown({required this.bills});

  @override
  Widget build(BuildContext context) {
    final months = <String, List<PurchaseBillModel>>{};
    for (final b in bills) {
      final key = DateFormat('MMM yyyy').format(b.invoiceDate);
      (months[key] ??= []).add(b);
    }
    if (months.isEmpty) return const SizedBox();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Month-wise Purchases', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.md),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                    flex: 2,
                    child: Text('Month',
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    child: Text('Bills',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
                Expanded(
                    flex: 2,
                    child: Text('Amount',
                        textAlign: TextAlign.end,
                        style: AppTypography.caption
                            .copyWith(fontWeight: FontWeight.w700))),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          ...months.entries.map((e) {
            final total =
                e.value.fold<double>(0, (s, b) => s + b.grandTotal);
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                      flex: 2,
                      child: Text(e.key, style: AppTypography.body)),
                  Expanded(
                      child: Text('${e.value.length}',
                          textAlign: TextAlign.center,
                          style: AppTypography.body)),
                  Expanded(
                      flex: 2,
                      child: Text(
                          AppFormatters.formatCurrency(total),
                          textAlign: TextAlign.end,
                          style: AppTypography.numericSmall.copyWith(
                              color: AppColors.secondary))),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final String sub;
  final Color color;
  final IconData icon;

  const _StatCard({
    required this.title,
    required this.value,
    required this.sub,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(height: AppSpacing.md),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: AppTypography.numericLarge.copyWith(color: color)),
          ),
          const SizedBox(height: 2),
          Text(title,
              style: AppTypography.bodySmall,
              overflow: TextOverflow.ellipsis),
          Text(sub,
              style: AppTypography.caption,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
