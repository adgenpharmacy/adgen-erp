import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/product_provider.dart';
import '../../core/utils/constants.dart';
import '../../shared/models/product_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/screen_shell.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AddProductScreen extends ConsumerStatefulWidget {
  final String? productId;
  const AddProductScreen({super.key, this.productId});

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  final _formKey = GlobalKey<FormState>();

  // Controllers
  final _nameCtrl       = TextEditingController();
  final _genericCtrl    = TextEditingController();
  final _companyCtrl    = TextEditingController();
  final _hsnCtrl        = TextEditingController();
  final _packSizeCtrl   = TextEditingController(text: '1');
  final _lowStockCtrl   = TextEditingController(text: '1');
  final _mrpCtrl        = TextEditingController();
  final _rateCtrl       = TextEditingController();

  ProductType _productType = ProductType.tablet;
  ProductDivision _division = ProductDivision.general;
  double _gstPercent = 12;
  bool _requiresColdStorage = false;
  bool _isActive = true;
  bool _loading = false;
  bool _isEditing = false;

  @override
  void initState() {
    super.initState();
    if (widget.productId != null) {
      _isEditing = true;
      _loadProduct();
    }
  }

  Future<void> _loadProduct() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection(AppConstants.colProducts)
          .doc(widget.productId!)
          .get();
      if (!doc.exists || !mounted) return;
      final product = ProductModel.fromFirestore(doc);
      setState(() {
        _nameCtrl.text        = product.name;
        _genericCtrl.text     = product.genericName ?? '';
        _companyCtrl.text     = product.companyName;
        _hsnCtrl.text         = product.hsnCode;
        _packSizeCtrl.text    = product.packSize.toString();
        _lowStockCtrl.text    = product.lowStockThreshold.toStringAsFixed(0);
        _mrpCtrl.text         = product.mrp > 0 ? product.mrp.toStringAsFixed(2) : '';
        _rateCtrl.text        = product.rate > 0 ? product.rate.toStringAsFixed(2) : '';
        _productType          = product.productType;
        _division             = product.division;
        _gstPercent           = product.gstPercent;
        _requiresColdStorage  = product.requiresColdStorage;
        _isActive             = product.isActive;
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _genericCtrl.dispose();
    _companyCtrl.dispose();
    _hsnCtrl.dispose();
    _packSizeCtrl.dispose();
    _lowStockCtrl.dispose();
    _mrpCtrl.dispose();
    _rateCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    final packSize = _productType.hasPack
        ? (int.tryParse(_packSizeCtrl.text) ?? 1)
        : 1;

    final product = ProductModel(
      id: widget.productId,
      name: _nameCtrl.text.trim(),
      genericName: _genericCtrl.text.trim().isEmpty ? null : _genericCtrl.text.trim(),
      companyName: _companyCtrl.text.trim(),
      hsnCode: _hsnCtrl.text.trim(),
      gstPercent: _gstPercent,
      productType: _productType,
      division: _division,
      packSize: packSize,
      packUnit: _productType.defaultPackUnit,
      contentUnit: _productType.defaultContentUnit,
      mrp: double.tryParse(_mrpCtrl.text) ?? 0,
      rate: double.tryParse(_rateCtrl.text) ?? 0,
      requiresColdStorage: _requiresColdStorage,
      lowStockThreshold: double.tryParse(_lowStockCtrl.text) ?? 1,
      isActive: _isActive,
      createdAt: DateTime.now(),
    );

    String? error;
    if (_isEditing) {
      error = await ref
          .read(productNotifierProvider.notifier)
          .updateProduct(widget.productId!, product);
    } else {
      error = await ref
          .read(productNotifierProvider.notifier)
          .createProduct(product);
    }

    if (mounted) {
      setState(() => _loading = false);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Error: $error'),
          backgroundColor: AppColors.error,
        ));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_isEditing ? 'Product updated' : 'Product created'),
          backgroundColor: AppColors.success,
        ));
        context.pop();
      }
    }
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete Product'),
        content: const Text('Are you sure you want to delete this product? This action cannot be undone and will also delete its inventory record.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      setState(() => _loading = true);
      final error = await ref.read(productNotifierProvider.notifier).deleteProduct(widget.productId!);
      if (mounted) {
        setState(() => _loading = false);
        if (error != null) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Error deleting product: $error'),
            backgroundColor: AppColors.error,
          ));
        } else {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Product deleted successfully'),
            backgroundColor: AppColors.success,
          ));
          context.pop();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ScreenShell(
      title: _isEditing ? 'Edit Product' : 'New Product',
      subtitle: _isEditing ? 'Update product details' : 'Add to product catalog',
      body: Form(
        key: _formKey,
        child: ListView(
          children: [
            // ── Product Type ──────────────────────────────────────────────
            _SectionHeader('Product Type'),
            const SizedBox(height: AppSpacing.md),
            _TypeSelector(
              selected: _productType,
              onChanged: (t) => setState(() {
                _productType = t;
                if (!t.hasPack) _packSizeCtrl.text = '1';
              }),
            ),
            const SizedBox(height: AppSpacing.xl),

            // ── Basic Info ────────────────────────────────────────────────
            _SectionHeader('Product Information'),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Product Name *',
              controller: _nameCtrl,
              hint: 'e.g. Paracetamol 500mg',
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
              prefixIcon: Icons.medication_rounded,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Generic Name',
              controller: _genericCtrl,
              hint: 'e.g. Acetaminophen',
              prefixIcon: Icons.science_rounded,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Company / Manufacturer *',
              controller: _companyCtrl,
              hint: 'e.g. Sun Pharma',
              prefixIcon: Icons.business_rounded,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'HSN Code',
              controller: _hsnCtrl,
              hint: 'e.g. 30049099',
              prefixIcon: Icons.qr_code_rounded,
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: AppSpacing.xl),

            // ── Pack Configuration (tablets / capsules only) ──────────────
            if (_productType.hasPack) ...[
              _SectionHeader('Pack Configuration'),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: '${_productType.defaultContentUnit}s per ${_productType.defaultPackUnit} *',
                controller: _packSizeCtrl,
                hint: 'e.g. 10',
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                prefixIcon: Icons.format_list_numbered_rounded,
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n < 1) return 'Enter valid pack size';
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.info_outline_rounded, size: 16, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Text(
                    '1 ${_productType.defaultPackUnit} = '
                    '${_packSizeCtrl.text.isEmpty ? "?" : _packSizeCtrl.text} '
                    '${_productType.defaultContentUnit}s',
                    style: AppTypography.label.copyWith(color: AppColors.primary),
                  ),
                ]),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],

            // ── GST Rate ──────────────────────────────────────────────────
            _SectionHeader('Default GST Rate'),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'This default is used in sales. You can override it per purchase.',
              style: AppTypography.caption,
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: AppConstants.gstRates.map((rate) {
                final selected = _gstPercent == rate;
                return ChoiceChip(
                  label: Text('${rate.toInt()}%'),
                  selected: selected,
                  onSelected: (_) => setState(() => _gstPercent = rate),
                  selectedColor: AppColors.primaryContainer,
                  checkmarkColor: AppColors.primary,
                  labelStyle: AppTypography.label.copyWith(
                    color: selected ? AppColors.primary : AppColors.textSecondary,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: selected ? AppColors.primary : AppColors.border,
                  ),
                  backgroundColor: AppColors.surface,
                );
              }).toList(),
            ),
            const SizedBox(height: AppSpacing.xl),

            // ── Classification ────────────────────────────────────────────
            _SectionHeader('Drug Schedule'),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ProductDivision.values.map((div) {
                final selected = _division == div;
                return ChoiceChip(
                  label: Text(div.displayName),
                  selected: selected,
                  onSelected: (_) => setState(() => _division = div),
                  selectedColor: AppColors.primaryContainer,
                  checkmarkColor: AppColors.primary,
                  labelStyle: AppTypography.label.copyWith(
                    color: selected ? AppColors.primary : AppColors.textSecondary,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: selected ? AppColors.primary : AppColors.border,
                  ),
                  backgroundColor: AppColors.surface,
                );
              }).toList(),
            ),
            const SizedBox(height: AppSpacing.xl),

            // ── Settings ──────────────────────────────────────────────────
            _SectionHeader('Settings'),
            const SizedBox(height: AppSpacing.md),
            Row(children: [
              Expanded(
                child: AppTextField(
                  label: 'Default MRP (₹)',
                  controller: _mrpCtrl,
                  hint: '0.00',
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  prefixIcon: Icons.currency_rupee_rounded,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppTextField(
                  label: 'Default Rate (₹)',
                  controller: _rateCtrl,
                  hint: '0.00',
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  prefixIcon: Icons.currency_rupee_rounded,
                ),
              ),
            ]),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Low Stock Alert Threshold',
              controller: _lowStockCtrl,
              hint: '1',
              keyboardType: TextInputType.number,
              prefixIcon: Icons.warning_amber_rounded,
            ),
            const SizedBox(height: AppSpacing.md),
            _ToggleTile(
              title: 'Requires Cold Storage',
              subtitle: 'Refrigeration required (2–8°C)',
              icon: Icons.ac_unit_rounded,
              iconColor: const Color(0xFF0EA5E9),
              value: _requiresColdStorage,
              onChanged: (v) => setState(() => _requiresColdStorage = v),
            ),
            if (_isEditing) ...[
              const SizedBox(height: AppSpacing.md),
              _ToggleTile(
                title: 'Active',
                subtitle: "Inactive products won't appear in purchase/sales",
                icon: Icons.toggle_on_rounded,
                iconColor: AppColors.success,
                value: _isActive,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),

            // ── Save ──────────────────────────────────────────────────────
            SizedBox(
              width: double.infinity,
              child: AppButton(
                label: _isEditing ? 'Update Product' : 'Create Product',
                icon: _isEditing ? Icons.save_rounded : Icons.add_rounded,
                isLoading: _loading,
                onPressed: _save,
              ),
            ),
            if (_isEditing) ...[
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: _loading ? null : () => _confirmDelete(context),
                  icon: const Icon(Icons.delete_outline_rounded, color: AppColors.error),
                  label: const Text('Delete Product', style: TextStyle(color: AppColors.error)),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.xxl),
          ],
        ),
      ),
    );
  }
}

// ── Product Type Selector ─────────────────────────────────────────────────────
class _TypeSelector extends StatelessWidget {
  final ProductType selected;
  final ValueChanged<ProductType> onChanged;
  const _TypeSelector({required this.selected, required this.onChanged});

  static const _types = [
    (ProductType.tablet,    Icons.medication_rounded,          'Tablet'),
    (ProductType.capsule,   Icons.medication_liquid_rounded,   'Capsule'),
    (ProductType.syrup,     Icons.local_drink_rounded,         'Syrup'),
    (ProductType.injection, Icons.vaccines_rounded,            'Injection'),
    (ProductType.cream,     Icons.soap_rounded,                'Cream'),
    (ProductType.drops,     Icons.opacity_rounded,             'Drops'),
    (ProductType.ointment,  Icons.sanitizer_rounded,           'Ointment'),
    (ProductType.powder,    Icons.grain_rounded,               'Powder'),
    (ProductType.others,    Icons.category_rounded,            'Others'),
  ];

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.1,
      children: _types.map((t) {
        final (type, icon, label) = t;
        final isSelected = selected == type;
        return GestureDetector(
          onTap: () => onChanged(type),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            decoration: BoxDecoration(
              color: isSelected ? AppColors.primaryContainer : AppColors.surface2,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected ? AppColors.primary : AppColors.border,
                width: isSelected ? 1.5 : 1,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon,
                    size: 22,
                    color: isSelected ? AppColors.primary : AppColors.textMuted),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: AppTypography.caption.copyWith(
                    color: isSelected ? AppColors.primary : AppColors.textSecondary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 10,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Section Header ─────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: AppTypography.labelLarge.copyWith(color: AppColors.textSecondary)),
        const SizedBox(width: 12),
        Expanded(child: Divider(color: AppColors.border, thickness: 1)),
      ],
    );
  }
}

// ── Toggle Tile ────────────────────────────────────────────────────────────────
class _ToggleTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _ToggleTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border),
      ),
      child: SwitchListTile(
        value: value,
        onChanged: onChanged,
        title: Text(title, style: AppTypography.label),
        subtitle: Text(subtitle, style: AppTypography.caption),
        secondary: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        activeThumbColor: AppColors.primary,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 4),
      ),
    );
  }
}
