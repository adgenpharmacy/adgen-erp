import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/constants.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/models/sales_bill_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/status_chip.dart';

class CreditRemindersWidget extends StatelessWidget {
  final List<SalesBillModel> bills;

  const CreditRemindersWidget({
    super.key,
    required this.bills,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    const Icon(
                      Icons.account_balance_wallet_rounded,
                      color: AppColors.warning,
                      size: 18,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        'Credit Reminders',
                        style: AppTypography.h3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              if (bills.isNotEmpty) ...[
                const SizedBox(width: AppSpacing.sm),
                StatusChip(
                  label: '${bills.length}',
                  type: StatusType.warning,
                  small: true,
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.lg),

          if (bills.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xxl),
              child: Center(
                child: Column(
                  children: [
                    const Icon(
                      Icons.check_circle_outline_rounded,
                      color: AppColors.success,
                      size: 32,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'No pending credits!',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: bills.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: AppSpacing.md),
              itemBuilder: (_, index) =>
                  _CreditBillCard(bill: bills[index]),
            ),
        ],
      ),
    );
  }
}

class _CreditBillCard extends StatelessWidget {
  final SalesBillModel bill;

  const _CreditBillCard({
    required this.bill,
  });

  Future<void> _sendWhatsAppReminder(BuildContext context) async {
    final phone = bill.customerPhone?.replaceAll(RegExp(r'\D'), '') ?? '';

    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No phone number available for this customer'),
        ),
      );
      return;
    }

    final message = Uri.encodeComponent(
      'Dear ${bill.customerName},\n\n'
      'This is a gentle reminder regarding your outstanding payment of '
      '${AppFormatters.formatCurrency(bill.grandTotal)} '
      'against Invoice ${bill.invoiceNumber} dated '
      '${AppFormatters.formatDate(bill.saleDate)}.\n\n'
      'Please settle the payment at your earliest convenience.\n\n'
      'UPI: ${AppConstants.upiId}\n\n'
      '⭐ Review us:\n'
      '${AppConstants.googleReviewLink}\n\n'
      'Thank you.\n'
      '${AppConstants.shopName}',
    );

    final uri = Uri.parse(
      'https://wa.me/91$phone?text=$message',
    );

    if (await canLaunchUrl(uri)) {
      await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unable to open WhatsApp'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final daysAgo = DateTime.now().difference(bill.saleDate).inDays;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: daysAgo > 30
              ? AppColors.error.withValues(alpha: 0.4)
              : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  bill.customerName,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelLarge,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Text(
                  AppFormatters.formatCurrency(bill.grandTotal),
                  textAlign: TextAlign.end,
                  overflow: TextOverflow.fade,
                  softWrap: false,
                  style: AppTypography.numericSmall.copyWith(
                    color: AppColors.warning,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 4),

          Text(
            '${bill.invoiceNumber} • $daysAgo days ago',
            style: AppTypography.caption,
          ),

          const SizedBox(height: AppSpacing.md),

          SizedBox(
            width: double.infinity,
            child: AppButton(
              label: 'Send Reminder',
              icon: Icons.chat_rounded,
              onPressed: () => _sendWhatsAppReminder(context),
              small: true,
              color: AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}