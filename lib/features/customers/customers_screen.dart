import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:csv/csv.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/customer_provider.dart';
import '../../shared/models/customer_model.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/screen_shell.dart';
import '../../shared/widgets/app_button.dart';

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _importCsv() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv'],
      );

      if (result == null || result.files.single.path == null) return;

      final file = File(result.files.single.path!);
      final csvString = await file.readAsString();
      final fields = const CsvDecoder().convert(csvString);

      if (fields.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('CSV file is empty'), backgroundColor: AppColors.error),
          );
        }
        return;
      }

      // Identify header indexes
      final headers = fields.first.map((e) => e.toString().toLowerCase().trim()).toList();
      final nameIndex = headers.indexOf('name');
      final phoneIndex = headers.indexOf('phone');
      final emailIndex = headers.indexOf('email');
      final addressIndex = headers.indexOf('address');
      final doctorIndex = headers.indexOf('doctor');

      if (nameIndex == -1 || phoneIndex == -1) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('CSV must contain "name" and "phone" columns'),
              backgroundColor: AppColors.error,
            ),
          );
        }
        return;
      }

      final List<CustomerModel> importedCustomers = [];
      for (int i = 1; i < fields.length; i++) {
        final row = fields[i];
        if (row.length <= nameIndex || row.length <= phoneIndex) continue;

        final name = row[nameIndex].toString().trim();
        final phone = row[phoneIndex].toString().trim();
        if (name.isEmpty || phone.isEmpty) continue;

        final email = emailIndex != -1 && row.length > emailIndex ? row[emailIndex].toString().trim() : null;
        final address = addressIndex != -1 && row.length > addressIndex ? row[addressIndex].toString().trim() : null;
        final doctor = doctorIndex != -1 && row.length > doctorIndex ? row[doctorIndex].toString().trim() : null;

        importedCustomers.add(
          CustomerModel(
            name: name,
            phone: phone,
            email: email?.isEmpty == true ? null : email,
            address: address?.isEmpty == true ? null : address,
            doctorName: doctor?.isEmpty == true ? null : doctor,
            createdAt: DateTime.now(),
          ),
        );
      }

      if (importedCustomers.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No valid customers found in CSV'), backgroundColor: AppColors.error),
          );
        }
        return;
      }

      final error = await ref.read(customerNotifierProvider.notifier).importCustomers(importedCustomers);
      if (mounted) {
        if (error != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Import failed: $error'), backgroundColor: AppColors.error),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Successfully imported ${importedCustomers.length} customers!'),
              backgroundColor: AppColors.success,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final customersAsync = ref.watch(customersProvider);

    return ScreenShell(
      title: 'Customers',
      subtitle: 'Contact directory',
      action: AppButton(
        label: 'Import CSV',
        icon: Icons.file_upload_rounded,
        onPressed: _importCsv,
      ),
      headerExtras: [
        AppTextField(
          label: 'Search by name or phone...',
          controller: _searchCtrl,
          prefixIcon: Icons.search_rounded,
          onChanged: (v) => setState(() => _search = v),
        ),
      ],
      body: customersAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                color: AppColors.primary, strokeWidth: 2)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (customers) {
          final filtered = _search.isEmpty
              ? customers
              : customers
                  .where((c) =>
                      c.name.toLowerCase().contains(_search.toLowerCase()) ||
                      c.phone.contains(_search))
                  .toList();

          if (filtered.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: const BoxDecoration(
                        color: AppColors.surface2, shape: BoxShape.circle),
                    child: const Icon(Icons.person_search_rounded,
                        size: 36, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    _search.isNotEmpty ? 'No results found' : 'No customers yet',
                    style: AppTypography.h3,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Customers are added automatically during sales',
                    style: AppTypography.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            itemCount: filtered.length,
            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
            itemBuilder: (_, i) => _CustomerCard(customer: filtered[i]),
          );
        },
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final CustomerModel customer;
  const _CustomerCard({required this.customer});

  Future<void> _call() async {
    final url = Uri.parse('tel:${customer.phone}');
    if (await canLaunchUrl(url)) await launchUrl(url);
  }

  Future<void> _whatsApp() async {
    final phone = customer.phone.replaceAll(RegExp(r'\D'), '');
    final url = Uri.parse('https://wa.me/91$phone');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                customer.name[0].toUpperCase(),
                style: AppTypography.h3
                    .copyWith(color: AppColors.primary, fontSize: 16),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(customer.name, style: AppTypography.labelLarge),
                Text(customer.phone, style: AppTypography.body),
                if (customer.doctorName != null)
                  Text('Dr: ${customer.doctorName}',
                      style: AppTypography.caption),
                if (customer.creditBalance > 0)
                  Text(
                    'Credit: ₹${customer.creditBalance.toStringAsFixed(2)} due',
                    style:
                        AppTypography.caption.copyWith(color: AppColors.warning),
                  ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ActionIcon(
                icon: Icons.phone_rounded,
                color: AppColors.success,
                tooltip: 'Call',
                onTap: _call,
              ),
              const SizedBox(width: 4),
              _ActionIcon(
                icon: Icons.chat_rounded,
                color: const Color(0xFF25D366),
                tooltip: 'WhatsApp',
                onTap: _whatsApp,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback onTap;
  const _ActionIcon({
    required this.icon,
    required this.color,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
        ),
      ),
    );
  }
}
