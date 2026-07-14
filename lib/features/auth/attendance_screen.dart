import 'dart:async';
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

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(authNotifierProvider);
    final myAttnAsync = ref.watch(myTodayAttendanceProvider);
    final now = DateTime.now();
    final dateStr = DateFormat('EEEE, dd MMMM yyyy').format(now);

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

            return myAttnAsync.when(
              loading: () => const CircularProgressIndicator(),
              error: (e, _) => Text('Error: $e'),
              data: (attendance) {
                final bool isClockedIn = attendance != null && attendance.logoutTime == null;
                
                Duration activeDuration = Duration.zero;
                if (isClockedIn) {
                  activeDuration = now.difference(attendance.loginTime);
                } else if (attendance?.logoutTime != null) {
                  activeDuration = attendance!.logoutTime!.difference(attendance.loginTime);
                }

                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Staff Portal', style: AppTypography.h3.copyWith(color: AppColors.textMuted)),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Welcome, ${user.name} 👋',
                      style: AppTypography.h1,
                    ).animate().fadeIn().slideY(begin: -0.2, end: 0),
                    
                    const SizedBox(height: AppSpacing.md),
                    
                    Text(dateStr, style: AppTypography.body),
                    
                    const SizedBox(height: AppSpacing.xxl),

                    // Clock Widget
                    Container(
                      width: 250,
                      height: 250,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isClockedIn ? AppColors.primaryContainer : AppColors.surface,
                        border: Border.all(
                          color: isClockedIn ? AppColors.primary : AppColors.border,
                          width: isClockedIn ? 4 : 2,
                        ),
                        boxShadow: isClockedIn ? [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.3),
                            blurRadius: 40,
                            spreadRadius: 10,
                          )
                        ] : [],
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            isClockedIn ? Icons.timer_rounded : Icons.timer_off_rounded,
                            size: 48,
                            color: isClockedIn ? AppColors.primary : AppColors.textMuted,
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            _formatDuration(activeDuration),
                            style: AppTypography.h1.copyWith(
                              fontSize: 32,
                              color: isClockedIn ? AppColors.primary : AppColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            isClockedIn ? 'Active Time' : (attendance != null ? 'Total Time Today' : 'Not Clocked In'),
                            style: AppTypography.caption,
                          ),
                        ],
                      ),
                    ).animate(target: isClockedIn ? 1 : 0).scale(duration: 300.ms, curve: Curves.easeOutBack),

                    const SizedBox(height: AppSpacing.xxl),

                    if (isClockedIn)
                      ElevatedButton.icon(
                        onPressed: () => ref.read(authNotifierProvider.notifier).clockOut(),
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('CLOCK OUT'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error,
                          foregroundColor: AppColors.errorContainer,
                          padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
                          textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
                        ),
                      ).animate().fadeIn().slideY()
                    else
                      ElevatedButton.icon(
                        onPressed: () => ref.read(authNotifierProvider.notifier).clockIn(),
                        icon: const Icon(Icons.login_rounded),
                        label: const Text('CLOCK IN'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.success,
                          foregroundColor: AppColors.successContainer,
                          padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
                          textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
                        ),
                      ).animate().fadeIn().slideY(),

                    const SizedBox(height: AppSpacing.huge),
                    
                    AppButton(
                      label: 'Enter Dashboard',
                      icon: Icons.arrow_forward_rounded,
                      onPressed: () => context.go('/dashboard'),
                    ).animate(delay: 200.ms).fadeIn(),
                  ],
                );
              }
            );
          },
        ),
      ),
    );
  }
}
