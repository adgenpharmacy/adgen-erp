import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/admin_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../shared/models/user_model.dart';
import '../../shared/models/attendance_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/screen_shell.dart';
import '../../shared/widgets/status_chip.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(authNotifierProvider).value;
    if (currentUser == null || !currentUser.isOwner) {
      return const Scaffold(
        body: Center(child: Text('Access denied — Admin only')),
      );
    }

    final usersAsync = ref.watch(allUsersProvider);
    final pendingAsync = ref.watch(pendingUsersProvider);
    final todayAttn = ref.watch(todayAttendanceProvider);

    final pendingCount = pendingAsync.valueOrNull?.length ?? 0;

    return ScreenShell(
      title: 'Admin Panel',
      subtitle: 'Employee management & attendance',
      headerExtras: [
        TabBar(
          controller: _tabCtrl,
          labelStyle: AppTypography.label.copyWith(fontWeight: FontWeight.w700),
          unselectedLabelStyle: AppTypography.label,
          indicatorColor: AppColors.primary,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorWeight: 3,
          tabs: [
            const Tab(text: 'Employees'),
            Tab(
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Text('Pending'),
                if (pendingCount > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.warning,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text('$pendingCount',
                        style: const TextStyle(
                            fontSize: 10, color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                ],
              ]),
            ),
            const Tab(text: 'Attendance'),
          ],
        ),
      ],
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          // ── Tab 1: All Employees ─────────────────────────────────────
          usersAsync.when(
            loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (users) {
              final employees = users.where((u) => !u.isPending).toList();
              if (employees.isEmpty) {
                return const Center(child: Text('No employees yet'));
              }
              return ListView.separated(
                padding: const EdgeInsets.all(AppSpacing.lg),
                itemCount: employees.length,
                separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                itemBuilder: (_, i) => _EmployeeCard(
                  user: employees[i],
                  onTap: () => context.push('/admin/user/${employees[i].uid}'),
                  onToggle: (active) async {
                    final error = await ref
                        .read(adminNotifierProvider.notifier)
                        .toggleUserActive(employees[i].uid, active);
                    if (error != null && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text('Error: $error'),
                          backgroundColor: AppColors.error));
                    }
                  },
                ),
              );
            },
          ),

          // ── Tab 2: Pending Approvals ─────────────────────────────────
          pendingAsync.when(
            loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (pending) {
              if (pending.isEmpty) {
                return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: const BoxDecoration(
                          color: AppColors.surface2, shape: BoxShape.circle),
                      child: const Icon(Icons.check_circle_outline_rounded,
                          size: 36, color: AppColors.success),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('No pending approvals', style: AppTypography.h3),
                    const SizedBox(height: AppSpacing.sm),
                    Text('All registration requests have been reviewed',
                        style: AppTypography.bodySmall, textAlign: TextAlign.center),
                  ]),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(AppSpacing.lg),
                itemCount: pending.length,
                separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                itemBuilder: (_, i) => _PendingUserCard(
                  user: pending[i],
                  onApprove: () async {
                    final error = await ref
                        .read(adminNotifierProvider.notifier)
                        .approveUser(pending[i].uid);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text(error ?? 'User approved ✓'),
                          backgroundColor:
                              error != null ? AppColors.error : AppColors.success));
                    }
                  },
                  onReject: () async {
                    final error = await ref
                        .read(adminNotifierProvider.notifier)
                        .rejectUser(pending[i].uid);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text(error ?? 'Request rejected'),
                          backgroundColor:
                              error != null ? AppColors.error : AppColors.textSecondary));
                    }
                  },
                ),
              );
            },
          ),

          // ── Tab 3: Today's Attendance ────────────────────────────────
          todayAttn.when(
            loading: () => const Center(
                child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (records) {
              if (records.isEmpty) {
                return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.people_outline_rounded,
                        size: 36, color: AppColors.textMuted),
                    const SizedBox(height: AppSpacing.md),
                    Text('No attendance today', style: AppTypography.bodySmall),
                  ]),
                );
              }

              // Group by user for deduplicated summary
              final byUser = <String, List<AttendanceModel>>{};
              for (final r in records) {
                byUser.putIfAbsent(r.uid, () => []).add(r);
              }

              return ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  // Summary row
                  AppCard(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Row(children: [
                      _AttendanceStat(
                        label: 'Present', value: byUser.length.toString(),
                        color: AppColors.success, icon: Icons.check_circle_rounded),
                      const VerticalDivider(thickness: 1),
                      _AttendanceStat(
                        label: 'Sessions', value: records.length.toString(),
                        color: AppColors.primary, icon: Icons.login_rounded),
                      const VerticalDivider(thickness: 1),
                      _AttendanceStat(
                        label: 'Active',
                        value: records.where((r) => r.logoutTime == null).length.toString(),
                        color: AppColors.warning, icon: Icons.access_time_rounded),
                    ]),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  Text('Sessions', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.md),

                  ...records.map((r) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _AttendanceRecord(record: r),
                  )),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Employee Card ─────────────────────────────────────────────────────────────
class _EmployeeCard extends StatelessWidget {
  final UserModel user;
  final VoidCallback onTap;
  final ValueChanged<bool> onToggle;

  const _EmployeeCard({
    required this.user,
    required this.onTap,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(children: [
        // Avatar
        CircleAvatar(
          radius: 22,
          backgroundColor: user.isOwner ? AppColors.primary : AppColors.primaryContainer,
          child: Text(
            user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
            style: AppTypography.h3.copyWith(
              color: user.isOwner ? Colors.white : AppColors.primary,
              fontSize: 16,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(user.name, style: AppTypography.labelLarge,
                    overflow: TextOverflow.ellipsis),
              ),
              StatusChip(
                label: user.isOwner ? 'Owner' : 'Employee',
                type: user.isOwner ? StatusType.info : StatusType.success,
                small: true,
              ),
            ]),
            Text(user.email, style: AppTypography.caption, overflow: TextOverflow.ellipsis),
            if (user.designation.isNotEmpty)
              Text(user.designation, style: AppTypography.caption),
          ]),
        ),
        const SizedBox(width: AppSpacing.sm),
        if (!user.isOwner)
          Switch(
            value: user.isActive,
            onChanged: onToggle,
            activeThumbColor: AppColors.primary,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
      ]),
    );
  }
}

// ── Pending User Card ─────────────────────────────────────────────────────────
class _PendingUserCard extends StatelessWidget {
  final UserModel user;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _PendingUserCard({
    required this.user,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: AppColors.warningContainer,
            child: Text(
              user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
              style: AppTypography.h3.copyWith(
                  color: AppColors.warning, fontSize: 16),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user.name, style: AppTypography.labelLarge),
              Text(user.email, style: AppTypography.caption),
              if (user.designation.isNotEmpty)
                Text(user.designation, style: AppTypography.caption),
            ]),
          ),
          StatusChip(label: 'Pending', type: StatusType.warning, small: true),
        ]),
        const SizedBox(height: AppSpacing.md),
        Text(
          'Registered ${DateFormat('dd MMM yyyy, h:mm a').format(user.createdAt)}',
          style: AppTypography.caption,
        ),
        const SizedBox(height: AppSpacing.md),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onReject,
              icon: const Icon(Icons.close_rounded, size: 16),
              label: const Text('Reject'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: onApprove,
              icon: const Icon(Icons.check_rounded, size: 16),
              label: const Text('Approve'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
                elevation: 0,
              ),
            ),
          ),
        ]),
      ]),
    );
  }
}

// ── Attendance Record ─────────────────────────────────────────────────────────
class _AttendanceRecord extends StatelessWidget {
  final AttendanceModel record;
  const _AttendanceRecord({required this.record});

  @override
  Widget build(BuildContext context) {
    final loginStr = DateFormat('h:mm a').format(record.loginTime);
    final logoutStr = record.logoutTime != null
        ? DateFormat('h:mm a').format(record.logoutTime!)
        : 'Active';
    final isActive = record.logoutTime == null;

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
            color: isActive ? AppColors.success.withValues(alpha: 0.1) : AppColors.surface2,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            isActive ? Icons.person_rounded : Icons.person_outline_rounded,
            size: 20,
            color: isActive ? AppColors.success : AppColors.textMuted,
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(record.userName, style: AppTypography.labelLarge),
            const SizedBox(height: 2),
            Text('$loginStr → $logoutStr', style: AppTypography.caption),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (isActive)
            StatusChip(label: 'Active', type: StatusType.success, small: true)
          else
            Text(record.formattedDuration, style: AppTypography.numericSmall),
        ]),
      ]),
    );
  }
}

// ── Attendance Stat ───────────────────────────────────────────────────────────
class _AttendanceStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _AttendanceStat({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 4),
        Text(value,
            style: AppTypography.numericSmall.copyWith(color: color, fontSize: 22)),
        Text(label, style: AppTypography.caption),
      ]),
    );
  }
}
