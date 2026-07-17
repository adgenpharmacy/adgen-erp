import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/admin_provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/data_ops_provider.dart';
import '../../core/providers/settings_provider.dart';
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
    _tabCtrl = TabController(length: 5, vsync: this);
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
    // todayAttendanceProvider is watched elsewhere; no local var needed here
    ref.watch(todayAttendanceProvider);

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
            const Tab(text: 'Settings'),
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


          // ── Tab 3: Attendance Calendar ───────────────────────────────
          const _AttendanceCalendarTab(),

          // ── Tab 4: Data Operations ──────────────────────────────────
          const _DataOpsTab(),

          // ── Tab 5: Settings ─────────────────────────────────────────
          const _SettingsTab(),
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
// ignore: unused_element
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

              // ── ZIP Export ───────────────────────────────────────────────
              AppCard(
                backgroundColor: AppColors.primaryContainer,
                borderColor: AppColors.primary.withValues(alpha: 0.2),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(Icons.archive_rounded, color: AppColors.primary, size: 22),
                    const SizedBox(width: AppSpacing.sm),
                    Text('Export All Data — ZIP Backup', style: AppTypography.h3),
                  ]),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Downloads a single ZIP file containing ALL collections as:\n'
                    '• CSV files (human-readable, open in Excel/Sheets)\n'
                    '• JSON files (machine-readable, re-importable to this app)',
                    style: AppTypography.bodySmall,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () =>
                          ref.read(dataOpsNotifierProvider.notifier).exportAllAsZip(),
                      icon: const Icon(Icons.download_rounded, size: 18),
                      label: const Text('Export All as ZIP'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: AppSpacing.md),

              // ── ZIP Import ───────────────────────────────────────────────
              AppCard(
                borderColor: AppColors.warning.withValues(alpha: 0.3),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(Icons.unarchive_rounded, color: AppColors.warning, size: 22),
                    const SizedBox(width: AppSpacing.sm),
                    Text('Import from ZIP Backup', style: AppTypography.h3),
                  ]),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Pick a previously exported ZIP to restore all records. '
                    'Uses safe merge — existing data is not deleted, only updated/added. '
                    'Works with backups made from this app only.',
                    style: AppTypography.bodySmall,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          ref.read(dataOpsNotifierProvider.notifier).importFromZip(),
                      icon: const Icon(Icons.upload_rounded, size: 18),
                      label: const Text('Import from ZIP'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.warning,
                        side: const BorderSide(color: AppColors.warning),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ]),
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

// ─── Attendance Calendar Tab ───────────────────────────────────────────────────
class _AttendanceCalendarTab extends ConsumerStatefulWidget {
  const _AttendanceCalendarTab();
  @override
  ConsumerState<_AttendanceCalendarTab> createState() => _AttendanceCalendarTabState();
}

class _AttendanceCalendarTabState extends ConsumerState<_AttendanceCalendarTab> {
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;

  @override
  Widget build(BuildContext context) {
    final allAttnAsync = ref.watch(allAttendanceProvider);

    return allAttnAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
      error: (e, _) => Center(child: Text('Error: ')),
      data: (records) {
        // Build a set of dates that have attendance
        final daysWithAttendance = records.map((r) {
          final d = r.loginTime;
          return DateTime(d.year, d.month, d.day);
        }).toSet();

        // Records for selected day
        final selectedRecords = _selectedDay == null ? <AttendanceModel>[] :
            records.where((r) {
              final d = r.loginTime;
              return d.year == _selectedDay!.year && d.month == _selectedDay!.month && d.day == _selectedDay!.day;
            }).toList();

        return ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            TableCalendar(
              firstDay: DateTime.utc(DateTime.now().year - 2),
              lastDay: DateTime.utc(DateTime.now().year + 1),
              focusedDay: _focusedDay,
              selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
              calendarStyle: CalendarStyle(
                todayDecoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                selectedDecoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                markerDecoration: BoxDecoration(
                  color: AppColors.success,
                  shape: BoxShape.circle,
                ),
                defaultTextStyle: AppTypography.body,
                weekendTextStyle: AppTypography.body.copyWith(color: AppColors.error),
              ),
              headerStyle: HeaderStyle(
                titleTextStyle: AppTypography.h3,
                formatButtonVisible: false,
                leftChevronIcon: const Icon(Icons.chevron_left_rounded, color: AppColors.primary),
                rightChevronIcon: const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
              ),
              eventLoader: (day) {
                final d = DateTime(day.year, day.month, day.day);
                return daysWithAttendance.contains(d) ? [true] : [];
              },
              onDaySelected: (selected, focused) {
                setState(() {
                  _selectedDay = selected;
                  _focusedDay = focused;
                });
              },
              onPageChanged: (focusedDay) => _focusedDay = focusedDay,
            ),
            if (_selectedDay != null) ...[
              const SizedBox(height: AppSpacing.xl),
              Text(
                DateFormat('EEEE, dd MMMM yyyy').format(_selectedDay!),
                style: AppTypography.h3,
              ),
              const SizedBox(height: AppSpacing.md),
              if (selectedRecords.isEmpty)
                Center(child: Text('No attendance on this day', style: AppTypography.bodySmall))
              else
                ...selectedRecords.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppCard(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Row(children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.person_rounded, color: AppColors.primary, size: 20),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(r.userName, style: AppTypography.labelLarge),
                        Text(
                          'In:  | Out: ',
                          style: AppTypography.caption,
                        ),
                      ])),
                      if (r.sessionDuration != null)
                        Text(r.formattedDuration, style: AppTypography.numericSmall.copyWith(color: AppColors.primary)),
                    ]),
                  ),
                )),
            ],
          ],
        );
      },
    );
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
class _SettingsTab extends ConsumerStatefulWidget {
  const _SettingsTab();
  @override
  ConsumerState<_SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends ConsumerState<_SettingsTab> {
  final _apiKeyCtrl = TextEditingController();
  bool _obscure = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill with existing key
    ref.read(geminiApiKeyProvider.future).then((key) {
      if (key != null && mounted) _apiKeyCtrl.text = key;
    });
  }

  @override
  void dispose() {
    _apiKeyCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xl),
      children: [
        const SizedBox(height: AppSpacing.lg),
        Icon(Icons.settings_rounded, size: 40, color: AppColors.primary),
        const SizedBox(height: AppSpacing.md),
        Text('App Settings', style: AppTypography.h2, textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text('Configure API keys and preferences', style: AppTypography.bodySmall, textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.xl),

        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.auto_awesome_rounded, color: AppColors.primary, size: 18),
              const SizedBox(width: 8),
              Text('Gemini AI API Key', style: AppTypography.h3),
            ]),
            const SizedBox(height: 4),
            Text(
              'Enter your Google Gemini API key to enable AI-powered features in this app. Get it from aistudio.google.com',
              style: AppTypography.bodySmall,
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              controller: _apiKeyCtrl,
              obscureText: _obscure,
              decoration: InputDecoration(
                labelText: 'API Key',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
                hintText: 'AIzaSy...',
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : () async {
                  setState(() => _saving = true);
                  final error = await ref.read(settingsNotifierProvider.notifier)
                      .updateGeminiApiKey(_apiKeyCtrl.text.trim());
                  setState(() => _saving = false);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(error ?? 'API key saved!'),
                      backgroundColor: error != null ? AppColors.error : AppColors.success,
                    ));
                  }
                },
                icon: _saving
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: Text(_saving ? 'Saving...' : 'Save API Key'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
  }
}
