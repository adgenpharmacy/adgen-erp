import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/responsive.dart';
import '../../../core/providers/auth_provider.dart';

/// Standard screen scaffold used by all list/detail screens.
/// Handles responsive padding, safe area, and consistent header layout.
class ScreenShell extends ConsumerWidget {
  final String title;
  final String? subtitle;
  final Widget? action;   // primary action button (desktop)
  final Widget? fab;      // FAB shown on mobile instead of header action
  final Widget body;
  final List<Widget>? headerExtras; // additional widgets below the title row

  const ScreenShell({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
    this.fab,
    required this.body,
    this.headerExtras,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isMobile = Responsive.isMobile(context);
    final padding = Responsive.screenPadding(context);
    final user = ref.watch(authNotifierProvider).value;

    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: isMobile && fab != null ? fab : null,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ─── Header ─────────────────────────────────────────────
            Padding(
              padding: EdgeInsets.fromLTRB(padding, padding, padding, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: isMobile
                                    ? AppTypography.h2
                                    : AppTypography.h1),
                            if (subtitle != null) ...[
                              const SizedBox(height: 2),
                              Text(subtitle!, style: AppTypography.bodySmall),
                            ],
                          ],
                        ),
                      ),
                      if (!isMobile && action != null) ...[
                        const SizedBox(width: AppSpacing.md),
                        action!,
                      ],
                      const SizedBox(width: AppSpacing.sm),
                      // ── Profile Avatar ─────────────────────────────
                      if (user != null)
                        GestureDetector(
                          onTap: () => _showProfileSheet(context, ref, user),
                          child: CircleAvatar(
                            radius: 18,
                            backgroundColor: user.isOwner
                                ? AppColors.primary
                                : AppColors.primaryContainer,
                            child: Text(
                              user.name.isNotEmpty
                                  ? user.name[0].toUpperCase()
                                  : '?',
                              style: TextStyle(
                                color: user.isOwner
                                    ? Colors.white
                                    : AppColors.primary,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  if (headerExtras != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    ...headerExtras!,
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  const Divider(height: 1, color: AppColors.border),
                ],
              ),
            ),

            // ─── Body ────────────────────────────────────────────────
            Expanded(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: padding),
                child: body,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showProfileSheet(BuildContext context, WidgetRef ref, dynamic user) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _ProfileSheet(user: user),
    );
  }
}

class _ProfileSheet extends ConsumerWidget {
  final dynamic user;
  const _ProfileSheet({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          // Avatar
          CircleAvatar(
            radius: 36,
            backgroundColor: user.isOwner
                ? AppColors.primary
                : AppColors.primaryContainer,
            child: Text(
              user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
              style: TextStyle(
                color: user.isOwner ? Colors.white : AppColors.primary,
                fontWeight: FontWeight.w800,
                fontSize: 28,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          Text(user.name, style: AppTypography.h2, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(user.email,
              style: AppTypography.bodySmall, textAlign: TextAlign.center),

          if (user.designation.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(user.designation,
                style: AppTypography.caption, textAlign: TextAlign.center),
          ],

          const SizedBox(height: AppSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: user.isOwner
                  ? AppColors.primary.withValues(alpha: 0.1)
                  : AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              user.isOwner ? '👑 Owner' : '🧑‍💼 Employee',
              style: AppTypography.caption.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

          const SizedBox(height: AppSpacing.xl),
          const Divider(),
          const SizedBox(height: AppSpacing.md),

          // Logout
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                Navigator.pop(context);
                await ref.read(authNotifierProvider.notifier).signOut();
                if (context.mounted) context.go('/login');
              },
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Log Out'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );
  }
}
