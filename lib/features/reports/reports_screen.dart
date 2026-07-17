import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/sale_return_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/screen_shell.dart';

// ─── Date Range Filter ────────────────────────────────────────────────────────
class _DateRange {
  final String label;
  final DateTime? from;
  final DateTime? to;

  const _DateRange(this.label, this.from, this.to);

  static _DateRange get allTime => const _DateRange('All Time', null, null);

  static _DateRange get today {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    final end = start.add(const Duration(days: 1)).subtract(const Duration(seconds: 1));
    return _DateRange('Today', start, end);
  }

  static _DateRange get thisWeek {
    final now = DateTime.now();
    final start = now.subtract(Duration(days: now.weekday - 1));
    final s = DateTime(start.year, start.month, start.day);
    return _DateRange('This Week', s, null);
  }

  static _DateRange get thisMonth {
    final now = DateTime.now();
    return _DateRange('This Month',
        DateTime(now.year, now.month, 1), null);
  }

  static _DateRange get lastMonth {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month - 1, 1);
    final end = DateTime(now.year, now.month, 1).subtract(const Duration(seconds: 1));
    return _DateRange('Last Month', start, end);
  }

  static _DateRange get thisYear {
    final now = DateTime.now();
    return _DateRange('This Year', DateTime(now.year, 1, 1), null);
  }

  bool matches(DateTime date) {
    if (from == null) return true;
    final afterFrom = date.isAfter(from!.subtract(const Duration(seconds: 1)));
    final beforeTo = to == null || date.isBefore(to!.add(const Duration(seconds: 1)));
    return afterFrom && beforeTo;
  }
}

// ─── Reports Screen ───────────────────────────────────────────────────────────
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  _DateRange _range = _DateRange.thisMonth;

  final _presets = [
    ('Today', _DateRange.today),
    ('This Week', _DateRange.thisWeek),
    ('This Month', _DateRange.thisMonth),
    ('Last Month', _DateRange.lastMonth),
    ('This Year', _DateRange.thisYear),
    ('All Time', _DateRange.allTime),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      initialDateRange: DateTimeRange(
        start: _range.from ?? DateTime(now.year, now.month, 1),
        end: _range.to ?? now,
      ),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppColors.primary,
            surface: AppColors.surface,
            onSurface: AppColors.textPrimary,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _range = _DateRange(
          '${DateFormat('d MMM').format(picked.start)} â€“ ${DateFormat('d MMM').format(picked.end)}',
          picked.start,
          picked.end.add(const Duration(hours: 23, minutes: 59, seconds: 59)),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authNotifierProvider).value;

    if (!(user?.canViewFullReports ?? false)) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lock_rounded, color: AppColors.error, size: 48),
            const SizedBox(height: AppSpacing.lg),
            Text('Owner Access Required', style: AppTypography.h2),
            Text('Full reports are restricted to the owner',
                style: AppTypography.bodySmall),
          ]),
        ),
      );
    }

    return ScreenShell(
      title: 'Reports',
      subtitle: 'Complete business analytics',
      body: Column(children: [
        // ── Date range filter ───────────────────────────────────────────
        Container(
          color: AppColors.surface,
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(children: [
            // Preset chips
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  ..._presets.map((preset) {
                    final isSelected = _range.label == preset.$1;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        label: Text(preset.$1),
                        selected: isSelected,
                        onSelected: (_) => setState(() => _range = preset.$2),
                        selectedColor: AppColors.primaryContainer,
                        checkmarkColor: AppColors.primary,
                        labelStyle: AppTypography.caption.copyWith(
                          color: isSelected ? AppColors.primary : AppColors.textSecondary,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    );
                  }),
                  // Custom range button
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ActionChip(
                      label: Text(
                        _range.label.contains('â€“') ? _range.label : 'Custom',
                        style: AppTypography.caption,
                      ),
                      avatar: const Icon(Icons.date_range_rounded, size: 14),
                      onPressed: _pickCustomRange,
                      backgroundColor: _range.label.contains('â€“')
                          ? AppColors.primaryContainer
                          : AppColors.surface2,
                    ),
                  ),
                ],
              ),
            ),
          ]),
        ),

        // ── Tabs ─────────────────────────────────────────────────────────
        Container(
          color: AppColors.surface,
          child: TabBar(
            controller: _tabController,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.textMuted,
            indicatorColor: AppColors.primary,
            indicatorWeight: 2.5,
            labelStyle: AppTypography.label
                .copyWith(fontWeight: FontWeight.w700, fontSize: 13),
            tabs: const [
              Tab(text: '  Overview  '),
              Tab(text: '  Sales  '),
              Tab(text: '  Purchases  '),
              Tab(text: '  P&L  '),
              Tab(text: '  GST  '),
            ],
          ),
        ),

        const Divider(height: 1, color: AppColors.border),

        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _OverviewTab(range: _range),
              _SalesTab(range: _range),
              _PurchasesTab(range: _range),
              _PLTab(range: _range),
              _GSTTab(range: _range),
            ],
          ),
        ),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ═══════════════════════════════════════════════════════════════════
class _OverviewTab extends ConsumerWidget {
  final _DateRange range;
  const _OverviewTab({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(salesBillsProvider);
    final purchasesAsync = ref.watch(purchaseBillsProvider);
    final returnsAsync = ref.watch(allSaleReturnsProvider);
    final inventoryAsync = ref.watch(inventoryProvider);

    if (salesAsync.isLoading || purchasesAsync.isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2));
    }

    final allSales = salesAsync.valueOrNull ?? [];
    final allPurchases = purchasesAsync.valueOrNull ?? [];
    final allReturns = returnsAsync.valueOrNull ?? [];
    final allInventory = inventoryAsync.valueOrNull ?? [];

    final sales = allSales.where((b) => range.matches(b.saleDate)).toList();
    final purchases = allPurchases.where((b) => range.matches(b.invoiceDate)).toList();
    final returns = allReturns.where((r) => range.matches(r.returnDate)).toList();

    final netSales = sales.fold<double>(0, (s, b) => s + b.grandTotal);
    final totalPurchases = purchases.fold<double>(0, (s, b) => s + b.grandTotal);
    final totalReturns = returns.fold<double>(0, (s, r) => s + r.totalRefundAmount);
    final effectiveSales = netSales - totalReturns;

    // COGS from inventory batch data
    double cogs = 0;
    final invMap = {for (final inv in allInventory) inv.productId: inv};
    for (final bill in sales) {
      for (final item in bill.items) {
        final inv = invMap[item.productId];
        final batch = inv?.batches
            .where((b) => b.batchNumber == item.batchNumber)
            .firstOrNull;
        final purchaseRate = batch?.purchaseRate ?? 0;
        final perUnitCost = item.packSize > 0 ? purchaseRate / item.packSize : purchaseRate;
        cogs += perUnitCost * item.quantity;
      }
    }
    final grossProfit = effectiveSales - cogs;
    final grossMarginPct = effectiveSales > 0 ? (grossProfit / effectiveSales) * 100 : 0.0;

    // Outstanding credit
    final creditDue = allSales
        .where((b) => b.hasOutstandingCredit)
        .fold<double>(0, (s, b) => s + b.grandTotal);
    final purchaseDue = allPurchases
        .where((b) => b.ledgerType == LedgerType.credit && !b.isPaid)
        .fold<double>(0, (s, b) => s + b.grandTotal);

    // Inventory stats
    double invMrpValue = 0, invCostValue = 0;
    for (final inv in allInventory) {
      for (final batch in inv.batches) {
        invMrpValue += batch.mrp * batch.quantity;
        invCostValue += batch.purchaseRate * batch.quantity;
      }
    }

    final isMobile = MediaQuery.of(context).size.width < 600;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Primary KPI grid
        _SectionHeader('Business Overview', Icons.dashboard_rounded, AppColors.primary),
        const SizedBox(height: AppSpacing.md),
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Net Sales', AppFormatters.formatCurrency(effectiveSales),
              '${sales.length} bills', Icons.sell_rounded, AppColors.primary),
          _KpiData('Gross Profit', AppFormatters.formatCurrency(grossProfit),
              '${grossMarginPct.toStringAsFixed(1)}% margin', Icons.trending_up_rounded,
              grossProfit >= 0 ? AppColors.success : AppColors.error),
          _KpiData('Total Purchases', AppFormatters.formatCurrency(totalPurchases),
              '${purchases.length} bills', Icons.shopping_cart_rounded, AppColors.secondary),
          _KpiData('Sales Returns', AppFormatters.formatCurrency(totalReturns),
              '${returns.length} credit notes', Icons.keyboard_return_rounded, AppColors.warning),
        ]),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Credit & Payables', Icons.account_balance_rounded, AppColors.error),
        const SizedBox(height: AppSpacing.md),
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Receivable (Credit)', AppFormatters.formatCurrency(creditDue),
              'Owed to you', Icons.arrow_downward_rounded, AppColors.success),
          _KpiData('Payable (Credit)', AppFormatters.formatCurrency(purchaseDue),
              'You owe vendors', Icons.arrow_upward_rounded, AppColors.error),
          _KpiData('Net Position', AppFormatters.formatCurrency(creditDue - purchaseDue),
              creditDue >= purchaseDue ? 'You are net positive' : 'Net negative',
              Icons.account_balance_rounded,
              creditDue >= purchaseDue ? AppColors.success : AppColors.error),
          _KpiData('Inventory @ Cost', AppFormatters.formatCurrency(invCostValue),
              'Current stock value', Icons.inventory_2_rounded, AppColors.primary),
        ]),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Stock Snapshot', Icons.warehouse_rounded, AppColors.secondary),
        const SizedBox(height: AppSpacing.md),
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Stock @ MRP', AppFormatters.formatCurrency(invMrpValue),
              'Potential revenue', Icons.price_change_rounded, AppColors.primary),
          _KpiData('Stock @ Cost', AppFormatters.formatCurrency(invCostValue),
              'Capital locked in stock', Icons.savings_rounded, AppColors.secondary),
          _KpiData('Stock Margin', '${((invMrpValue - invCostValue) / (invMrpValue > 0 ? invMrpValue : 1) * 100).toStringAsFixed(1)}%',
              AppFormatters.formatCurrency(invMrpValue - invCostValue), Icons.local_offer_rounded, AppColors.success),
          _KpiData('SKUs in Stock',
              allInventory.where((i) => i.totalStock > 0).length.toString(),
              'of ${allInventory.length} products', Icons.category_rounded, AppColors.primary),
        ]),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2 — SALES
// ═══════════════════════════════════════════════════════════════════
class _SalesTab extends ConsumerWidget {
  final _DateRange range;
  const _SalesTab({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(salesBillsProvider);
    final returnsAsync = ref.watch(allSaleReturnsProvider);
    if (salesAsync.isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2));
    }

    final bills = (salesAsync.valueOrNull ?? [])
        .where((b) => range.matches(b.saleDate))
        .toList();
    final returns = (returnsAsync.valueOrNull ?? [])
        .where((r) => range.matches(r.returnDate))
        .toList();

    final netSales = bills.fold<double>(0, (s, b) => s + b.grandTotal);
    final salesMrp = bills.fold<double>(0, (s, b) =>
        s + b.items.fold<double>(0, (si, i) => si + i.mrp * i.quantity));
    final totalDiscount = bills.fold<double>(0, (s, b) => s + b.totalDiscount);
    final totalGst = bills.fold<double>(0, (s, b) => s + b.totalGst);
    final returnAmount = returns.fold<double>(0, (s, r) => s + r.totalRefundAmount);

    // Payment method breakdown
    final payMap = <PaymentMethod, double>{};
    for (final b in bills) {
      payMap[b.paymentMethod] = (payMap[b.paymentMethod] ?? 0) + b.grandTotal;
    }

    // Top products by revenue
    final productRevMap = <String, double>{};
    final productQtyMap = <String, double>{};
    for (final b in bills) {
      for (final item in b.items) {
        productRevMap[item.productName] = (productRevMap[item.productName] ?? 0) + item.lineTotal;
        productQtyMap[item.productName] = (productQtyMap[item.productName] ?? 0) + item.quantity;
      }
    }
    final topByRevenue = productRevMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final topByQty = productQtyMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    // Customer-wise breakdown
    final custMap = <String, double>{};
    for (final b in bills) {
      custMap[b.customerName] = (custMap[b.customerName] ?? 0) + b.grandTotal;
    }
    final topCustomers = custMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    // Day-by-day trend
    final dayMap = <String, double>{};
    for (final b in bills) {
      final key = DateFormat('dd MMM').format(b.saleDate);
      dayMap[key] = (dayMap[key] ?? 0) + b.grandTotal;
    }

    final isMobile = MediaQuery.of(context).size.width < 600;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // KPIs
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Net Sales', AppFormatters.formatCurrency(netSales), '${bills.length} invoices', Icons.sell_rounded, AppColors.primary),
          _KpiData('Sales @ MRP', AppFormatters.formatCurrency(salesMrp), 'Before discount', Icons.label_rounded, AppColors.secondary),
          _KpiData('Discount Given', AppFormatters.formatCurrency(totalDiscount),
              '${salesMrp > 0 ? (totalDiscount / salesMrp * 100).toStringAsFixed(1) : 0}% off MRP',
              Icons.local_offer_rounded, AppColors.warning),
          _KpiData('GST Collected', AppFormatters.formatCurrency(totalGst), 'Output tax', Icons.receipt_rounded, AppColors.error),
        ]),
        const SizedBox(height: AppSpacing.md),
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Returns', AppFormatters.formatCurrency(returnAmount), '${returns.length} credit notes', Icons.undo_rounded, AppColors.warning),
          _KpiData('Net Effective Sales', AppFormatters.formatCurrency(netSales - returnAmount), 'After returns', Icons.trending_up_rounded, AppColors.success),
          _KpiData('Avg Bill Value', AppFormatters.formatCurrency(bills.isNotEmpty ? netSales / bills.length : 0), 'Per invoice', Icons.calculate_rounded, AppColors.primary),
          _KpiData('Largest Bill', AppFormatters.formatCurrency(bills.isNotEmpty ? bills.map((b) => b.grandTotal).reduce((a, b) => a > b ? a : b) : 0), 'Single invoice', Icons.star_rounded, AppColors.secondary),
        ]),

        const SizedBox(height: AppSpacing.xl),

        // Trend chart
        _SectionHeader('Revenue Trend', Icons.show_chart_rounded, AppColors.primary),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: SizedBox(height: 220, child: _TrendChart(dayMap: dayMap, color: AppColors.primary))),

        const SizedBox(height: AppSpacing.xl),

        // Payment method breakdown
        _SectionHeader('Payment Methods', Icons.payments_rounded, AppColors.secondary),
        const SizedBox(height: AppSpacing.md),
        _PaymentBreakdownCard(payMap: payMap, total: netSales),

        const SizedBox(height: AppSpacing.xl),

        // Top products by revenue
        _SectionHeader('Top Products by Revenue', Icons.bar_chart_rounded, AppColors.primary),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: Column(children: [
          ...topByRevenue.take(10).map((e) => _BarRow(
            label: e.key,
            value: AppFormatters.formatCurrency(e.value),
            ratio: topByRevenue.isNotEmpty ? e.value / topByRevenue.first.value : 0,
            color: AppColors.primary,
          )),
          if (topByRevenue.isEmpty) Center(child: Text('No data', style: AppTypography.bodySmall)),
        ])),

        const SizedBox(height: AppSpacing.xl),

        // Top products by quantity
        _SectionHeader('Top Products by Quantity', Icons.format_list_numbered_rounded, AppColors.secondary),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: Column(children: [
          ...topByQty.take(10).map((e) => _BarRow(
            label: e.key,
            value: '${e.value.toStringAsFixed(0)} units',
            ratio: topByQty.isNotEmpty ? e.value / topByQty.first.value : 0,
            color: AppColors.secondary,
          )),
          if (topByQty.isEmpty) Center(child: Text('No data', style: AppTypography.bodySmall)),
        ])),

        const SizedBox(height: AppSpacing.xl),

        // Customer-wise breakdown
        _SectionHeader('Top Customers', Icons.people_rounded, AppColors.warning),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: Column(children: [
          ...topCustomers.take(10).map((e) => _BarRow(
            label: e.key,
            value: AppFormatters.formatCurrency(e.value),
            ratio: topCustomers.isNotEmpty ? e.value / topCustomers.first.value : 0,
            color: AppColors.warning,
          )),
          if (topCustomers.isEmpty) Center(child: Text('No data', style: AppTypography.bodySmall)),
        ])),

        const SizedBox(height: AppSpacing.xl),

        // Division-wise breakdown
        _DivisionBreakdown(bills: bills),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3 — PURCHASES
// ═══════════════════════════════════════════════════════════════════
class _PurchasesTab extends ConsumerWidget {
  final _DateRange range;
  const _PurchasesTab({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final purchasesAsync = ref.watch(purchaseBillsProvider);
    if (purchasesAsync.isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2));
    }

    final bills = (purchasesAsync.valueOrNull ?? [])
        .where((b) => range.matches(b.invoiceDate))
        .toList();

    final total = bills.fold<double>(0, (s, b) => s + b.grandTotal);
    final cashPaid = bills.where((b) => b.ledgerType == LedgerType.cash)
        .fold<double>(0, (s, b) => s + b.grandTotal);
    final creditTotal = bills.where((b) => b.ledgerType == LedgerType.credit)
        .fold<double>(0, (s, b) => s + b.grandTotal);
    final creditPending = bills.where((b) => b.ledgerType == LedgerType.credit && !b.isPaid)
        .fold<double>(0, (s, b) => s + b.grandTotal);
    final creditSettled = bills.where((b) => b.ledgerType == LedgerType.credit && b.isPaid)
        .fold<double>(0, (s, b) => s + b.grandTotal);
    final totalDiscount = bills.fold<double>(0, (s, b) => s + b.totalDiscount);
    final totalGst = bills.fold<double>(0, (s, b) => s + b.totalGst);

    // Vendor breakdown
    final vendorMap = <String, double>{};
    for (final b in bills) {
      vendorMap[b.partyName] = (vendorMap[b.partyName] ?? 0) + b.grandTotal;
    }
    final topVendors = vendorMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    // Day trend
    final dayMap = <String, double>{};
    for (final b in bills) {
      final key = DateFormat('dd MMM').format(b.invoiceDate);
      dayMap[key] = (dayMap[key] ?? 0) + b.grandTotal;
    }

    final isMobile = MediaQuery.of(context).size.width < 600;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Total Purchased', AppFormatters.formatCurrency(total), '${bills.length} bills', Icons.shopping_cart_rounded, AppColors.primary),
          _KpiData('Cash / Bank', AppFormatters.formatCurrency(cashPaid), 'Paid immediately', Icons.payments_rounded, AppColors.success),
          _KpiData('Credit Pending', AppFormatters.formatCurrency(creditPending), 'You owe vendors', Icons.pending_actions_rounded, AppColors.error),
          _KpiData('Credit Settled', AppFormatters.formatCurrency(creditSettled), 'Cleared bills', Icons.check_circle_rounded, AppColors.secondary),
        ]),
        const SizedBox(height: AppSpacing.md),
        _KpiGrid(isMobile: isMobile, kpis: [
          _KpiData('Total Discount', AppFormatters.formatCurrency(totalDiscount), 'From vendors', Icons.local_offer_rounded, AppColors.warning),
          _KpiData('Input GST', AppFormatters.formatCurrency(totalGst), 'Tax paid', Icons.receipt_rounded, AppColors.error),
          _KpiData('Avg Bill Value', AppFormatters.formatCurrency(bills.isNotEmpty ? total / bills.length : 0), 'Per invoice', Icons.calculate_rounded, AppColors.primary),
          _KpiData('Credit %', '${total > 0 ? (creditTotal / total * 100).toStringAsFixed(1) : 0}%', 'On credit vs total', Icons.percent_rounded, AppColors.secondary),
        ]),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Purchase Trend', Icons.show_chart_rounded, AppColors.secondary),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: SizedBox(height: 220, child: _TrendChart(dayMap: dayMap, color: AppColors.secondary))),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Top Vendors by Amount', Icons.business_rounded, AppColors.secondary),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: Column(children: [
          ...topVendors.take(10).map((e) => _BarRow(
            label: e.key,
            value: AppFormatters.formatCurrency(e.value),
            ratio: topVendors.isNotEmpty ? e.value / topVendors.first.value : 0,
            color: AppColors.secondary,
          )),
          if (topVendors.isEmpty) Center(child: Text('No data', style: AppTypography.bodySmall)),
        ])),

        const SizedBox(height: AppSpacing.xl),

        // Month-wise table
        _PurchaseMonthTable(bills: purchasesAsync.valueOrNull ?? []),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4 — P&L (Profit & Loss)
// ═══════════════════════════════════════════════════════════════════
class _PLTab extends ConsumerWidget {
  final _DateRange range;
  const _PLTab({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(salesBillsProvider);
    final returnsAsync = ref.watch(allSaleReturnsProvider);
    final inventoryAsync = ref.watch(inventoryProvider);
    if (salesAsync.isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2));
    }

    final allSales = salesAsync.valueOrNull ?? [];
    final bills = allSales.where((b) => range.matches(b.saleDate)).toList();
    final returns = (returnsAsync.valueOrNull ?? [])
        .where((r) => range.matches(r.returnDate))
        .toList();
    final allInventory = inventoryAsync.valueOrNull ?? [];

    final invMap = {for (final inv in allInventory) inv.productId: inv};

    // Compute COGS per bill
    final dayPL = <String, ({double revenue, double cogs})>{};
    double totalRevenue = 0, totalCogs = 0;

    for (final bill in bills) {
      double billCogs = 0;
      for (final item in bill.items) {
        final inv = invMap[item.productId];
        final batch = inv?.batches
            .where((b) => b.batchNumber == item.batchNumber)
            .firstOrNull;
        billCogs += (batch?.purchaseRate ?? 0) * item.quantity;
      }
      totalRevenue += bill.grandTotal;
      totalCogs += billCogs;

      final key = DateFormat('dd MMM').format(bill.saleDate);
      final existing = dayPL[key];
      dayPL[key] = (
        revenue: (existing?.revenue ?? 0) + bill.grandTotal,
        cogs: (existing?.cogs ?? 0) + billCogs,
      );
    }

    final returnAmount = returns.fold<double>(0, (s, r) => s + r.totalRefundAmount);
    final netRevenue = totalRevenue - returnAmount;
    final grossProfit = netRevenue - totalCogs;
    final grossMargin = netRevenue > 0 ? grossProfit / netRevenue * 100 : 0.0;

    // Monthly P&L breakdown
    final monthPL = <String, ({double revenue, double cogs})>{};
    for (final bill in allSales) {
      double billCogs = 0;
      for (final item in bill.items) {
        final inv = invMap[item.productId];
        final batch = inv?.batches
            .where((b) => b.batchNumber == item.batchNumber)
            .firstOrNull;
        billCogs += (batch?.purchaseRate ?? 0) * item.quantity;
      }
      final key = DateFormat('MMM yy').format(bill.saleDate);
      final existing = monthPL[key];
      monthPL[key] = (
        revenue: (existing?.revenue ?? 0) + bill.grandTotal,
        cogs: (existing?.cogs ?? 0) + billCogs,
      );
    }



    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // P&L Summary Card
        AppCard(
          child: Column(children: [
            _SectionHeader('Profit & Loss Statement', Icons.analytics_rounded, AppColors.primary),
            const SizedBox(height: AppSpacing.lg),
            _PLRow('Gross Sales Revenue', totalRevenue, color: AppColors.primary),
            _PLRow('(-) Sales Returns', returnAmount, negative: true, color: AppColors.warning),
            const Divider(height: 20),
            _PLRow('Net Revenue', netRevenue, bold: true, color: AppColors.primary),
            _PLRow('(-) Cost of Goods Sold', totalCogs, negative: true, color: AppColors.error),
            const Divider(height: 20),
            _PLRow('Gross Profit', grossProfit, bold: true,
                color: grossProfit >= 0 ? AppColors.success : AppColors.error),
            const SizedBox(height: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: grossProfit >= 0
                    ? AppColors.success.withValues(alpha: 0.1)
                    : AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Gross Margin', style: AppTypography.labelLarge),
                  Text(
                    '${grossMargin.toStringAsFixed(2)}%',
                    style: AppTypography.numericLarge.copyWith(
                      color: grossProfit >= 0 ? AppColors.success : AppColors.error,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'âš  COGS is calculated using the purchase rate stored per batch. This is accurate for standard items but may differ from weighted average cost methods.',
              style: AppTypography.caption.copyWith(color: AppColors.textMuted),
            ),
          ]),
        ),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Daily P&L Trend', Icons.bar_chart_rounded, AppColors.success),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: SizedBox(
          height: 250,
          child: _PLBarChart(dayPL: dayPL),
        )),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('Monthly P&L Breakdown', Icons.table_chart_rounded, AppColors.primary),
        const SizedBox(height: AppSpacing.md),
        _MonthlyPLTable(monthPL: monthPL),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 5 — GST REPORT
// ═══════════════════════════════════════════════════════════════════
class _GSTTab extends ConsumerWidget {
  final _DateRange range;
  const _GSTTab({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final salesAsync = ref.watch(salesBillsProvider);
    final purchasesAsync = ref.watch(purchaseBillsProvider);
    if (salesAsync.isLoading || purchasesAsync.isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2));
    }

    final sales = (salesAsync.valueOrNull ?? [])
        .where((b) => range.matches(b.saleDate))
        .toList();
    final purchases = (purchasesAsync.valueOrNull ?? [])
        .where((b) => range.matches(b.invoiceDate))
        .toList();

    // Output GST (sales) by slab
    final outputGst = <double, ({double taxable, double gst})>{};
    for (final bill in sales) {
      for (final item in bill.items) {
        final slab = item.gstPercent;
        final taxable = item.taxableAmount;
        final gstAmt = taxable - (taxable / (1 + slab / 100));
        final existing = outputGst[slab];
        outputGst[slab] = (
          taxable: (existing?.taxable ?? 0) + taxable,
          gst: (existing?.gst ?? 0) + gstAmt,
        );
      }
    }

    // Input GST (purchases) by slab
    final inputGst = <double, ({double taxable, double gst})>{};
    for (final bill in purchases) {
      for (final item in bill.items) {
        final slab = item.gstPercent;
        final taxable = item.taxableAmount;
        final gstAmt = item.gstAmount;
        final existing = inputGst[slab];
        inputGst[slab] = (
          taxable: (existing?.taxable ?? 0) + taxable,
          gst: (existing?.gst ?? 0) + gstAmt,
        );
      }
    }

    final totalOutput = outputGst.values.fold<double>(0, (s, e) => s + e.gst);
    final totalInput = inputGst.values.fold<double>(0, (s, e) => s + e.gst);
    final netGst = totalOutput - totalInput;

    final slabs = <double>{...outputGst.keys, ...inputGst.keys}.toList()..sort();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Summary
        _KpiGrid(isMobile: MediaQuery.of(context).size.width < 600, kpis: [
          _KpiData('Output GST', AppFormatters.formatCurrency(totalOutput), 'Collected from customers', Icons.arrow_upward_rounded, AppColors.error),
          _KpiData('Input GST', AppFormatters.formatCurrency(totalInput), 'Paid to vendors (ITC)', Icons.arrow_downward_rounded, AppColors.success),
          _KpiData('Net GST Payable', AppFormatters.formatCurrency(netGst.clamp(0, double.infinity)),
              netGst > 0 ? 'Pay to government' : 'ITC > Output', Icons.account_balance_rounded,
              netGst > 0 ? AppColors.error : AppColors.success),
          _KpiData('ITC Balance', AppFormatters.formatCurrency((totalInput - totalOutput).clamp(0, double.infinity)),
              'Input tax credit remaining', Icons.savings_rounded, AppColors.primary),
        ]),

        const SizedBox(height: AppSpacing.xl),
        _SectionHeader('GST Slab-wise Breakdown', Icons.table_rows_rounded, AppColors.primary),
        const SizedBox(height: AppSpacing.md),

        // GST Table
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            // Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
              decoration: const BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Row(children: [
                Expanded(flex: 2, child: Text('GST Slab', style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
                Expanded(flex: 2, child: Text('Taxable (Sales)', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
                Expanded(flex: 2, child: Text('Output GST', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
                Expanded(flex: 2, child: Text('Input GST (ITC)', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
                Expanded(flex: 2, child: Text('Net GST', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
              ]),
            ),
            const Divider(height: 1),
            ...slabs.map((slab) {
              final out = outputGst[slab];
              final inp = inputGst[slab];
              final net = (out?.gst ?? 0) - (inp?.gst ?? 0);
              return Column(children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
                  child: Row(children: [
                    Expanded(flex: 2, child: Text('${slab.toStringAsFixed(0)}% GST',
                        style: AppTypography.labelLarge)),
                    Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(out?.taxable ?? 0),
                        textAlign: TextAlign.end, style: AppTypography.numeric)),
                    Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(out?.gst ?? 0),
                        textAlign: TextAlign.end,
                        style: AppTypography.numeric.copyWith(color: AppColors.error))),
                    Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(inp?.gst ?? 0),
                        textAlign: TextAlign.end,
                        style: AppTypography.numeric.copyWith(color: AppColors.success))),
                    Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(net.abs()),
                        textAlign: TextAlign.end,
                        style: AppTypography.numeric.copyWith(
                            color: net > 0 ? AppColors.error : AppColors.success))),
                  ]),
                ),
                const Divider(height: 1, indent: AppSpacing.lg),
              ]);
            }),
            // Totals row
            Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
              decoration: const BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: Row(children: [
                const Expanded(flex: 2, child: Text('TOTAL', style: TextStyle(fontWeight: FontWeight.w900))),
                Expanded(flex: 2, child: Text(
                    AppFormatters.formatCurrency(outputGst.values.fold(0, (s, e) => s + e.taxable)),
                    textAlign: TextAlign.end, style: AppTypography.numericSmall)),
                Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(totalOutput),
                    textAlign: TextAlign.end,
                    style: AppTypography.numericSmall.copyWith(color: AppColors.error))),
                Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(totalInput),
                    textAlign: TextAlign.end,
                    style: AppTypography.numericSmall.copyWith(color: AppColors.success))),
                Expanded(flex: 2, child: Text(AppFormatters.formatCurrency(netGst.abs()),
                    textAlign: TextAlign.end,
                    style: AppTypography.numericSmall.copyWith(
                        color: netGst > 0 ? AppColors.error : AppColors.success))),
              ]),
            ),
          ]),
        ),

        const SizedBox(height: AppSpacing.md),
        Text(
          '* CGST and SGST are each 50% of the GST column above. IGST applies if inter-state.',
          style: AppTypography.caption.copyWith(color: AppColors.textMuted),
        ),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// SHARED WIDGETS
// ═══════════════════════════════════════════════════════════════════

class _KpiData {
  final String title, value, sub;
  final IconData icon;
  final Color color;
  const _KpiData(this.title, this.value, this.sub, this.icon, this.color);
}

class _KpiGrid extends StatelessWidget {
  final List<_KpiData> kpis;
  final bool isMobile;
  const _KpiGrid({required this.kpis, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    if (isMobile) {
      return GridView.count(
        crossAxisCount: 2,
        crossAxisSpacing: AppSpacing.sm,
        mainAxisSpacing: AppSpacing.sm,
        childAspectRatio: 1.4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: kpis.map((k) => _KpiCard(data: k)).toList(),
      );
    }
    return Row(
      children: kpis
          .expand((k) => [Expanded(child: _KpiCard(data: k)), const SizedBox(width: AppSpacing.sm)])
          .toList()
        ..removeLast(),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final _KpiData data;
  const _KpiCard({required this.data});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: data.color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(data.icon, color: data.color, size: 20),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  data.title,
                  style: AppTypography.bodySmall.copyWith(fontWeight: FontWeight.w600, color: AppColors.textSecondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(data.value,
              style: AppTypography.h2.copyWith(
                  color: AppColors.textPrimary, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(data.sub,
              style: AppTypography.caption.copyWith(color: data.color),
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  const _SectionHeader(this.title, this.icon, this.color);

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Icon(icon, color: color, size: 18),
      const SizedBox(width: 8),
      Text(title, style: AppTypography.h3),
    ]);
  }
}

class _BarRow extends StatelessWidget {
  final String label, value;
  final double ratio;
  final Color color;
  const _BarRow({required this.label, required this.value, required this.ratio, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(children: [
        Expanded(
          flex: 3,
          child: Text(label, style: AppTypography.body, overflow: TextOverflow.ellipsis),
        ),
        Expanded(
          flex: 5,
          child: LinearProgressIndicator(
            value: ratio,
            backgroundColor: AppColors.surface2,
            valueColor: AlwaysStoppedAnimation(color),
            minHeight: 6,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        SizedBox(
          width: 90,
          child: Text(value,
              textAlign: TextAlign.end,
              style: AppTypography.numericSmall.copyWith(color: color)),
        ),
      ]),
    );
  }
}

class _PLRow extends StatelessWidget {
  final String label;
  final double value;
  final bool negative, bold;
  final Color color;
  const _PLRow(this.label, this.value, {this.negative = false, this.bold = false, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: bold ? AppTypography.labelLarge : AppTypography.body),
          Text(
            '${negative ? "â€“ " : ""}${AppFormatters.formatCurrency(value)}',
            style: (bold ? AppTypography.numericSmall : AppTypography.body)
                .copyWith(color: color, fontWeight: bold ? FontWeight.w800 : null),
          ),
        ],
      ),
    );
  }
}

class _TrendChart extends StatelessWidget {
  final Map<String, double> dayMap;
  final Color color;
  const _TrendChart({required this.dayMap, required this.color});

  @override
  Widget build(BuildContext context) {
    if (dayMap.isEmpty) {
      return Center(child: Text('No data for this period', style: AppTypography.bodySmall));
    }
    final sorted = dayMap.entries.toList();
    final spots = sorted.asMap().entries.map((e) =>
        FlSpot(e.key.toDouble(), e.value.value)).toList();
    final maxY = spots.map((s) => s.y).reduce((a, b) => a > b ? a : b);

    return LineChart(LineChartData(
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        horizontalInterval: maxY / 4,
        getDrawingHorizontalLine: (_) => FlLine(color: AppColors.border, strokeWidth: 0.5),
      ),
      titlesData: FlTitlesData(
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 28,
          interval: (sorted.length / 5).ceilToDouble(),
          getTitlesWidget: (value, _) {
            final idx = value.toInt();
            if (idx < 0 || idx >= sorted.length) return const SizedBox();
            return Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(sorted[idx].key.split(' ').first,
                  style: AppTypography.caption),
            );
          },
        )),
        leftTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 48,
          getTitlesWidget: (v, _) => Text(
            v >= 1000 ? '${(v / 1000).toStringAsFixed(0)}k' : v.toStringAsFixed(0),
            style: AppTypography.caption,
          ),
        )),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      minY: 0,
      maxY: maxY * 1.2,
      lineBarsData: [LineChartBarData(
        spots: spots,
        isCurved: true,
        color: color,
        barWidth: 3,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(
          show: true,
          gradient: LinearGradient(
            colors: [color.withValues(alpha: 0.25), color.withValues(alpha: 0)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
      )],
    ));
  }
}

class _PLBarChart extends StatelessWidget {
  final Map<String, ({double revenue, double cogs})> dayPL;
  const _PLBarChart({required this.dayPL});

  @override
  Widget build(BuildContext context) {
    if (dayPL.isEmpty) {
      return Center(child: Text('No data for this period', style: AppTypography.bodySmall));
    }
    final sorted = dayPL.entries.toList();
    final maxY = sorted.map((e) => e.value.revenue).reduce((a, b) => a > b ? a : b);

    return BarChart(BarChartData(
      alignment: BarChartAlignment.spaceAround,
      maxY: maxY * 1.2,
      barTouchData: BarTouchData(enabled: false),
      titlesData: FlTitlesData(
        bottomTitles: AxisTitles(sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 28,
          getTitlesWidget: (v, _) {
            final idx = v.toInt();
            if (idx < 0 || idx >= sorted.length) return const SizedBox();
            return Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(sorted[idx].key.split(' ').first, style: AppTypography.caption),
            );
          },
        )),
        leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
      borderData: FlBorderData(show: false),
      gridData: const FlGridData(show: false),
      barGroups: sorted.asMap().entries.map((entry) {
        final i = entry.key;
        final pl = entry.value.value;
        final gp = pl.revenue - pl.cogs;
        return BarChartGroupData(x: i, barRods: [
          BarChartRodData(
            toY: pl.revenue,
            color: AppColors.primary.withValues(alpha: 0.5),
            width: 10,
            borderRadius: BorderRadius.circular(3),
          ),
          BarChartRodData(
            toY: gp.clamp(0, double.infinity),
            color: AppColors.success,
            width: 10,
            borderRadius: BorderRadius.circular(3),
          ),
        ]);
      }).toList(),
    ));
  }
}

class _PaymentBreakdownCard extends StatelessWidget {
  final Map<PaymentMethod, double> payMap;
  final double total;
  const _PaymentBreakdownCard({required this.payMap, required this.total});

  static const _colors = {
    PaymentMethod.cash: AppColors.success,
    PaymentMethod.upi: AppColors.primary,
    PaymentMethod.card: AppColors.secondary,
    PaymentMethod.credit: AppColors.warning,
  };

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(children: [
        ...PaymentMethod.values.map((method) {
          final amount = payMap[method] ?? 0;
          final pct = total > 0 ? amount / total : 0.0;
          final color = _colors[method] ?? AppColors.primary;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(method.displayName, style: AppTypography.body)),
              const SizedBox(width: 8),
              SizedBox(
                width: 140,
                child: LinearProgressIndicator(
                  value: pct,
                  backgroundColor: AppColors.surface2,
                  valueColor: AlwaysStoppedAnimation(color),
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 8),
              Text('${(pct * 100).toStringAsFixed(1)}%',
                  style: AppTypography.caption, textAlign: TextAlign.end),
              const SizedBox(width: 8),
              SizedBox(
                width: 80,
                child: Text(AppFormatters.formatCurrency(amount),
                    textAlign: TextAlign.end,
                    style: AppTypography.numericSmall.copyWith(color: color)),
              ),
            ]),
          );
        }),
      ]),
    );
  }
}

class _DivisionBreakdown extends StatelessWidget {
  final List<SalesBillModel> bills;
  const _DivisionBreakdown({required this.bills});

  @override
  Widget build(BuildContext context) {
    final divMap = <String, double>{};
    for (final b in bills) {
      for (final item in b.items) {
        divMap[item.division] = (divMap[item.division] ?? 0) + item.lineTotal;
      }
    }
    if (divMap.isEmpty) return const SizedBox.shrink();

    final sorted = divMap.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final maxVal = sorted.first.value;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionHeader('Division-wise Sales', Icons.category_rounded, AppColors.primary),
      const SizedBox(height: AppSpacing.md),
      AppCard(child: Column(children: [
        ...sorted.map((e) => _BarRow(
          label: e.key,
          value: AppFormatters.formatCurrency(e.value),
          ratio: e.value / maxVal,
          color: AppColors.primary,
        )),
      ])),
    ]);
  }
}

class _MonthlyPLTable extends StatelessWidget {
  final Map<String, ({double revenue, double cogs})> monthPL;
  const _MonthlyPLTable({required this.monthPL});

  @override
  Widget build(BuildContext context) {
    final sorted = monthPL.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));

    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
          decoration: const BoxDecoration(
            color: AppColors.surface2,
            borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child: Row(children: [
            Expanded(child: Text('Month', style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
            Expanded(child: Text('Revenue', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
            Expanded(child: Text('COGS', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
            Expanded(child: Text('Gross Profit', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
            Expanded(child: Text('Margin %', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
          ]),
        ),
        const Divider(height: 1),
        ...sorted.map((entry) {
          final gp = entry.value.revenue - entry.value.cogs;
          final margin = entry.value.revenue > 0 ? gp / entry.value.revenue * 100 : 0.0;
          return Column(children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
              child: Row(children: [
                Expanded(child: Text(entry.key, style: AppTypography.body)),
                Expanded(child: Text(AppFormatters.formatCurrency(entry.value.revenue),
                    textAlign: TextAlign.end, style: AppTypography.numeric)),
                Expanded(child: Text(AppFormatters.formatCurrency(entry.value.cogs),
                    textAlign: TextAlign.end,
                    style: AppTypography.numeric.copyWith(color: AppColors.error))),
                Expanded(child: Text(AppFormatters.formatCurrency(gp),
                    textAlign: TextAlign.end,
                    style: AppTypography.numeric.copyWith(
                        color: gp >= 0 ? AppColors.success : AppColors.error))),
                Expanded(child: Text('${margin.toStringAsFixed(1)}%',
                    textAlign: TextAlign.end,
                    style: AppTypography.numeric.copyWith(
                        color: margin >= 15 ? AppColors.success : AppColors.warning))),
              ]),
            ),
            const Divider(height: 1, indent: AppSpacing.lg),
          ]);
        }),
      ]),
    );
  }
}

class _PurchaseMonthTable extends StatelessWidget {
  final List<PurchaseBillModel> bills;
  const _PurchaseMonthTable({required this.bills});

  @override
  Widget build(BuildContext context) {
    final monthMap = <String, double>{};
    for (final b in bills) {
      final key = DateFormat('MMM yy').format(b.invoiceDate);
      monthMap[key] = (monthMap[key] ?? 0) + b.grandTotal;
    }
    if (monthMap.isEmpty) return const SizedBox.shrink();
    final sorted = monthMap.entries.toList()..sort((a, b) => a.key.compareTo(b.key));

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionHeader('Month-wise Purchases', Icons.table_chart_rounded, AppColors.secondary),
      const SizedBox(height: AppSpacing.md),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
            decoration: const BoxDecoration(color: AppColors.surface2,
                borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
            child: Row(children: [
              Expanded(child: Text('Month', style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
              Expanded(child: Text('Amount', textAlign: TextAlign.end, style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700))),
            ]),
          ),
          const Divider(height: 1),
          ...sorted.map((e) => Column(children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
              child: Row(children: [
                Expanded(child: Text(e.key, style: AppTypography.body)),
                Expanded(child: Text(AppFormatters.formatCurrency(e.value),
                    textAlign: TextAlign.end, style: AppTypography.numeric.copyWith(color: AppColors.secondary))),
              ]),
            ),
            const Divider(height: 1, indent: AppSpacing.lg),
          ])),
        ]),
      ),
    ]);
  }
}
