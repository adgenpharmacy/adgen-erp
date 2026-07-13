import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/responsive.dart';

/// Standard screen scaffold used by all list/detail screens.
/// Handles responsive padding, safe area, and consistent header layout.
class ScreenShell extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final isMobile = Responsive.isMobile(context);
    final padding = Responsive.screenPadding(context);

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
                    crossAxisAlignment: CrossAxisAlignment.start,
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
                        const SizedBox(width: AppSpacing.lg),
                        action!,
                      ],
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
}
