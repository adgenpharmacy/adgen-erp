import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/attendance_screen.dart';
import '../../features/auth/setup_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/parties/parties_screen.dart';
import '../../features/parties/add_party_screen.dart';
import '../../features/products/products_screen.dart';
import '../../features/products/add_product_screen.dart';
import '../../features/purchase/purchase_list_screen.dart';
import '../../features/purchase/purchase_entry_screen.dart';
import '../../features/purchase/purchase_detail_screen.dart';
import '../../features/purchase/purchase_return_screen.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../features/sales/sales_list_screen.dart';
import '../../features/sales/sales_entry_screen.dart';
import '../../features/sales/invoice_preview_screen.dart';
import '../../features/sales/sales_detail_screen.dart';
import '../../features/sales/sale_return_screen.dart';
import '../../features/inventory/inventory_screen.dart';
import '../../features/inventory/inventory_detail_screen.dart';
import '../../features/inventory/stock_correction_screen.dart';
import '../../shared/models/inventory_batch_model.dart' as inv;
import '../../features/accounts/ledger_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/customers/customers_screen.dart';
import '../../features/ai/ai_screen.dart';
import '../../features/admin/admin_screen.dart';
import '../../features/admin/user_detail_screen.dart';
import '../../shared/widgets/app_sidebar.dart';
import '../providers/auth_provider.dart';

// Listenable that bridges Riverpod auth state into GoRouter's refreshListenable
class _AuthStateNotifier extends ChangeNotifier {
  _AuthStateNotifier(this._ref) {
    _ref.listen<AsyncValue<dynamic>>(
      authNotifierProvider,
      (_, __) => notifyListeners(),
    );
  }
  final Ref _ref;
}

final _authListenableProvider = Provider<_AuthStateNotifier>((ref) {
  return _AuthStateNotifier(ref);
});

final appRouterProvider = Provider<GoRouter>((ref) {
  final authListenable = ref.watch(_authListenableProvider);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: authListenable,
    redirect: (context, state) {
      final authState = ref.read(authNotifierProvider);
      final isLoggedIn = authState.value != null;
      final isLoading = authState.isLoading;
      final loc = state.matchedLocation;
      final isLoginRoute = loc == '/login';
      final isSetupRoute = loc == '/setup';
      final isSplashRoute = loc == '/splash';

      // While auth is resolving, stay on splash
      if (isLoading) return isSplashRoute ? null : '/splash';
      // Auth resolved — leave splash
      if (isSplashRoute) return isLoggedIn ? '/attendance' : '/login';
      if (!isLoggedIn && !isLoginRoute && !isSetupRoute) return '/login';
      if (isLoggedIn && isLoginRoute) return '/attendance';
      return null;
    },

    routes: [
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (context, state) => const _SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/setup',
        name: 'setup',
        builder: (context, state) => const SetupScreen(),
      ),
      GoRoute(
        path: '/attendance',
        name: 'attendance',
        builder: (context, state) => const AttendanceScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/parties',
            name: 'parties',
            builder: (context, state) => const PartiesScreen(),
            routes: [
              GoRoute(
                path: 'add',
                name: 'add-party',
                builder: (context, state) {
                  final partyId = state.extra as String?;
                  return AddPartyScreen(partyId: partyId);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/products',
            name: 'products',
            builder: (context, state) => const ProductsScreen(),
            routes: [
              GoRoute(
                path: 'add',
                name: 'add-product',
                builder: (context, state) => const AddProductScreen(),
              ),
              GoRoute(
                path: 'edit/:id',
                name: 'edit-product',
                builder: (context, state) =>
                    AddProductScreen(productId: state.pathParameters['id']),
              ),
            ],
          ),
          GoRoute(
            path: '/purchase',
            name: 'purchase',
            builder: (context, state) => const PurchaseListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                name: 'new-purchase',
                builder: (context, state) => const PurchaseEntryScreen(),
              ),
              GoRoute(
                path: 'edit/:id',
                name: 'edit-purchase',
                builder: (context, state) =>
                    PurchaseEntryScreen(billId: state.pathParameters['id']),
              ),
              GoRoute(
                path: 'detail/:id',
                name: 'purchase-detail',
                builder: (context, state) {
                  final bill = state.extra as PurchaseBillModel;
                  return PurchaseDetailScreen(bill: bill);
                },
              ),
              GoRoute(
                path: 'return/:id',
                name: 'purchase-return',
                builder: (context, state) {
                  final bill = state.extra as PurchaseBillModel;
                  return PurchaseReturnScreen(originalBill: bill);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/sales',
            name: 'sales',
            builder: (context, state) => const SalesListScreen(),
            routes: [
              GoRoute(
                path: 'new',
                name: 'new-sale',
                builder: (context, state) => const SalesEntryScreen(),
              ),
              GoRoute(
                path: 'edit/:id',
                name: 'edit-sale',
                builder: (context, state) =>
                    SalesEntryScreen(billId: state.pathParameters['id']),
              ),
              GoRoute(
                path: 'invoice/:id',
                name: 'invoice',
                builder: (context, state) =>
                    InvoicePreviewScreen(billId: state.pathParameters['id']!),
              ),
              GoRoute(
                path: 'detail/:id',
                name: 'sale-detail',
                builder: (context, state) {
                  final bill = state.extra as SalesBillModel;
                  return SalesDetailScreen(bill: bill);
                },
              ),
              GoRoute(
                path: 'return/:id',
                name: 'sale-return',
                builder: (context, state) {
                  final bill = state.extra as SalesBillModel;
                  return SaleReturnScreen(originalBill: bill);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/inventory',
            name: 'inventory',
            builder: (context, state) => const InventoryScreen(),
            routes: [
              GoRoute(
                path: 'detail/:id',
                name: 'inventory-detail',
                builder: (context, state) => InventoryDetailScreen(
                  productId: state.pathParameters['id']!,
                  initialData: state.extra as inv.InventoryModel?,
                ),
              ),
              GoRoute(
                path: 'correct/:id',
                name: 'stock-correction',
                builder: (context, state) =>
                    StockCorrectionScreen(productId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: '/ledger',
            name: 'ledger',
            builder: (context, state) => const LedgerScreen(),
          ),
          GoRoute(
            path: '/reports',
            name: 'reports',
            builder: (context, state) => const ReportsScreen(),
          ),
          GoRoute(
            path: '/customers',
            name: 'customers',
            builder: (context, state) => const CustomersScreen(),
          ),
          GoRoute(
            path: '/ai',
            name: 'ai',
            builder: (context, state) => const AiScreen(),
          ),
          GoRoute(
            path: '/admin',
            name: 'admin',
            builder: (context, state) => const AdminScreen(),
            routes: [
              GoRoute(
                path: 'user/:uid',
                name: 'user-detail',
                builder: (context, state) =>
                    UserDetailScreen(uid: state.pathParameters['uid']!),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

// ─── Main Shell with Responsive Navigation ────────────────────────────────────
class MainShell extends ConsumerWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  static const _routes = [
    '/dashboard',
    '/sales',
    '/purchase',
    '/inventory',
    '/ledger',
  ];

  static const _bottomNavItems = [
    BottomNavigationBarItem(
      icon: Icon(Icons.dashboard_rounded),
      label: 'Dashboard',
    ),
    BottomNavigationBarItem(
      icon: Icon(Icons.point_of_sale_rounded),
      label: 'Sales',
    ),
    BottomNavigationBarItem(
      icon: Icon(Icons.shopping_cart_rounded),
      label: 'Purchase',
    ),
    BottomNavigationBarItem(
      icon: Icon(Icons.inventory_2_rounded),
      label: 'Inventory',
    ),
    BottomNavigationBarItem(
      icon: Icon(Icons.account_balance_wallet_rounded),
      label: 'Accounts',
    ),
    BottomNavigationBarItem(
      icon: Icon(Icons.grid_view_rounded),
      label: 'More',
    ),
  ];

  void _showMoreSheet(BuildContext context, WidgetRef ref) {
    final currentUser = ref.read(authNotifierProvider).value;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 24,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text('More Modules',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                      color: Colors.grey.shade800)),
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              mainAxisSpacing: 12,
              crossAxisSpacing: 8,
              children: [
                _MoreItem(icon: Icons.people_rounded, label: 'Parties',
                    color: AppColors.primary,
                    onTap: () { Navigator.pop(context); context.go('/parties'); }),
                _MoreItem(icon: Icons.medication_rounded, label: 'Products',
                    color: const Color(0xFF0EA5E9),
                    onTap: () { Navigator.pop(context); context.go('/products'); }),
                _MoreItem(icon: Icons.person_rounded, label: 'Customers',
                    color: const Color(0xFF7C3AED),
                    onTap: () { Navigator.pop(context); context.go('/customers'); }),
                _MoreItem(icon: Icons.bar_chart_rounded, label: 'Reports',
                    color: const Color(0xFFEA580C),
                    onTap: () { Navigator.pop(context); context.go('/reports'); }),
                _MoreItem(icon: Icons.auto_awesome_rounded, label: 'AI',
                    color: const Color(0xFF0284C7),
                    onTap: () { Navigator.pop(context); context.go('/ai'); }),
                if (currentUser?.isOwner ?? false)
                  _MoreItem(icon: Icons.admin_panel_settings_rounded, label: 'Admin',
                      color: const Color(0xFFDC2626),
                      onTap: () { Navigator.pop(context); context.go('/admin'); }),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final width = MediaQuery.of(context).size.width;
    final isMobile = width < 600;

    if (isMobile) {
      final currentLocation = GoRouterState.of(context).matchedLocation;
      int currentIndex = _routes.indexWhere(
        (r) => currentLocation.startsWith(r),
      );
      if (currentIndex < 0) currentIndex = 0;

      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: child,
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
              top: BorderSide(color: Colors.grey.shade200, width: 1),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: BottomNavigationBar(
            currentIndex: currentIndex,
            onTap: (i) {
              if (i == 5) {
                _showMoreSheet(context, ref);
              } else {
                context.go(_routes[i]);
              }
            },
            type: BottomNavigationBarType.fixed,
            backgroundColor: Colors.transparent,
            elevation: 0,
            selectedItemColor: AppColors.primary,
            unselectedItemColor: AppColors.textMuted,
            selectedLabelStyle: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              fontFamily: 'Inter',
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w400,
              fontFamily: 'Inter',
            ),
            items: _bottomNavItems,
          ),
        ),
      );
    }

    // Tablet / Desktop: sidebar
    return Row(
      children: [
        const AppSidebar(),
        Expanded(child: child),
      ],
    );
  }
}

// ── More sheet item ────────────────────────────────────────────────────────────
class _MoreItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _MoreItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.2)),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 6),
          Text(label,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w500,
                  color: Colors.grey.shade700)),
        ],
      ),
    );
  }
}

// ─── Splash Screen (shown during Firebase auth init) ─────────────────────────
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF047857), // AppColors.primary
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // App icon / logo
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(
                Icons.local_pharmacy_rounded,
                color: Colors.white,
                size: 48,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'AdGen Pharmacy ERP',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
                fontFamily: 'Inter',
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Loading...',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontSize: 13,
                fontFamily: 'Inter',
              ),
            ),
            const SizedBox(height: 40),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(
                  Colors.white.withValues(alpha: 0.8),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

