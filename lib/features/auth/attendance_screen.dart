import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../shared/widgets/app_button.dart';

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authNotifierProvider);
    final now = DateTime.now();
    final dateStr = DateFormat('EEEE, dd MMMM yyyy').format(now);
    final timeStr = DateFormat('hh:mm a').format(now);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: userAsync.when(
          loading: () => const CircularProgressIndicator(color: AppColors.primary),
          error: (e, _) => Text('Error: $e'),
          data: (user) {
            if (user == null) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                context.go('/login');
              });
              return const SizedBox();
            }
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Success icon
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.successContainer,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.success.withValues(alpha: 0.2),
                        blurRadius: 32,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.check_circle_rounded,
                    color: AppColors.success,
                    size: 42,
                  ),
                )
                    .animate()
                    .scale(duration: 500.ms, curve: Curves.elasticOut),
                const SizedBox(height: AppSpacing.xxl),

                Text(
                  'Attendance Marked',
                  style: AppTypography.h2.copyWith(color: AppColors.success),
                ).animate(delay: 200.ms).fadeIn(),

                const SizedBox(height: AppSpacing.md),

                Text(
                  'Welcome, ${user.name} 👋',
                  style: AppTypography.h1,
                ).animate(delay: 300.ms).fadeIn().slideY(begin: 0.2, end: 0),

                const SizedBox(height: AppSpacing.sm),

                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xl,
                    vertical: AppSpacing.md,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusXl),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: AppSpacing.xl,
                    runSpacing: AppSpacing.sm,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.calendar_today_rounded,
                              color: AppColors.primary, size: 16),
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            dateStr,
                            style: AppTypography.bodySmall
                                .copyWith(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.access_time_rounded,
                              color: AppColors.primary, size: 16),
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            timeStr,
                            style: AppTypography.numericSmall
                                .copyWith(color: AppColors.primary),
                          ),
                        ],
                      ),
                    ],
                  ),
                ).animate(delay: 400.ms).fadeIn(),

                const SizedBox(height: AppSpacing.md),

                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.xs,
                  ),
                  decoration: BoxDecoration(
                    color: user.isOwner
                        ? AppColors.primaryContainer
                        : AppColors.surface2,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                  ),
                  child: Text(
                    user.isOwner ? '👑 Owner — Full Access' : '🧑‍💼 Staff — Limited Access',
                    style: AppTypography.label.copyWith(
                      color: user.isOwner ? AppColors.primaryLight : AppColors.textSecondary,
                    ),
                  ),
                ).animate(delay: 500.ms).fadeIn(),

                const SizedBox(height: AppSpacing.huge),

                AppButton(
                  label: 'Enter Dashboard',
                  icon: Icons.arrow_forward_rounded,
                  onPressed: () => context.go('/dashboard'),
                ).animate(delay: 600.ms).fadeIn().slideY(begin: 0.3, end: 0),
              ],
            );
          },
        ),
      ),
    );
  }
}
