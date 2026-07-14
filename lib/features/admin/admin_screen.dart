import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/admin_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/data_ops_provider.dart';
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
    _tabCtrl = TabController(length: 4, vsync: this);
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
            const Tab(text: 'Data Ops'),
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

                  Text('Staff Present Today', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.md),

                  ...byUser.entries.map((entry) {
                    final uid = entry.key;
                    final userRecords = entry.value;
                    // Sort records newest first
                    userRecords.sort((a, b) => b.loginTime.compareTo(a.loginTime));
                    
                    final userName = userRecords.first.userName;
                    final isCurrentlyActive = userRecords.any((r) => r.logoutTime == null);
                    
                    // Calculate total active time today for this user
                    Duration totalDuration = Duration.zero;
                    for (final r in userRecords) {
                      if (r.sessionDuration != null) {
                        totalDuration += r.sessionDuration!;
                      }
                    }
                    
                    final totalStr = totalDuration.inMinutes > 0 
                      ? '${totalDuration.inHours}h ${totalDuration.inMinutes.remainder(60)}m'
                      : '< 1m';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: AppCard(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(
                                color: isCurrentlyActive ? AppColors.success.withValues(alpha: 0.1) : AppColors.surface2,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                isCurrentlyActive ? Icons.person_rounded : Icons.person_outline_rounded,
                                size: 22,
                                color: isCurrentlyActive ? AppColors.success : AppColors.textMuted,
                              ),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(userName, style: AppTypography.labelLarge),
                                if (isCurrentlyActive)
                                  StatusChip(label: 'Active Now', type: StatusType.success, small: true)
                                else
                                  Text('Clocked Out', style: AppTypography.caption),
                              ]),
                            ),
                            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                              Text('Total Time', style: AppTypography.caption),
                              Text(totalStr, style: AppTypography.numericSmall.copyWith(color: AppColors.primary)),
                            ]),
                          ]),
                          const Divider(height: 24),
                          ...userRecords.map((r) {
                            final loginStr = DateFormat('h:mm a').format(r.loginTime);
                            final logoutStr = r.logoutTime != null
                                ? DateFormat('h:mm a').format(r.logoutTime!)
                                : 'Active';
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(children: [
                                const Icon(Icons.login_rounded, size: 14, color: AppColors.success),
                                const SizedBox(width: 4),
                                Text(loginStr, style: AppTypography.caption),
                                const SizedBox(width: 8),
                                const Icon(Icons.logout_rounded, size: 14, color: AppColors.error),
                                const SizedBox(width: 4),
                                Text(
                                  logoutStr, 
                                  style: AppTypography.caption.copyWith(
                                    color: r.logoutTime == null ? AppColors.success : null,
                                    fontWeight: r.logoutTime == null ? FontWeight.w700 : null
                                  )
                                ),
                                const Spacer(),
                                if (r.sessionDuration != null)
                                  Text(r.formattedDuration, style: AppTypography.caption),
                              ]),
                            );
                          }),
                        ]),
                      ),
                    );
                  }),
                ],
              );
            },
          ),

          // ── Tab 4: Data Operations ──────────────────────────────────
          const _DataOpsTab(),
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

// ── Data Ops Tab ──────────────────────────────────────────────────────────────
class _DataOpsTab extends ConsumerStatefulWidget {
  const _DataOpsTab();

  @override
  ConsumerState<_DataOpsTab> createState() => _DataOpsTabState();
}

class _DataOpsTabState extends ConsumerState<_DataOpsTab> {
  bool _devModeUnlocked = false;

  void _showPinDialog(String title, VoidCallback onSuccess) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'Enter PIN'),
          obscureText: true,
          keyboardType: TextInputType.number,
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (ctrl.text == '2659') {
                Navigator.pop(ctx);
                onSuccess();
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invalid PIN'), backgroundColor: AppColors.error),
                );
              }
            },
            child: const Text('Unlock'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dataOpsState = ref.watch(dataOpsNotifierProvider);

    // Show toast on success/error
    ref.listen<AsyncValue<String?>>(dataOpsNotifierProvider, (prev, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Error: ${next.error}'),
          backgroundColor: AppColors.error,
        ));
      } else if (next.value != null && next.value!.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(next.value!),
          backgroundColor: AppColors.success,
        ));
      }
    });

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Legacy Data Import', style: AppTypography.h3),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Import JSON files generated from the legacy Excel sheets. Use this ONLY ONCE to avoid duplicating records.',
                style: AppTypography.bodySmall,
              ),
              const SizedBox(height: AppSpacing.lg),
              
              if (dataOpsState.isLoading)
                const Center(child: CircularProgressIndicator(color: AppColors.primary))
              else ...[
              if (!_devModeUnlocked)
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _showPinDialog('Developer Options', () => setState(() => _devModeUnlocked = true)),
                    icon: const Icon(Icons.developer_mode_rounded),
                    label: const Text('Unlock Developer Options'),
                  ),
                )
              else ...[
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.warningContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                    border: Border.all(color: AppColors.warning.withValues(alpha: 0.5)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                          const SizedBox(width: AppSpacing.sm),
                          Text('Developer Options Unlocked', style: AppTypography.label.copyWith(color: AppColors.warning)),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => ref.read(dataOpsNotifierProvider.notifier).importLegacyProductsAndInventory(),
                              icon: const Icon(Icons.upload_file_rounded),
                              label: const Text('Import Products.json'),
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => ref.read(dataOpsNotifierProvider.notifier).importLegacyParties(),
                              icon: const Icon(Icons.group_add_rounded),
                              label: const Text('Import Parties.json'),
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () => ref.read(dataOpsNotifierProvider.notifier).bulkSetLowStockToOne(),
                          icon: const Icon(Icons.speed_rounded),
                          label: const Text('Run Low Stock Migration'),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            backgroundColor: AppColors.secondary,
                            foregroundColor: AppColors.surface,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
                Text('Export Data (Backup)', style: AppTypography.h3),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Export current database collections as JSON files for backup purposes.',
                  style: AppTypography.bodySmall,
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).exportCollection('products'),
                        icon: const Icon(Icons.download_rounded, size: 18),
                        label: const Text('Export Products'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).exportCollection('inventory'),
                        icon: const Icon(Icons.download_rounded, size: 18),
                        label: const Text('Export Inventory'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).exportCollection('parties'),
                        icon: const Icon(Icons.download_rounded, size: 18),
                        label: const Text('Export Parties'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Text('Restore Data (Backup)', style: AppTypography.h3),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Restore a previously exported JSON backup file.',
                  style: AppTypography.bodySmall,
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).restoreBackup('products'),
                        icon: const Icon(Icons.upload_rounded, size: 18),
                        label: const Text('Restore Products'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).restoreBackup('inventory'),
                        icon: const Icon(Icons.upload_rounded, size: 18),
                        label: const Text('Restore Inventory'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => ref.read(dataOpsNotifierProvider.notifier).restoreBackup('parties'),
                        icon: const Icon(Icons.upload_rounded, size: 18),
                        label: const Text('Restore Parties'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xxl),
                const Divider(),
                const SizedBox(height: AppSpacing.md),
                Text('Danger Zone', style: AppTypography.h3.copyWith(color: AppColors.error)),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Irreversible actions that will permanently delete data from the database.',
                  style: AppTypography.bodySmall,
                ),
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      _showPinDialog('Wipe Inventory (Requires Admin PIN)', () {
                        showDialog(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Wipe All Inventory Stock?'),
                            content: const Text(
                                'This will permanently delete ALL stock batches from the inventory. Your product catalog will remain intact, but all quantities will effectively become zero. This action cannot be undone.'),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx),
                                child: const Text('Cancel'),
                              ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
                                onPressed: () {
                                  Navigator.pop(ctx);
                                  ref.read(dataOpsNotifierProvider.notifier).clearInventory();
                                },
                                child: const Text('Wipe Everything'),
                              ),
                            ],
                          ),
                        );
                      });
                    },
                    icon: const Icon(Icons.delete_forever_rounded),
                    label: const Text('Wipe All Inventory Stock'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.errorContainer,
                      foregroundColor: AppColors.error,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

