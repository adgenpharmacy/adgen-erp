import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/party_provider.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/screen_shell.dart';

class PartiesScreen extends ConsumerStatefulWidget {
  const PartiesScreen({super.key});

  @override
  ConsumerState<PartiesScreen> createState() => _PartiesScreenState();
}

class _PartiesScreenState extends ConsumerState<PartiesScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final partiesAsync = ref.watch(partiesProvider);

    return ScreenShell(
      title: 'Parties',
      subtitle: 'Suppliers & Vendors',
      action: AppButton(
        label: 'Add Party',
        icon: Icons.add_rounded,
        onPressed: () => context.push('/parties/add'),
      ),
      fab: FloatingActionButton.extended(
        onPressed: () => context.push('/parties/add'),
        backgroundColor: AppColors.teal,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Party',
            style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600)),
        elevation: 2,
      ),
      headerExtras: [
        TextField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _search = v),
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: 'Search by name, phone, or GST…',
            hintStyle: AppTypography.bodySmall,
            prefixIcon: const Icon(Icons.search_rounded, size: 18, color: AppColors.textMuted),
            suffixIcon: _search.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded, size: 16, color: AppColors.textMuted),
                    onPressed: () {
                      _searchCtrl.clear();
                      setState(() => _search = '');
                    },
                  )
                : null,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ],
      body: partiesAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (parties) {
          if (parties.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.people_outline_rounded,
                        size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No parties added yet', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Add suppliers and vendors to manage purchases',
                      style: AppTypography.bodySmall,
                      textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.xxl),
                  AppButton(
                    label: 'Add First Party',
                    icon: Icons.add_rounded,
                    onPressed: () => context.push('/parties/add'),
                  ),
                ],
              ),
            );
          }

          final q = _search.toLowerCase();
          final filtered = parties.where((p) =>
            q.isEmpty ||
            p.name.toLowerCase().contains(q) ||
            p.phone.contains(q) ||
            (p.gstNumber?.toLowerCase().contains(q) ?? false)
          ).toList();

          if (filtered.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.search_off_rounded, size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('No parties found', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  Text('Try a different search term', style: AppTypography.bodySmall),
                ],
              ),
            );
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Text('${filtered.length} parties', style: AppTypography.caption),
                    const Spacer(),
                    if (parties.any((p) => p.outstandingBalance > 0))
                      Text(
                        '${parties.where((p) => p.outstandingBalance > 0).length} with dues',
                        style: AppTypography.caption.copyWith(color: AppColors.warning),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (_, i) {
                    final party = filtered[i];
                    return AppCard(
                      onTap: () => context.push('/parties/add', extra: party.id),
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
                      child: Row(
                        children: [
                          // Avatar
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: party.outstandingBalance > 0
                                  ? AppColors.warningContainer
                                  : AppColors.primaryContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Center(
                              child: Text(
                                party.name[0].toUpperCase(),
                                style: AppTypography.h3.copyWith(
                                  color: party.outstandingBalance > 0
                                      ? AppColors.warning
                                      : AppColors.primary,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(party.name, style: AppTypography.labelLarge),
                                Text(party.phone, style: AppTypography.bodySmall),
                                if (party.gstNumber != null)
                                  Text('GST: ${party.gstNumber}',
                                      style: AppTypography.caption),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              if (party.outstandingBalance > 0)
                                StatusChip(
                                  label: '₹${party.outstandingBalance.toStringAsFixed(0)} due',
                                  type: StatusType.warning,
                                  small: true,
                                ),
                              const SizedBox(height: 4),
                              PopupMenuButton<String>(
                                onSelected: (action) {
                                  if (action == 'edit') {
                                    context.push('/parties/add', extra: party.id);
                                  }
                                },
                                itemBuilder: (_) => [
                                  const PopupMenuItem(
                                    value: 'edit',
                                    child: Row(children: [
                                      Icon(Icons.edit_rounded, size: 16),
                                      SizedBox(width: 8),
                                      Text('Edit'),
                                    ]),
                                  ),
                                ],
                                icon: const Icon(Icons.more_vert_rounded,
                                    color: AppColors.textMuted, size: 20),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
