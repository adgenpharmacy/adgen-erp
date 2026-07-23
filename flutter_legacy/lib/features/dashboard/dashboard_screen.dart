import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/responsive.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../dashboard/widgets/alerts_popup.dart';
import '../dashboard/widgets/credit_reminders_widget.dart';
import '../../core/services/update_service.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _popupShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      UpdateService.checkForUpdate(context);
    });
  }

  void _showPopupOnce() {
    if (_popupShown || !mounted) return;
    _popupShown = true;
    showDialog(context: context, builder: (_) => const AlertsPopup());
  }

  @override
  Widget build(BuildContext context) {
    // Listen to alerts providers to pop up once they load with non-empty results
    ref.listen<AsyncValue<List<InventoryModel>>>(lowStockProvider, (previous, next) {
      if (next.value != null && next.value!.isNotEmpty) {
        _showPopupOnce();
      }
    });
    ref.listen<AsyncValue<List<InventoryModel>>>(expiringProductsProvider, (previous, next) {
      if (next.value != null && next.value!.isNotEmpty) {
        _showPopupOnce();
      }
    });

    final user = ref.watch(authNotifierProvider).value;
    final salesAsync = ref.watch(salesBillsProvider);
    final purchasesAsync = ref.watch(purchaseBillsProvider);
    final creditBillsAsync = ref.watch(creditBillsProvider);
    final lowStockAsync = ref.watch(lowStockProvider);
    final isMobile = Responsive.isMobile(context);
    final padding = Responsive.screenPadding(context);

    final today = DateTime.now();
    final allBills = salesAsync.valueOrNull ?? <SalesBillModel>[];
    final todayBills = allBills.where((s) =>
        s.saleDate.year == today.year &&
        s.saleDate.month == today.month &&
        s.saleDate.day == today.day).toList();
    final todayRevenue = todayBills.fold<double>(0, (s, b) => s + b.grandTotal);
    final creditCount = creditBillsAsync.valueOrNull?.length ?? 0;
    final lowStockCount = lowStockAsync.valueOrNull?.length ?? 0;
    final recentPurchases = purchasesAsync.valueOrNull?.take(5).toList() ?? [];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(padding, padding, padding, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ─── Top Bar ───────────────────────────────────────
                    _TopBar(user: user, isMobile: isMobile),
                    SizedBox(height: isMobile ? 24 : 32),

                    // ─── Hero Revenue Card ──────────────────────────────
                    _HeroCard(
                      revenue: todayRevenue,
                      billCount: todayBills.length,
                      creditCount: creditCount,
                      lowStockCount: lowStockCount,
                      isMobile: isMobile,
                      onNewSale: () => context.push('/sales/new'),
                      onAlerts: () => showDialog(
                        context: context,
                        builder: (_) => const AlertsPopup(),
                      ),
                    ),
                    SizedBox(height: isMobile ? 20 : 28),

                    // ─── Quick Actions strip ────────────────────────────
                    _QuickActionsStrip(isMobile: isMobile),
                    SizedBox(height: isMobile ? 24 : 32),

                    // ─── Body ───────────────────────────────────────────
                    if (isMobile) ...[
                      _RecentSalesSection(bills: allBills.take(8).toList()),
                      const SizedBox(height: 20),
                      _RecentPurchasesSection(bills: recentPurchases),
                    ] else
                      _DesktopBody(
                        recentBills: allBills.take(8).toList(),
                        creditBills: creditBillsAsync.valueOrNull ?? <SalesBillModel>[],
                        salesLoading: salesAsync.isLoading,
                        recentPurchases: recentPurchases,
                      ),

                    SizedBox(height: padding),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
class _TopBar extends StatelessWidget {
  final dynamic user;
  final bool isMobile;
  const _TopBar({required this.user, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    final name = user?.name.split(' ').first ?? '';
    final dayStr = AppFormatters.formatDate(DateTime.now());

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Good $greeting${name.isNotEmpty ? ", $name" : ""} 👋',
              style: (isMobile ? AppTypography.h3 : AppTypography.h2).copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(dayStr, style: AppTypography.caption),
          ],
        ).animate().fadeIn(duration: 400.ms),
        Row(
          children: [
            _AvatarButton(
              icon: Icons.notifications_outlined,
              onTap: () => showDialog(
                context: context,
                builder: (_) => const AlertsPopup(),
              ),
            ),
            if (!isMobile) ...[
              const SizedBox(width: AppSpacing.sm),
              _AvatarButton(
                icon: Icons.settings_outlined,
                onTap: () {},
              ),
            ],
          ],
        ).animate(delay: 100.ms).fadeIn(),
      ],
    );
  }
}

class _AvatarButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _AvatarButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Icon(icon, size: 18, color: AppColors.textSecondary),
        ),
      ),
    );
  }
}

// ─── Hero Revenue Card ────────────────────────────────────────────────────────
class _HeroCard extends StatelessWidget {
  final double revenue;
  final int billCount, creditCount, lowStockCount;
  final bool isMobile;
  final VoidCallback onNewSale, onAlerts;

  const _HeroCard({
    required this.revenue,
    required this.billCount,
    required this.creditCount,
    required this.lowStockCount,
    required this.isMobile,
    required this.onNewSale,
    required this.onAlerts,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(isMobile ? 20 : 28),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF047857), Color(0xFF059669), Color(0xFF0EA5E9)],
          stops: [0.0, 0.6, 1.0],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF059669).withValues(alpha: 0.3),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    "Today's Revenue",
                    style: AppTypography.label.copyWith(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 13,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Tooltip(
                    message: "Sum of grand totals for all sales bills generated today",
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(12),
                    textStyle: AppTypography.caption.copyWith(color: AppColors.surface),
                    child: Icon(Icons.info_outline_rounded, size: 14, color: Colors.white.withValues(alpha: 0.5)),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.circle, size: 6, color: Colors.greenAccent.shade400),
                    const SizedBox(width: 5),
                    Text(
                      'Live',
                      style: AppTypography.caption.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Big revenue number
          Text(
            AppFormatters.formatCurrency(revenue),
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: isMobile ? 32 : 42,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: -1,
              height: 1.1,
            ),
          ).animate().fadeIn(duration: 500.ms).slideY(begin: 0.2, end: 0),

          const SizedBox(height: 16),

          // Pill stats
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatPill(Icons.receipt_rounded, '$billCount Bills', Colors.white),
              if (creditCount > 0)
                _StatPill(Icons.account_balance_wallet_rounded,
                    '$creditCount Credit', Colors.amber.shade300),
              if (lowStockCount > 0)
                _StatPill(Icons.warning_amber_rounded,
                    '$lowStockCount Low Stock', Colors.red.shade300),
            ],
          ),

          const SizedBox(height: 20),

          // Action buttons — Flexible to avoid overflow on small phones
          Row(
            children: [
              Flexible(
                child: _HeroButton(
                  label: 'New Sale',
                  icon: Icons.add_rounded,
                  onTap: onNewSale,
                  filled: true,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: _HeroButton(
                  label: 'View All',
                  icon: Icons.arrow_forward_rounded,
                  onTap: () => context.go('/sales'),
                  filled: false,
                ),
              ),
            ],
          ),
        ],
      ),
    ).animate(delay: 150.ms).fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0);
  }
}

class _StatPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _StatPill(this.icon, this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.95),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  const _HeroButton({
    required this.label,
    required this.icon,
    required this.onTap,
    required this.filled,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: BoxDecoration(
            color: filled ? Colors.white : Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
            border: filled ? null : Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15,
                  color: filled ? AppColors.primary : Colors.white),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: filled ? AppColors.primary : Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Quick Actions Strip ──────────────────────────────────────────────────────
class _QuickActionsStrip extends StatelessWidget {
  final bool isMobile;
  const _QuickActionsStrip({required this.isMobile});

  static const _actions = [
    _QA('New Purchase', Icons.shopping_cart_rounded, AppColors.secondary, '/purchase/new'),
    _QA('Products', Icons.medication_rounded, Color(0xFF0EA5E9), '/products'),
    _QA('Parties', Icons.group_rounded, AppColors.teal, '/parties'),
    _QA('Customers', Icons.person_rounded, AppColors.primary, '/customers'),
    _QA('Inventory', Icons.inventory_2_rounded, AppColors.warning, '/inventory'),
    _QA('Accounts', Icons.account_balance_rounded, AppColors.error, '/ledger'),
    _QA('Reports', Icons.bar_chart_rounded, AppColors.ai, '/reports'),
    _QA('AdGen AI', Icons.auto_awesome_rounded, AppColors.ai, '/ai'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Quick Access', style: AppTypography.label.copyWith(
          color: AppColors.textMuted,
          letterSpacing: 0.5,
        )),
        const SizedBox(height: 10),
        SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _actions.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final a = _actions[i];
              return _QuickActionChip(action: a);
            },
          ),
        ),
      ],
    );
  }
}

class _QA {
  final String label, route;
  final IconData icon;
  final Color color;
  const _QA(this.label, this.icon, this.color, this.route);
}

class _QuickActionChip extends StatelessWidget {
  final _QA action;
  const _QuickActionChip({required this.action});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.push(action.route),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 72,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: action.color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(action.icon, size: 16, color: action.color),
              ),
              const SizedBox(height: 5),
              Text(
                action.label,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Desktop Two-Column Body ──────────────────────────────────────────────────
class _DesktopBody extends StatelessWidget {
  final List<SalesBillModel> recentBills;
  final List<SalesBillModel> creditBills;
  final bool salesLoading;
  final List<PurchaseBillModel> recentPurchases;

  const _DesktopBody({
    required this.recentBills,
    required this.creditBills,
    required this.salesLoading,
    required this.recentPurchases,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Column(
            children: [
              _RecentSalesSection(bills: recentBills, isLoading: salesLoading),
              const SizedBox(height: 20),
              _RecentPurchasesSection(bills: recentPurchases),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.xxl),
        Expanded(
          flex: 2,
          child: CreditRemindersWidget(bills: creditBills),
        ),
      ],
    );
  }
}

// ─── Recent Sales Section ─────────────────────────────────────────────────────
class _RecentSalesSection extends StatelessWidget {
  final List<SalesBillModel> bills;
  final bool isLoading;

  const _RecentSalesSection({required this.bills, this.isLoading = false});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      noPadding: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Recent Sales', style: AppTypography.h3),
                    Text('Today\'s transactions', style: AppTypography.caption),
                  ],
                ),
                TextButton(
                  onPressed: () => context.go('/sales'),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    foregroundColor: AppColors.primary,
                  ),
                  child: Text('See all →',
                      style: AppTypography.label.copyWith(color: AppColors.primary)),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),

          // List
          if (isLoading)
            const Padding(
              padding: EdgeInsets.all(AppSpacing.xxl),
              child: Center(child: CircularProgressIndicator(
                  color: AppColors.primary, strokeWidth: 2)),
            )
          else if (bills.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    const Icon(Icons.receipt_long_outlined,
                        size: 36, color: AppColors.textDisabled),
                    const SizedBox(height: 8),
                    Text('No sales today yet', style: AppTypography.bodySmall),
                  ],
                ),
              ),
            )
          else
            ...bills.asMap().entries.map((entry) {
              final i = entry.key;
              final bill = entry.value;
              return Column(
                children: [
                  _SaleRow(bill: bill),
                  if (i < bills.length - 1)
                    const Divider(height: 1, color: AppColors.borderLight, indent: 68),
                ],
              );
            }),
        ],
      ),
    );
  }
}

class _SaleRow extends StatelessWidget {
  final SalesBillModel bill;
  const _SaleRow({required this.bill});

  @override
  Widget build(BuildContext context) {
    final initials = bill.customerName.isNotEmpty
        ? bill.customerName[0].toUpperCase()
        : '?';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/sales/detail/${bill.id}', extra: bill),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            children: [
              // Avatar
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(initials,
                      style: AppTypography.label.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      )),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bill.customerName, style: AppTypography.labelLarge),
                    Text(
                      '${bill.invoiceNumber} • ${AppFormatters.formatTime(bill.saleDate)}',
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
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  StatusChip(
                    label: bill.paymentMethod.displayName,
                    type: bill.hasOutstandingCredit
                        ? StatusType.warning
                        : StatusType.success,
                    small: true,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Recent Purchases Section ─────────────────────────────────────────────────
class _RecentPurchasesSection extends StatelessWidget {
  final List<PurchaseBillModel> bills;
  const _RecentPurchasesSection({required this.bills});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      noPadding: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Recent Purchases', style: AppTypography.h3),
                    Text('Latest vendor bills', style: AppTypography.caption),
                  ],
                ),
                TextButton(
                  onPressed: () => context.go('/purchase'),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    foregroundColor: AppColors.secondary,
                  ),
                  child: Text('See all →',
                      style: AppTypography.label.copyWith(color: AppColors.secondary)),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          if (bills.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    const Icon(Icons.shopping_cart_outlined,
                        size: 36, color: AppColors.textDisabled),
                    const SizedBox(height: 8),
                    Text('No purchases yet', style: AppTypography.bodySmall),
                  ],
                ),
              ),
            )
          else
            ...bills.asMap().entries.map((entry) {
              final i = entry.key;
              final bill = entry.value;
              return Column(
                children: [
                  _PurchaseRow(bill: bill),
                  if (i < bills.length - 1)
                    const Divider(height: 1, color: AppColors.borderLight, indent: 68),
                ],
              );
            }),
        ],
      ),
    );
  }
}

class _PurchaseRow extends StatelessWidget {
  final PurchaseBillModel bill;
  const _PurchaseRow({required this.bill});

  @override
  Widget build(BuildContext context) {
    final initials = bill.partyName.isNotEmpty
        ? bill.partyName[0].toUpperCase()
        : '?';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/purchase/detail/${bill.id}', extra: bill),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.secondaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(initials,
                      style: AppTypography.label.copyWith(
                        color: AppColors.secondary,
                        fontWeight: FontWeight.w700,
                      )),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bill.partyName,
                        style: AppTypography.labelLarge,
                        overflow: TextOverflow.ellipsis),
                    Text(
                      '${bill.invoiceNumber} • ${AppFormatters.formatDate(bill.invoiceDate)}',
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
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  StatusChip(
                    label: bill.ledgerType.name.toUpperCase(),
                    type: bill.ledgerType == LedgerType.cash
                        ? StatusType.success
                        : bill.isPaid
                            ? StatusType.info
                            : StatusType.warning,
                    small: true,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
