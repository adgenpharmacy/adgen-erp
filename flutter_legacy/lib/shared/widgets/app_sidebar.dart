import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/app_version.dart';

class AppSidebar extends ConsumerStatefulWidget {
  const AppSidebar({super.key});

  @override
  ConsumerState<AppSidebar> createState() => _AppSidebarState();
}

class _AppSidebarState extends ConsumerState<AppSidebar> {
  bool _isCollapsed = false;

  static const _navItems = [
    _NavItem(icon: Icons.dashboard_rounded, label: 'Dashboard', route: '/dashboard'),
    _NavItem(icon: Icons.shopping_cart_rounded, label: 'Purchase', route: '/purchase'),
    _NavItem(icon: Icons.point_of_sale_rounded, label: 'Sales', route: '/sales'),
    _NavItem(icon: Icons.inventory_2_rounded, label: 'Inventory', route: '/inventory'),
    _NavItem(icon: Icons.medication_rounded, label: 'Products', route: '/products'),
    _NavItem(icon: Icons.people_rounded, label: 'Parties', route: '/parties'),
    _NavItem(icon: Icons.person_rounded, label: 'Customers', route: '/customers'),
    _NavItem(icon: Icons.account_balance_wallet_rounded, label: 'Accounts', route: '/ledger'),
    _NavItem(icon: Icons.bar_chart_rounded, label: 'Reports', route: '/reports'),
    _NavItem(icon: Icons.auto_awesome_rounded, label: 'AdGen AI', route: '/ai'),
  ];

  static const _ownerNavItems = [
    _NavItem(icon: Icons.admin_panel_settings_rounded, label: 'Admin', route: '/admin'),
  ];

  @override
  Widget build(BuildContext context) {
    final currentRoute = GoRouterState.of(context).matchedLocation;
    final userAsync = ref.watch(authNotifierProvider);
    final user = userAsync.value;
    final width = _isCollapsed ? AppSpacing.sidebarCollapsedWidth : AppSpacing.sidebarWidth;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeInOut,
      width: width,
      decoration: BoxDecoration(
        color: AppColors.sidebarBg,
        border: const Border(
          right: BorderSide(color: AppColors.border, width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF059669).withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(4, 0),
          ),
        ],
      ),
      child: Column(
        children: [
          // ─── Logo & Toggle ──────────────────────────────────────────────
          _buildHeader(),
          const SizedBox(height: AppSpacing.sm),

          // ─── Navigation Items ───────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Column(
                children: [
                  ..._navItems.map((item) {
                    final isActive = currentRoute.startsWith(item.route);
                    return _NavItemWidget(
                      item: item,
                      isActive: isActive,
                      isCollapsed: _isCollapsed,
                      onTap: () => context.go(item.route),
                    );
                  }),
                  if (user?.isOwner ?? false) ...[
                    if (!_isCollapsed)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 8),
                        child: Row(
                          children: [
                            Text('ADMIN', style: TextStyle(
                              fontSize: 9, fontWeight: FontWeight.w700,
                              color: AppColors.textMuted, letterSpacing: 1.2)),
                            SizedBox(width: 8),
                            Expanded(child: Divider(height: 1, color: AppColors.border)),
                          ],
                        ),
                      ),
                    ..._ownerNavItems.map((item) {
                      final isActive = currentRoute.startsWith(item.route);
                      return _NavItemWidget(
                        item: item,
                        isActive: isActive,
                        isCollapsed: _isCollapsed,
                        onTap: () => context.go(item.route),
                      );
                    }),
                  ],
                ],
              ),
            ),
          ),

          // ─── User Profile & Logout ──────────────────────────────────────
          _buildFooter(user, context),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      height: 64,
      padding: EdgeInsets.symmetric(
        horizontal: _isCollapsed ? AppSpacing.sm : AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.secondary],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(10),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: const Icon(Icons.local_pharmacy_rounded, color: Colors.white, size: 18),
          ),
          if (!_isCollapsed) ...[
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'AdGen ERP',
                    style: AppTypography.h4,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    'Pharmacy Management',
                    style: AppTypography.caption,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => setState(() => _isCollapsed = !_isCollapsed),
              child: Container(
                padding: const EdgeInsets.all(6),
                child: Icon(
                  _isCollapsed
                      ? Icons.chevron_right_rounded
                      : Icons.chevron_left_rounded,
                  color: AppColors.textMuted,
                  size: 20,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(dynamic user, BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        children: [
          if (!_isCollapsed && user != null)
            Container(
              padding: const EdgeInsets.all(AppSpacing.sm),
              margin: const EdgeInsets.only(bottom: AppSpacing.sm),
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: AppColors.primaryContainer,
                    child: Text(
                      user.name.isNotEmpty ? user.name[0].toUpperCase() : 'U',
                      style: AppTypography.label.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.name,
                          style: AppTypography.labelLarge,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Container(
                          margin: const EdgeInsets.only(top: 2),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: user.isOwner
                                ? AppColors.primaryContainer
                                : AppColors.secondaryContainer,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                          ),
                          child: Text(
                            user.isOwner ? '👑 Owner' : '👤 Staff',
                            style: AppTypography.labelSmall.copyWith(
                              color: user.isOwner
                                  ? AppColors.primaryDark
                                  : AppColors.secondaryDark,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            child: InkWell(
              onTap: () => _confirmLogout(context),
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  mainAxisAlignment: _isCollapsed
                      ? MainAxisAlignment.center
                      : MainAxisAlignment.start,
                  children: [
                    const Icon(Icons.logout_rounded, color: AppColors.error, size: 18),
                    if (!_isCollapsed) ...[
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        'Logout',
                        style: AppTypography.label.copyWith(color: AppColors.error),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          
          // ─── Version Info ────────────────────────────────────────────────
          if (!_isCollapsed)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                AppVersion.displayVersion,
                style: AppTypography.labelSmall.copyWith(
                  color: AppColors.textMuted,
                  fontSize: 10,
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text(
          'Are you sure you want to sign out?\nYour data is saved to the cloud.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await ref.read(authNotifierProvider.notifier).signOut();
              if (context.mounted) context.go('/login');
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;
  final String route;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.route,
  });
}

class _NavItemWidget extends StatelessWidget {
  final _NavItem item;
  final bool isActive;
  final bool isCollapsed;
  final VoidCallback onTap;

  const _NavItemWidget({
    required this.item,
    required this.isActive,
    required this.isCollapsed,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: isCollapsed ? item.label : '',
      preferBelow: false,
      child: Container(
        margin: const EdgeInsets.only(bottom: 2),
        decoration: isActive
            ? BoxDecoration(
                color: AppColors.sidebarActive,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
              )
            : null,
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            hoverColor: AppColors.surface2,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: EdgeInsets.symmetric(
                horizontal: isCollapsed ? AppSpacing.sm : AppSpacing.md,
                vertical: 10,
              ),
              child: Row(
                mainAxisAlignment:
                    isCollapsed ? MainAxisAlignment.center : MainAxisAlignment.start,
                children: [
                  // Active left indicator
                  if (isActive && !isCollapsed)
                    Container(
                      width: 3,
                      height: 18,
                      margin: const EdgeInsets.only(right: AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  Icon(
                    item.icon,
                    color: isActive ? AppColors.primary : AppColors.textMuted,
                    size: 20,
                  ),
                  if (!isCollapsed) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        item.label,
                        style: isActive
                            ? AppTypography.labelLarge.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                              )
                            : AppTypography.labelLarge.copyWith(
                                color: AppColors.textSecondary,
                              ),
                      ),
                    ),
                    if (item.label == 'AdGen AI')
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.primary, AppColors.secondary],
                          ),
                          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                        ),
                        child: Text(
                          'AI',
                          style: AppTypography.labelSmall.copyWith(
                            color: Colors.white,
                            fontSize: 9,
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
