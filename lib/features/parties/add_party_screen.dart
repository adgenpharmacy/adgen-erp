import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/party_provider.dart';
import '../../shared/models/party_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/app_card.dart';

class AddPartyScreen extends ConsumerStatefulWidget {
  final String? partyId;

  const AddPartyScreen({super.key, this.partyId});

  @override
  ConsumerState<AddPartyScreen> createState() => _AddPartyScreenState();
}

class _AddPartyScreenState extends ConsumerState<AddPartyScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _gstCtrl = TextEditingController();
  final _dlCtrl = TextEditingController();
  final _contactPersonCtrl = TextEditingController();
  bool _isLoading = false;
  PartyModel? _existingParty;

  @override
  void initState() {
    super.initState();
    if (widget.partyId != null) {
      _loadParty();
    }
  }

  Future<void> _loadParty() async {
    // Load existing party for editing
    final parties = ref.read(partiesProvider).value ?? [];
    final party = parties.firstWhere(
      (p) => p.id == widget.partyId,
      orElse: () => PartyModel(name: '', address: '', phone: '', createdAt: DateTime.now()),
    );
    setState(() {
      _existingParty = party;
      _nameCtrl.text = party.name;
      _phoneCtrl.text = party.phone;
      _emailCtrl.text = party.email ?? '';
      _addressCtrl.text = party.address;
      _gstCtrl.text = party.gstNumber ?? '';
      _dlCtrl.text = party.drugLicenseNo ?? '';
      _contactPersonCtrl.text = party.contactPerson ?? '';
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _addressCtrl.dispose();
    _gstCtrl.dispose();
    _dlCtrl.dispose();
    _contactPersonCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    final party = PartyModel(
      id: _existingParty?.id,
      name: _nameCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      email: _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
      address: _addressCtrl.text.trim(),
      gstNumber: _gstCtrl.text.trim().isEmpty ? null : _gstCtrl.text.trim(),
      drugLicenseNo: _dlCtrl.text.trim().isEmpty ? null : _dlCtrl.text.trim(),
      contactPerson: _contactPersonCtrl.text.trim().isEmpty ? null : _contactPersonCtrl.text.trim(),
      createdAt: _existingParty?.createdAt ?? DateTime.now(),
    );

    final notifier = ref.read(partyNotifierProvider.notifier);
    String? error;
    if (_existingParty?.id != null) {
      error = await notifier.updateParty(_existingParty!.id!, party);
    } else {
      error = await notifier.addParty(party);
    }

    if (mounted) {
      setState(() => _isLoading = false);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error'), backgroundColor: AppColors.error),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_existingParty?.id != null ? 'Party updated!' : 'Party added!'),
            backgroundColor: AppColors.success,
          ),
        );
        context.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.partyId != null;
    final isMobile = MediaQuery.of(context).size.width < 700;
    final padding = isMobile ? AppSpacing.lg.toDouble() : AppSpacing.screenPadding.toDouble();

    final basicInfoCard = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Basic Information', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.xl),
          AppTextField(
            label: 'Party Name *',
            controller: _nameCtrl,
            prefixIcon: Icons.business_rounded,
            textInputAction: TextInputAction.next,
            validator: (v) => v?.isEmpty ?? true ? 'Name required' : null,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Phone Number *',
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            prefixIcon: Icons.phone_rounded,
            textInputAction: TextInputAction.next,
            validator: (v) => v?.isEmpty ?? true ? 'Phone required' : null,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Email Address',
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.email_outlined,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Contact Person',
            controller: _contactPersonCtrl,
            prefixIcon: Icons.person_outlined,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Address *',
            controller: _addressCtrl,
            prefixIcon: Icons.location_on_outlined,
            maxLines: 3,
            validator: (v) => v?.isEmpty ?? true ? 'Address required' : null,
          ),
        ],
      ),
    );

    final taxCard = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Tax & License Details', style: AppTypography.h3),
          const SizedBox(height: AppSpacing.xl),
          AppTextField(
            label: 'GST Number',
            controller: _gstCtrl,
            prefixIcon: Icons.receipt_outlined,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Drug License Number',
            controller: _dlCtrl,
            prefixIcon: Icons.medical_services_outlined,
            textInputAction: TextInputAction.done,
          ),
        ],
      ),
    );

    final actionRow = Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        AppOutlinedButton(label: 'Cancel', onPressed: () => context.pop()),
        const SizedBox(width: AppSpacing.lg),
        AppButton(
          label: isEditing ? 'Update Party' : 'Add Party',
          icon: isEditing ? Icons.save_rounded : Icons.add_rounded,
          onPressed: _save,
          isLoading: _isLoading,
        ),
      ],
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(
          isEditing ? 'Edit Party' : 'Add Party',
          style: AppTypography.h3,
        ),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(padding),
        child: Form(
          key: _formKey,
          child: isMobile
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    basicInfoCard,
                    const SizedBox(height: AppSpacing.xl),
                    taxCard,
                    const SizedBox(height: AppSpacing.xxl),
                    actionRow,
                    const SizedBox(height: AppSpacing.xl),
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: basicInfoCard),
                    const SizedBox(width: AppSpacing.xl),
                    Expanded(
                      child: Column(
                        children: [
                          taxCard,
                          const SizedBox(height: AppSpacing.xxl),
                          actionRow,
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
