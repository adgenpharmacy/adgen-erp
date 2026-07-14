import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/admin_provider.dart';
import '../../shared/models/attendance_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/screen_shell.dart';
import '../../shared/widgets/status_chip.dart';

class UserDetailScreen extends ConsumerWidget {
  final String uid;
  const UserDetailScreen({super.key, required this.uid});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(allUsersProvider);
    final attendanceAsync = ref.watch(attendanceByUserProvider(uid));

    return usersAsync.when(
      loading: () => const Scaffold(
          body: Center(
              child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2))),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (users) {
        final user = users.where((u) => u.uid == uid).firstOrNull;
        if (user == null) {
          return Scaffold(
            appBar: AppBar(
              leading: IconButton(
                  onPressed: () => context.pop(),
                  icon: const Icon(Icons.arrow_back_rounded)),
              title: const Text('User Not Found'),
            ),
            body: const Center(child: Text('User not found')),
          );
        }

        return ScreenShell(
          title: user.name,
          subtitle: user.designation.isEmpty ? user.email : user.designation,
          body: attendanceAsync.when(
            loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (records) {
              // Compute total working hours
              Duration totalDuration = Duration.zero;
              for (final r in records) {
                if (r.sessionDuration != null) {
                  totalDuration += r.sessionDuration!;
                }
              }
              final totalHours = totalDuration.inHours;
              final totalMin = totalDuration.inMinutes.remainder(60);

              // Group records by date
              final byDate = <String, List<AttendanceModel>>{};
              for (final r in records) {
                byDate.putIfAbsent(r.date, () => []).add(r);
              }
              final dates = byDate.keys.toList()..sort((a, b) => b.compareTo(a));

              return ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  // ── Profile Card ──────────────────────────────────────
                  AppCard(
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    child: Column(children: [
                      CircleAvatar(
                        radius: 36,
                        backgroundColor: user.isOwner ? AppColors.primary : AppColors.primaryContainer,
                        child: Text(
                          user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                          style: const TextStyle(
                              fontSize: 28, color: Colors.white, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(user.name, style: AppTypography.h2),
                      if (user.designation.isNotEmpty)
                        Text(user.designation, style: AppTypography.bodySmall),
                      Text(user.email, style: AppTypography.caption),
                      if (user.phone.isNotEmpty) Text(user.phone, style: AppTypography.caption),
                      const SizedBox(height: AppSpacing.md),
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        StatusChip(
                          label: user.isOwner ? 'Owner' : 'Employee',
                          type: user.isOwner ? StatusType.info : StatusType.success,
                        ),
                        const SizedBox(width: 8),
                        StatusChip(
                          label: user.isActive ? 'Active' : 'Inactive',
                          type: user.isActive ? StatusType.success : StatusType.error,
                        ),
                      ]),
                    ]),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // ── Attendance Summary ────────────────────────────────
                  AppCard(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Row(children: [
                      _StatItem(
                          label: 'Days Present',
                          value: dates.length.toString(),
                          icon: Icons.calendar_month_rounded,
                          color: AppColors.primary),
                      const VerticalDivider(thickness: 1),
                      _StatItem(
                          label: 'Total Hours',
                          value: '${totalHours}h ${totalMin}m',
                          icon: Icons.access_time_rounded,
                          color: AppColors.success),
                      const VerticalDivider(thickness: 1),
                      _StatItem(
                          label: 'Sessions',
                          value: records.length.toString(),
                          icon: Icons.login_rounded,
                          color: AppColors.warning),
                    ]),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  if (dates.isNotEmpty) ...[
                    Text('Hours Worked', style: AppTypography.h3),
                    const SizedBox(height: AppSpacing.md),
                    AppCard(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: SizedBox(
                        height: 200,
                        child: _buildAttendanceChart(byDate, dates),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  if (dates.isEmpty) ...[
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.xxl),
                        child: Column(children: [
                          const Icon(Icons.calendar_today_outlined,
                              size: 36, color: AppColors.textMuted),
                          const SizedBox(height: AppSpacing.md),
                          Text('No attendance records yet', style: AppTypography.bodySmall),
                        ]),
                      ),
                    ),
                  ] else ...[
                    Text('Attendance History', style: AppTypography.h3),
                    const SizedBox(height: AppSpacing.md),
                    ...dates.map((date) {
                      final dayRecords = byDate[date]!;
                      final dayDur = dayRecords.fold(Duration.zero, (acc, r) {
                        if (r.sessionDuration != null) return acc + r.sessionDuration!;
                        return acc;
                      });
                      final formatted = DateFormat('EEE, dd MMM yyyy').format(
                          DateTime.parse(date));
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: AppCard(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Text(formatted, style: AppTypography.labelLarge),
                              const Spacer(),
                              if (dayDur.inMinutes > 0)
                                Text(
                                  '${dayDur.inHours}h ${dayDur.inMinutes.remainder(60)}m',
                                  style: AppTypography.numericSmall.copyWith(
                                      color: AppColors.primary),
                                ),
                            ]),
                            const Divider(height: 16),
                            ...dayRecords.map((r) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(children: [
                                const Icon(Icons.login_rounded,
                                    size: 14, color: AppColors.success),
                                const SizedBox(width: 4),
                                Text(DateFormat('h:mm a').format(r.loginTime),
                                    style: AppTypography.caption),
                                const SizedBox(width: 8),
                                const Icon(Icons.logout_rounded,
                                    size: 14, color: AppColors.error),
                                const SizedBox(width: 4),
                                Text(
                                  r.logoutTime != null
                                      ? DateFormat('h:mm a').format(r.logoutTime!)
                                      : 'Active',
                                  style: AppTypography.caption.copyWith(
                                    color: r.logoutTime == null ? AppColors.success : null,
                                  ),
                                ),
                                const Spacer(),
                                if (r.sessionDuration != null)
                                  Text(r.formattedDuration, style: AppTypography.caption),
                              ]),
                            )),
                          ]),
                        ),
                      );
                    }),
                  ],
                ],
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildAttendanceChart(Map<String, List<AttendanceModel>> byDate, List<String> dates) {
    // Show up to last 7 days from the records
    final latestDates = dates.take(7).toList().reversed.toList();
    
    if (latestDates.isEmpty) return const SizedBox();

    double maxY = 1.0;
    final List<BarChartGroupData> barGroups = [];
    
    for (int i = 0; i < latestDates.length; i++) {
      final date = latestDates[i];
      final records = byDate[date]!;
      final totalDuration = records.fold(Duration.zero, (acc, r) {
        if (r.sessionDuration != null) return acc + r.sessionDuration!;
        return acc;
      });
      final hours = totalDuration.inMinutes / 60.0;
      if (hours > maxY) maxY = hours;
      
      barGroups.add(
        BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: hours,
              color: AppColors.primary,
              width: 16,
              borderRadius: BorderRadius.circular(4),
              backDrawRodData: BackgroundBarChartRodData(
                show: true,
                toY: 12, // Max likely hours
                color: AppColors.surface2,
              ),
            )
          ],
        )
      );
    }

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: maxY < 4 ? 4 : maxY + 1,
        barTouchData: BarTouchData(enabled: false),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                if (value.toInt() >= 0 && value.toInt() < latestDates.length) {
                  final dt = DateTime.parse(latestDates[value.toInt()]);
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(DateFormat('E').format(dt), style: AppTypography.caption),
                  );
                }
                return const SizedBox();
              },
              reservedSize: 30,
            ),
          ),
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        barGroups: barGroups,
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatItem({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 4),
        Text(value, style: AppTypography.numericSmall.copyWith(color: color)),
        Text(label, style: AppTypography.caption, textAlign: TextAlign.center),
      ]),
    );
  }
}
