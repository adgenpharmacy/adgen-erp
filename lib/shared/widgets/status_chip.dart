import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/app_spacing.dart';

enum StatusType { success, warning, error, info, neutral, ai }

class StatusChip extends StatelessWidget {
  final String label;
  final StatusType type;
  final bool small;

  const StatusChip({
    super.key,
    required this.label,
    this.type = StatusType.neutral,
    this.small = false,
  });

  Color get _bgColor {
    switch (type) {
      case StatusType.success: return AppColors.successContainer;
      case StatusType.warning: return AppColors.warningContainer;
      case StatusType.error: return AppColors.errorContainer;
      case StatusType.info: return AppColors.primaryContainer;
      case StatusType.ai: return AppColors.aiContainer;
      case StatusType.neutral: return AppColors.surface3;
    }
  }

  Color get _textColor {
    switch (type) {
      case StatusType.success: return AppColors.success;
      case StatusType.warning: return AppColors.warning;
      case StatusType.error: return AppColors.error;
      case StatusType.info: return AppColors.primary;
      case StatusType.ai: return AppColors.ai;
      case StatusType.neutral: return AppColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? AppSpacing.sm : AppSpacing.md,
        vertical: small ? 2 : AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: _bgColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
      ),
      child: Text(
        label,
        style: (small ? AppTypography.caption : AppTypography.label).copyWith(
          color: _textColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class ScheduleChip extends StatelessWidget {
  final String schedule;

  const ScheduleChip({super.key, required this.schedule});

  Color get _color {
    switch (schedule) {
      case 'Schedule H': return AppColors.scheduleH;
      case 'Schedule H1': return AppColors.scheduleH1;
      case 'Schedule X': return AppColors.scheduleX;
      default: return AppColors.scheduleGeneral;
    }
  }

  String get _short {
    switch (schedule) {
      case 'Schedule H': return 'Sch-H';
      case 'Schedule H1': return 'Sch-H1';
      case 'Schedule X': return 'Sch-X';
      default: return 'General';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: _color.withValues(alpha: 0.4)),
      ),
      child: Text(
        _short,
        style: AppTypography.labelSmall.copyWith(
          color: _color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
