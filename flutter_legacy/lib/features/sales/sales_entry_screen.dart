import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:uuid/uuid.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/providers/customer_provider.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/product_model.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/customer_model.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_chip.dart';
import '../../shared/widgets/alphabet_scrollbar.dart';

class SalesEntryScreen extends ConsumerStatefulWidget {
  final String? billId;
  const SalesEntryScreen({super.key, this.billId});

  @override
  ConsumerState<SalesEntryScreen> createState() => _SalesEntryScreenState();
}

class _SalesEntryScreenState extends ConsumerState<SalesEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _customerSearchCtrl = TextEditingController();
  final _customerSearchFocus = FocusNode();
  final _phoneCtrl = TextEditingController();
  final _doctorCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  CustomerModel? _selectedCustomer;
  PaymentMethod _paymentMethod = PaymentMethod.cash;
  List<_SalesItemForm> _items = [];
  bool _isLoading = false;
  bool _showCustomerDropdown = false;
  List<CustomerModel> _customerResults = [];
  XFile? _prescriptionFile;
  Uint8List? _prescriptionBytes;
  DateTime _saleDate = DateTime.now();
  String? _existingInvoiceNumber;
  DateTime? _existingCreatedAt;
  String? _existingCreatedByUid;
  String? _existingCreatedByName;
  bool _existingIsCreditPaid = false;

  String _schemeDiscountType = 'amount';
  final _schemeDiscountValueCtrl = TextEditingController(text: '0');
  bool _isRoundOff = true;

  @override
  void initState() {
    super.initState();
    _customerSearchCtrl.addListener(_onCustomerSearch);
    _customerSearchFocus.addListener(_onCustomerFocusChanged);
    if (widget.billId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadExistingBill());
    } else {
      _items.add(_SalesItemForm());
    }
  }

  @override
  void dispose() {
    _customerSearchCtrl.dispose();
    _customerSearchFocus.dispose();
    _phoneCtrl.dispose();
    _doctorCtrl.dispose();
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    _schemeDiscountValueCtrl.dispose();
    super.dispose();
  }

  // ── Customer search with focus-show-all ───────────────────────────────────
  void _onCustomerFocusChanged() {
    if (_customerSearchFocus.hasFocus) {
      _showAllCustomers();
    } else {
      Future.delayed(const Duration(milliseconds: 200), () {
        if (mounted && !_customerSearchFocus.hasFocus) {
          setState(() => _showCustomerDropdown = false);
        }
      });
    }
  }

  void _showAllCustomers() {
    final customers = ref.read(customersProvider).value ?? [];
    final query = _customerSearchCtrl.text.trim();
    setState(() {
      _customerResults = query.isEmpty
          ? customers.take(15).toList()
          : customers
              .where((c) =>
                  c.name.toLowerCase().contains(query.toLowerCase()) ||
                  c.phone.contains(query))
              .take(15)
              .toList();
      _showCustomerDropdown = _customerResults.isNotEmpty;
    });
  }

  void _onCustomerSearch() {
    if (!_customerSearchFocus.hasFocus) return;
    final query = _customerSearchCtrl.text.trim();
    final customers = ref.read(customersProvider).value ?? [];
    if (query.isEmpty) {
      setState(() {
        _customerResults = customers.take(15).toList();
        _showCustomerDropdown = _customerResults.isNotEmpty;
      });
      return;
    }
    if (_selectedCustomer != null && query == _selectedCustomer!.name) return;
    setState(() {
      _selectedCustomer = null;
      _customerResults = customers
          .where((c) =>
              c.name.toLowerCase().contains(query.toLowerCase()) ||
              c.phone.contains(query))
          .take(15)
          .toList();
      _showCustomerDropdown = _customerResults.isNotEmpty;
    });
  }

  Future<void> _loadExistingBill() async {
    SalesBillModel? bill;
    final cached = ref.read(salesBillsProvider).value ?? [];
    final found = cached.where((b) => b.id == widget.billId).toList();
    if (found.isNotEmpty) {
      bill = found.first;
    } else {
      try {
        final doc = await FirebaseFirestore.instance
            .collection('salesBills')
            .doc(widget.billId!)
            .get();
        if (doc.exists) bill = SalesBillModel.fromFirestore(doc);
      } catch (_) {}
    }
    if (bill == null || !mounted) return;

    setState(() {
      _existingInvoiceNumber = bill!.invoiceNumber;
      _existingCreatedAt = bill.createdAt;
      _existingCreatedByUid = bill.createdByUid;
      _existingCreatedByName = bill.createdByName;
      _existingIsCreditPaid = bill.isCreditPaid;
      _schemeDiscountType = bill.schemeDiscountType;
      _schemeDiscountValueCtrl.text = bill.schemeDiscountValue > 0 ? bill.schemeDiscountValue.toStringAsFixed(2) : '0';
      _isRoundOff = bill.isRoundOff;
      _customerSearchCtrl.text = bill.customerName;
      _phoneCtrl.text = bill.customerPhone ?? '';
      _doctorCtrl.text = bill.doctorName ?? '';
      _addressCtrl.text = bill.customerAddress ?? '';
      _notesCtrl.text = bill.notes ?? '';
      _paymentMethod = bill.paymentMethod;
      _saleDate = bill.saleDate;

      if (bill.customerId != null) {
        _selectedCustomer = CustomerModel(
          id: bill.customerId,
          name: bill.customerName,
          phone: bill.customerPhone ?? '',
          address: bill.customerAddress,
          doctorName: bill.doctorName,
          createdAt: DateTime.now(),
        );
      }

      _items = bill.items.map((item) {
        final form = _SalesItemForm();
        form.productId = item.productId;
        form.productName = item.productName;
        form.batchNumber = item.batchNumber;
        form.expiryDate = item.expiryDate;
        // mrp in stored bill is per-strip; rate is per-unit
        form.stripMrp = item.mrp;
        form.gstPercent = item.gstPercent;
        form.stripQty = item.packQuantity;
        form.looseQty = item.quantity - (item.packQuantity * item.packSize);
        form.packSize = item.packSize;
        form.discountPercent = item.discountPercent;
        form.division = item.division;
        return form;
      }).toList();

      if (_items.isEmpty) _items.add(_SalesItemForm());
    });
  }

  double get _subtotal => _items.fold(0, (acc, i) => acc + i.taxableAmount);
  double get _totalDiscount => _items.fold(0, (acc, i) => acc + i.discountAmount);

  double get _schemeDiscountValue {
    return double.tryParse(_schemeDiscountValueCtrl.text.trim()) ?? 0.0;
  }

  double get _schemeDiscountAmount {
    final val = _schemeDiscountValue;
    if (val == 0) return 0;
    if (_schemeDiscountType == 'percent') {
      return _subtotal * (val / 100);
    }
    return val;
  }

  double get _roundOffAmount {
    if (!_isRoundOff) return 0;
    final total = _subtotal - _schemeDiscountAmount;
    return total.roundToDouble() - total;
  }

  double get _grandTotal {
    final total = _subtotal - _schemeDiscountAmount;
    if (_isRoundOff) {
      return total.roundToDouble();
    }
    return total;
  }

  Future<void> _pickPrescription() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1200,
      maxHeight: 1200,
      imageQuality: 60,
    );
    if (picked != null) {
      final bytes = await picked.readAsBytes();
      setState(() {
        _prescriptionFile = picked;
        _prescriptionBytes = bytes;
      });
    }
  }

  Future<String?> _uploadPrescription() async {
    if (_prescriptionBytes == null) return null;
    final ref = FirebaseStorage.instance.ref('prescriptions/${const Uuid().v4()}.jpg');
    await ref.putData(_prescriptionBytes!);
    return await ref.getDownloadURL();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_items.isEmpty) return;

    // ── Validate: Schedule H/H1/X must have prescription ─────────────────
    final restrictedItems = _items.where((i) =>
        i.productId.isNotEmpty &&
        (i.division == 'Schedule H' ||
         i.division == 'Schedule H1' ||
         i.division == 'Schedule X')).toList();

    if (restrictedItems.isNotEmpty && _prescriptionBytes == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Prescription required for: ${restrictedItems.map((i) => i.productName).join(", ")}. '
            'Upload prescription before saving.',
          ),
          backgroundColor: AppColors.error,
          duration: const Duration(seconds: 4),
          action: SnackBarAction(
            label: 'Upload',
            textColor: Colors.white,
            onPressed: _pickPrescription,
          ),
        ));
      }
      return;
    }

    // ── Validate: Stock limits ──────────────────────────────────────────────
    final overstockItems = _items.where((i) =>
        i.productId.isNotEmpty &&
        i.selectedInventory != null &&
        i.quantity > i.selectedInventory!.totalStock).toList();

    if (overstockItems.isNotEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Cannot sell more than available stock for: ${overstockItems.map((i) => i.productName).join(", ")}',
          ),
          backgroundColor: AppColors.error,
        ));
      }
      return;
    }

    setState(() => _isLoading = true);
    final user = ref.read(authNotifierProvider).value!;

    String? prescUrl;
    if (_prescriptionFile != null) prescUrl = await _uploadPrescription();

    String invoiceNum;
    if (_existingInvoiceNumber != null) {
      invoiceNum = _existingInvoiceNumber!;
    } else {
      final nextNum = await ref.read(nextInvoiceNumberProvider.future);
      invoiceNum = AppFormatters.generateInvoiceNumber('ADG', nextNum);
    }

    final hasRestricted = restrictedItems.isNotEmpty;

    final bill = SalesBillModel(
      id: widget.billId,
      invoiceNumber: invoiceNum,
      customerId: _selectedCustomer?.id,
      customerName: _customerSearchCtrl.text.trim(),
      customerPhone: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
      doctorName: _doctorCtrl.text.trim().isEmpty ? null : _doctorCtrl.text.trim(),
      customerAddress: _addressCtrl.text.trim().isEmpty ? null : _addressCtrl.text.trim(),
      saleDate: _saleDate,
      createdAt: _existingCreatedAt ?? DateTime.now(),
      createdByUid: _existingCreatedByUid ?? user.uid,
      createdByName: _existingCreatedByName ?? user.name,
      paymentMethod: _paymentMethod,
      items: _items
          .where((i) => i.productId.isNotEmpty && i.quantity > 0)
          .map((i) => i.toSalesItem())
          .toList(),
      subtotal: _subtotal,
      totalDiscount: _totalDiscount,
      totalGst: 0,
      grandTotal: _grandTotal,
      isCreditPaid: _existingIsCreditPaid,
      schemeDiscountType: _schemeDiscountType,
      schemeDiscountValue: _schemeDiscountValue,
      schemeDiscountAmount: _schemeDiscountAmount,
      isRoundOff: _isRoundOff,
      roundOffAmount: _roundOffAmount,
      prescriptionUrl: prescUrl,
      isPrescriptionRequired: hasRestricted,
      notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    );

    final error = widget.billId != null
        ? await ref.read(salesNotifierProvider.notifier).updateSale(widget.billId!, bill)
        : await ref.read(salesNotifierProvider.notifier).saveSale(bill);

    if (mounted) {
      setState(() => _isLoading = false);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error'), backgroundColor: AppColors.error),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sale saved!'), backgroundColor: AppColors.success),
        );
        context.pop();
      }
    }
  }

  // ── Product Picker (inventory-based) ────────────────────────────────────────
  void _showProductPicker(int itemIndex) {
    final inventory = ref.read(inventoryProvider).value ?? [];
    final products = ref.read(productsProvider).value ?? [];
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _InventoryPickerSheet(
        inventory: inventory,
        products: products,
        onInventorySelected: (inv, batch, product) {
          setState(() {
            final item = _items[itemIndex];
            item.productId = inv.productId;
            item.productName = inv.productName;
            item.selectedInventory = inv;
            if (product != null) {
              item.packSize = product.packSize;
              item.packUnit = product.packUnit;
              item.contentUnit = product.contentUnit;
              item.hasPack = product.productType.hasPack;
              item.gstPercent = product.gstPercent;
              item.division = product.division.displayName;
            }
            if (batch != null) {
              item.batchNumber = batch.batchNumber;
              item.expiryDate = batch.expiryDate;
              item.stripMrp = batch.mrp; // per-strip MRP from purchase batch
            }
          });
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final inventoryAsync = ref.watch(inventoryProvider);
    final isMobile = MediaQuery.of(context).size.width < 800;

    final titleText = Text(
      widget.billId != null ? 'Edit Sale' : 'New Sale',
      style: AppTypography.h3,
    );
    final saveActions = <Widget>[
      AppButton(
        label: 'Save',
        icon: Icons.save_rounded,
        onPressed: _save,
        isLoading: _isLoading,
        small: isMobile,
      ),
      const SizedBox(width: AppSpacing.lg),
    ];

    if (isMobile) {
      return CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.keyS, control: true): () => _save(),
          const SingleActivator(LogicalKeyboardKey.keyS, meta: true): () => _save(),
        },
        child: DefaultTabController(
          length: 2,
          child: Scaffold(
            backgroundColor: AppColors.background,
            appBar: AppBar(
              backgroundColor: AppColors.surface,
              elevation: 0,
              surfaceTintColor: Colors.transparent,
              title: titleText,
              leading: IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              actions: saveActions,
              bottom: TabBar(
                labelStyle: AppTypography.label.copyWith(fontWeight: FontWeight.w700),
                indicatorColor: AppColors.primary,
                indicatorWeight: 3,
                labelColor: AppColors.primary,
                unselectedLabelColor: AppColors.textSecondary,
                tabs: const [
                  Tab(icon: Icon(Icons.person_outline_rounded, size: 16), text: 'Customer'),
                  Tab(icon: Icon(Icons.medication_rounded, size: 16), text: 'Items'),
                ],
              ),
            ),
            body: Form(
              key: _formKey,
              child: TabBarView(
                children: [
                  SingleChildScrollView(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(children: [
                      _buildCustomerPanel(),
                      const SizedBox(height: AppSpacing.lg),
                      _buildPaymentPanel(),
                      const SizedBox(height: AppSpacing.lg),
                      _buildPrescriptionPanel(),
                      const SizedBox(height: AppSpacing.lg),
                      _buildTotalsPanel(),
                      const SizedBox(height: AppSpacing.xl),
                    ]),
                  ),
                  Column(children: [
                    _buildItemsHeader(),
                    Expanded(
                      child: inventoryAsync.when(
                        loading: () => const Center(
                            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
                        error: (e, _) => Center(child: Text('$e')),
                        data: (_) => _buildItemsList(),
                      ),
                    ),
                    _buildStickyTotal(),
                  ]),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // ── Desktop layout ─────────────────────────────────────────────────
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyS, control: true): () => _save(),
        const SingleActivator(LogicalKeyboardKey.keyS, meta: true): () => _save(),
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: AppColors.surface,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          title: titleText,
          leading: IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          actions: saveActions,
        ),
        body: Form(
          key: _formKey,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 300,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(children: [
                    _buildCustomerPanel(),
                    const SizedBox(height: AppSpacing.lg),
                    _buildPaymentPanel(),
                    const SizedBox(height: AppSpacing.lg),
                    _buildPrescriptionPanel(),
                  ]),
                ),
              ),
              const VerticalDivider(color: AppColors.border, width: 1),
              Expanded(
                child: Column(children: [
                  _buildItemsHeader(),
                  Expanded(
                    child: inventoryAsync.when(
                      loading: () => const Center(child: CircularProgressIndicator()),
                      error: (e, _) => Text('$e'),
                      data: (_) => _buildItemsList(),
                    ),
                  ),
                  _buildStickyTotal(),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Also add sticky total to mobile items tab
  Widget _buildStickyTotal() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (_totalDiscount > 0)
                Text(
                  'Discount  -${AppFormatters.formatCurrency(_totalDiscount)}',
                  style: AppTypography.caption.copyWith(color: AppColors.success),
                ),
              Text(
                '${_items.where((i) => i.productId.isNotEmpty).length} items  ·  '
                '${_items.fold(0.0, (a, i) => a + i.quantity).toStringAsFixed(0)} units',
                style: AppTypography.caption,
              ),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('Total Payable', style: AppTypography.caption),
            Text(
              AppFormatters.formatCurrency(_grandTotal),
              style: AppTypography.numeric.copyWith(
                color: AppColors.primary,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
          ]),
        ],
      ),
    );
  }


  // ─────────────────────────────────────────────────────────────────────────────
  Widget _buildCustomerPanel() {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Customer Details', style: AppTypography.h3),
        const SizedBox(height: AppSpacing.lg),
        Column(children: [
          AppTextField(
            label: 'Customer Name *',
            controller: _customerSearchCtrl,
            focusNode: _customerSearchFocus,
            prefixIcon: Icons.person_rounded,
            hint: 'Search or enter name...',
            onTap: _showAllCustomers,
            validator: (v) => v?.isEmpty ?? true ? 'Required' : null,
            suffix: _selectedCustomer != null
                ? const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 18)
                : null,
          ),
          if (_showCustomerDropdown)
            Container(
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 8,
                      offset: const Offset(0, 4))
                ],
              ),
              child: Column(
                children: _customerResults.map((c) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.person_outline_rounded,
                      color: AppColors.textMuted, size: 16),
                  title: Text(c.name, style: AppTypography.labelLarge),
                  subtitle: Text(c.phone, style: AppTypography.caption),
                  onTap: () {
                    _customerSearchFocus.unfocus();
                    setState(() {
                      _selectedCustomer = c;
                      _customerSearchCtrl.text = c.name;
                      _phoneCtrl.text = c.phone;
                      _doctorCtrl.text = c.doctorName ?? '';
                      _addressCtrl.text = c.address ?? '';
                      _showCustomerDropdown = false;
                    });
                  },
                )).toList(),
              ),
            ),
        ]),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Phone',
          controller: _phoneCtrl,
          keyboardType: TextInputType.phone,
          prefixIcon: Icons.phone_rounded,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Doctor Name',
          controller: _doctorCtrl,
          prefixIcon: Icons.medical_services_outlined,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Address',
          controller: _addressCtrl,
          prefixIcon: Icons.location_on_outlined,
          maxLines: 2,
        ),
      ]),
    );
  }

  Widget _buildPaymentPanel() {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Payment Method', style: AppTypography.h3),
        const SizedBox(height: AppSpacing.lg),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: AppSpacing.sm,
          mainAxisSpacing: AppSpacing.sm,
          childAspectRatio: 2.8,
          children: PaymentMethod.values.map((method) {
            final isSelected = _paymentMethod == method;
            return GestureDetector(
              onTap: () => setState(() => _paymentMethod = method),
              child: Container(
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primaryContainer : AppColors.surface2,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(
                      color: isSelected ? AppColors.primary : AppColors.border),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(method.icon, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 4),
                    Text(method.displayName,
                        style: AppTypography.label.copyWith(
                          color: isSelected ? AppColors.primary : AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        )),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ]),
    );
  }

  Widget _buildPrescriptionPanel() {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Prescription', style: AppTypography.h3),
        const SizedBox(height: AppSpacing.lg),
        if (_prescriptionBytes != null)
          Stack(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              child: Image.memory(
                _prescriptionBytes!,
                height: 120,
                width: double.infinity,
                fit: BoxFit.cover,
              ),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                onPressed: () => setState(() {
                  _prescriptionFile = null;
                  _prescriptionBytes = null;
                }),
                icon: const Icon(Icons.close_rounded, color: Colors.white, size: 16),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.error.withValues(alpha: 0.8),
                  padding: const EdgeInsets.all(4),
                ),
              ),
            ),
          ])
        else
          InkWell(
            onTap: _pickPrescription,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.xl),
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Column(children: [
                const Icon(Icons.camera_alt_outlined, color: AppColors.textMuted, size: 28),
                const SizedBox(height: AppSpacing.sm),
                Text('Upload Prescription', style: AppTypography.bodySmall),
                Text('Tap to take photo', style: AppTypography.caption),
              ]),
            ),
          ),
      ]),
    );
  }

  Widget _buildSchemeDiscountInput() {
    return Row(
      children: [
        Expanded(
          flex: 2,
          child: Text('Scheme Discount', style: AppTypography.labelLarge),
        ),
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _schemeDiscountValueCtrl,
            onChanged: (_) => setState(() {}),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
            decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.all(8)),
            style: AppTypography.body,
          ),
        ),
        const SizedBox(width: 8),
        ToggleButtons(
          isSelected: [_schemeDiscountType == 'percent', _schemeDiscountType == 'amount'],
          onPressed: (index) {
            setState(() {
              _schemeDiscountType = index == 0 ? 'percent' : 'amount';
            });
          },
          constraints: const BoxConstraints(minHeight: 32, minWidth: 40),
          children: const [Text('%'), Text('₹')],
        ),
      ],
    );
  }

  Widget _buildRoundOffToggle() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Round Off', style: AppTypography.labelLarge),
        Switch(
          value: _isRoundOff,
          onChanged: (val) => setState(() => _isRoundOff = val),
        ),
      ],
    );
  }

  Widget _buildTotalsPanel() {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      backgroundColor: AppColors.surface2,
      child: Column(children: [
        _buildSchemeDiscountInput(),
        const SizedBox(height: AppSpacing.sm),
        _buildRoundOffToggle(),
        const Divider(color: AppColors.border),
        _TotalRow(label: 'Value of Goods', value: _subtotal + _totalDiscount),
        if (_totalDiscount > 0)
          _TotalRow(label: 'Item Discount (-)', value: _totalDiscount, valueColor: AppColors.success),
        if (_schemeDiscountAmount > 0)
          _TotalRow(label: 'Scheme Discount (-)', value: _schemeDiscountAmount, valueColor: AppColors.success),
        if (_isRoundOff && _roundOffAmount != 0)
          _TotalRow(label: 'Round Off', value: _roundOffAmount, valueColor: AppColors.warning),
        const Divider(color: AppColors.border),
        _TotalRow(
          label: 'Payable Amount',
          value: _grandTotal,
          valueColor: AppColors.primary,
          isTotal: true,
        ),
      ]),
    );
  }

  Widget _buildItemsHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(children: [
        Text('Products (${_items.where((i) => i.productId.isNotEmpty).length})',
            style: AppTypography.h3),
        const Spacer(),
        AppButton(
          label: 'Add Product',
          icon: Icons.add_rounded,
          onPressed: () {
            setState(() => _items.add(_SalesItemForm()));
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _showProductPicker(_items.length - 1);
            });
          },
          small: true,
        ),
      ]),
    );
  }

  Widget _buildItemsList() {
    if (_items.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.medication_outlined, size: 36, color: AppColors.textMuted),
          const SizedBox(height: AppSpacing.md),
          Text('No items added', style: AppTypography.bodySmall),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Add Product',
            icon: Icons.add_rounded,
            small: true,
            onPressed: () {
              setState(() => _items.add(_SalesItemForm()));
              WidgetsBinding.instance.addPostFrameCallback((_) => _showProductPicker(0));
            },
          ),
        ]),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.lg),
      itemBuilder: (_, i) => _SalesItemCard(
        key: ValueKey(_items[i].id),
        item: _items[i],
        index: i,
        onChanged: () => setState(() {}),
        onRemove: _items.length > 1 ? () => setState(() => _items.removeAt(i)) : null,
        onPickProduct: () => _showProductPicker(i),
      ),
    );
  }
}

// ─── Sales Item Form (state holder) ──────────────────────────────────────────
class _SalesItemForm {
  final String id = const Uuid().v4();
  String productId = '';
  String productName = '';
  String batchNumber = '';
  DateTime expiryDate = DateTime.now();

  /// MRP per strip/unit (as on the batch label).
  double stripMrp = 0;

  double gstPercent = 12;
  int packSize = 1;         // tablets per strip
  double stripQty = 0;      // whole strips being sold
  double looseQty = 0;      // loose tablets/units being sold
  double discountPercent = 0;
  String division = 'General';
  String packUnit = 'Strip';
  String contentUnit = 'Tablet';
  bool hasPack = true;      // tablets/capsules support loose units

  /// Selected inventory reference (for batch picker).
  InventoryModel? selectedInventory;

  /// Per-unit/tablet MRP = stripMrp Ã· packSize.
  double get perUnitMrp => packSize > 1 ? stripMrp / packSize : stripMrp;

  /// Total content units for inventory deduction.
  double get quantity => (stripQty * packSize) + looseQty;

  /// Gross amount: strips at strip MRP + loose at per-unit MRP.
  double get grossAmount => (stripQty * stripMrp) + (looseQty * perUnitMrp);

  /// MRP is tax-inclusive. lineTotal = gross × (1 - discount%).
  /// No GST added on top of MRP for sales billing.
  double get taxableAmount => grossAmount * (1 - discountPercent / 100);

  // GST fields are kept for record-keeping / purchase-side only.
  // On sales, lineTotal == taxableAmount (MRP already includes tax).
  double get gstAmount => 0;  // MRP is inclusive — no GST added on sales
  double get lineTotal => taxableAmount;
  double get discountAmount => grossAmount * discountPercent / 100;

  SalesItem toSalesItem() => SalesItem(
    productId: productId.isEmpty ? const Uuid().v4() : productId,
    productName: productName,
    batchNumber: batchNumber,
    expiryDate: expiryDate,
    mrp: stripMrp,
    rate: perUnitMrp,
    gstPercent: gstPercent,   // stored for records, not added to total
    quantity: quantity,
    packQuantity: stripQty,
    packSize: packSize,
    discountPercent: discountPercent,
    division: division,
  );
}

// ─── Sales Item Card ──────────────────────────────────────────────────────────
// ─── Sales Item Card ──────────────────────────────────────────────────────────
class _SalesItemCard extends StatefulWidget {
  final _SalesItemForm item;
  final int index;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;
  final VoidCallback onPickProduct;

  const _SalesItemCard({
    super.key,
    required this.item,
    required this.index,
    required this.onChanged,
    this.onRemove,
    required this.onPickProduct,
  });

  @override
  State<_SalesItemCard> createState() => _SalesItemCardState();
}

class _SalesItemCardState extends State<_SalesItemCard> {
  // Controllers
  late TextEditingController _productSearchCtrl;
  late TextEditingController _mrpCtrl;
  late TextEditingController _stripQtyCtrl;
  late TextEditingController _looseQtyCtrl;
  late TextEditingController _discCtrl;
  late TextEditingController _expiryCtrl;

  // Focus nodes for keyboard chain
  late FocusNode _productFocus;
  late FocusNode _mrpFocus;
  late FocusNode _stripQtyFocus;
  late FocusNode _looseQtyFocus;
  late FocusNode _discFocus;

  // Inline product search state
  bool _showProductOverlay = false;
  List<InventoryModel> _filteredInventory = [];
  String _lastProductId = '';

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _lastProductId = item.productId;
    _productSearchCtrl = TextEditingController(
        text: item.productId.isNotEmpty ? item.productName : '');
    _mrpCtrl = TextEditingController(
        text: item.stripMrp > 0 ? item.stripMrp.toStringAsFixed(2) : '');
    _stripQtyCtrl = TextEditingController(
        text: item.stripQty > 0 ? item.stripQty.toString() : '');
    _looseQtyCtrl = TextEditingController(
        text: item.looseQty > 0 ? item.looseQty.toString() : '');
    _discCtrl = TextEditingController(
        text: item.discountPercent > 0 ? item.discountPercent.toString() : '');
    _expiryCtrl = TextEditingController(text: _dateToMmYy(item.expiryDate));

    _productFocus = FocusNode();
    _mrpFocus = FocusNode();
    _stripQtyFocus = FocusNode();
    _looseQtyFocus = FocusNode();
    _discFocus = FocusNode();

    _productFocus.addListener(() {
      if (_productFocus.hasFocus) {
        setState(() => _showProductOverlay = true);
        _filterInventory(_productSearchCtrl.text);
      } else {
        Future.delayed(const Duration(milliseconds: 150), () {
          if (mounted && !_productFocus.hasFocus) {
            setState(() => _showProductOverlay = false);
          }
        });
      }
    });
  }

  @override
  void didUpdateWidget(covariant _SalesItemCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Sync MRP when batch chosen from bottom-sheet picker
    if (widget.item.productId != _lastProductId) {
      _lastProductId = widget.item.productId;
      _productSearchCtrl.text = widget.item.productName;
      _mrpCtrl.text = widget.item.stripMrp > 0
          ? widget.item.stripMrp.toStringAsFixed(2)
          : '';
      _expiryCtrl.text = _dateToMmYy(widget.item.expiryDate);
      setState(() {});
    } else {
      final newMrp = widget.item.stripMrp;
      if (newMrp > 0 && _mrpCtrl.text != newMrp.toStringAsFixed(2)) {
        _mrpCtrl.text = newMrp.toStringAsFixed(2);
        _mrpCtrl.selection =
            TextSelection.fromPosition(TextPosition(offset: _mrpCtrl.text.length));
        _expiryCtrl.text = _dateToMmYy(widget.item.expiryDate);
      }
    }
  }

  @override
  void dispose() {
    _productSearchCtrl.dispose();
    _mrpCtrl.dispose();
    _stripQtyCtrl.dispose();
    _looseQtyCtrl.dispose();
    _discCtrl.dispose();
    _expiryCtrl.dispose();
    _productFocus.dispose();
    _mrpFocus.dispose();
    _stripQtyFocus.dispose();
    _looseQtyFocus.dispose();
    _discFocus.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _dateToMmYy(DateTime d) =>
      '${d.month.toString().padLeft(2, '0')}/${(d.year % 100).toString().padLeft(2, '0')}';

  DateTime? _parseMmYy(String v) {
    final clean = v.replaceAll('/', '');
    if (clean.length != 4) return null;
    final mm = int.tryParse(clean.substring(0, 2));
    final yy = int.tryParse(clean.substring(2));
    if (mm == null || yy == null || mm < 1 || mm > 12) return null;
    return DateTime(2000 + yy, mm, 28);
  }

  void _filterInventory(String query) {
    final inventory = ProviderScope.containerOf(context)
            .read(inventoryProvider)
            .valueOrNull ??
        [];
    final q = query.toLowerCase();
    setState(() {
      _filteredInventory = inventory
          .where((inv) =>
              inv.totalStock > 0 &&
              (q.isEmpty || inv.productName.toLowerCase().contains(q)))
          .take(20)
          .toList()
        ..sort((a, b) => a.productName.compareTo(b.productName));
    });
  }

  void _selectFromInventory(InventoryModel inv) {
    final products = ProviderScope.containerOf(context)
            .read(productsProvider)
            .valueOrNull ??
        [];
    final product = products.cast<ProductModel?>().firstWhere(
        (p) => p?.id == inv.productId,
        orElse: () => null);

    // Pick best batch (nearest expiry that's not expired)
    final now = DateTime.now();
    final batches = inv.availableBatches
        .where((b) => b.expiryDate.isAfter(now) && b.quantity > 0)
        .toList()
      ..sort((a, b) => a.expiryDate.compareTo(b.expiryDate));
    final bestBatch = batches.isNotEmpty ? batches.first : null;

    setState(() {
      widget.item.productId = inv.productId;
      widget.item.productName = inv.productName;
      widget.item.selectedInventory = inv;
      if (product != null) {
        widget.item.packSize = product.packSize;
        widget.item.packUnit = product.packUnit;
        widget.item.contentUnit = product.contentUnit;
        widget.item.hasPack = product.productType.hasPack;
        widget.item.gstPercent = product.gstPercent;
        widget.item.division = product.division.displayName;
      }
      if (bestBatch != null) {
        widget.item.batchNumber = bestBatch.batchNumber;
        widget.item.expiryDate = bestBatch.expiryDate;
        widget.item.stripMrp = bestBatch.mrp;
        _mrpCtrl.text = bestBatch.mrp.toStringAsFixed(2);
        _expiryCtrl.text = _dateToMmYy(bestBatch.expiryDate);
      } else {
        _expiryCtrl.text = _dateToMmYy(widget.item.expiryDate);
      }
      _productSearchCtrl.text = inv.productName;
      _lastProductId = inv.productId;
      _showProductOverlay = false;
    });
    widget.onChanged();
    // Move focus to MRP field
    Future.delayed(const Duration(milliseconds: 50), () {
      if (mounted) _mrpFocus.requestFocus();
    });
  }

  void _selectBatch(InventoryBatch batch) {
    setState(() {
      widget.item.batchNumber = batch.batchNumber;
      widget.item.expiryDate = batch.expiryDate;
      widget.item.stripMrp = batch.mrp;
      _mrpCtrl.text = batch.mrp.toStringAsFixed(2);
      _expiryCtrl.text = _dateToMmYy(batch.expiryDate);
    });
    widget.onChanged();
  }

  void _update() {
    widget.item.stripMrp = double.tryParse(_mrpCtrl.text) ?? 0;
    widget.item.stripQty = double.tryParse(_stripQtyCtrl.text) ?? 0;
    widget.item.looseQty = double.tryParse(_looseQtyCtrl.text) ?? 0;
    widget.item.discountPercent = double.tryParse(_discCtrl.text) ?? 0;
    final parsed = _parseMmYy(_expiryCtrl.text);
    if (parsed != null) widget.item.expiryDate = parsed;
    widget.onChanged();
  }

  void _moveFocus(FocusNode from, FocusNode to) {
    from.unfocus();
    Future.delayed(const Duration(milliseconds: 20), () {
      if (mounted) to.requestFocus();
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final hasProduct = item.productId.isNotEmpty;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // ── Index badge + Inline product search + Delete ───────────────────
        Row(children: [
          Container(
            width: 30, height: 30,
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text('${widget.index + 1}',
                  style: AppTypography.label.copyWith(color: AppColors.primary)),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Inline search text field
              TextField(
                controller: _productSearchCtrl,
                focusNode: _productFocus,
                decoration: InputDecoration(
                  hintText: hasProduct ? null : 'Type to search product...',
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  prefixIcon: Icon(
                    hasProduct ? Icons.medication_rounded : Icons.search_rounded,
                    size: 16,
                    color: hasProduct ? AppColors.primary : AppColors.textMuted,
                  ),
                  filled: true,
                  fillColor: hasProduct
                      ? AppColors.primaryContainer
                      : AppColors.surface2,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    borderSide: BorderSide(
                        color: hasProduct
                            ? AppColors.primary.withValues(alpha: 0.3)
                            : AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    borderSide: BorderSide(
                        color: hasProduct
                            ? AppColors.primary.withValues(alpha: 0.3)
                            : AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    borderSide: const BorderSide(color: AppColors.primary),
                  ),
                  suffixIcon: hasProduct
                      ? GestureDetector(
                          onTap: () {
                            setState(() {
                              widget.item.productId = '';
                              widget.item.productName = '';
                              widget.item.selectedInventory = null;
                              _productSearchCtrl.text = '';
                              _lastProductId = '';
                            });
                            _productFocus.requestFocus();
                          },
                          child: const Icon(Icons.close_rounded,
                              size: 16, color: AppColors.textMuted),
                        )
                      : null,
                ),
                style: AppTypography.label.copyWith(
                    color: hasProduct ? AppColors.primary : AppColors.textPrimary),
                onChanged: (v) => _filterInventory(v),
                onSubmitted: (_) {
                  if (_filteredInventory.isNotEmpty) {
                    _selectFromInventory(_filteredInventory.first);
                  }
                },
              ),

              // Search overlay dropdown
              if (_showProductOverlay && _filteredInventory.isNotEmpty)
                Container(
                  constraints: const BoxConstraints(maxHeight: 200),
                  margin: const EdgeInsets.only(top: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(color: AppColors.border),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 8,
                          offset: const Offset(0, 3))
                    ],
                  ),
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    itemCount: _filteredInventory.length,
                    itemBuilder: (_, i) {
                      final inv = _filteredInventory[i];
                      final isLow = inv.totalStock <= 10 && inv.totalStock > 0;
                      return InkWell(
                        onTap: () => _selectFromInventory(inv),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 8),
                          child: Row(children: [
                            Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(inv.productName, style: AppTypography.labelLarge),
                                Text(
                                  '${inv.totalStock.toStringAsFixed(0)} units in stock  '
                                  '· ${inv.availableBatches.length} batch${inv.availableBatches.length != 1 ? "es" : ""}',
                                  style: AppTypography.caption.copyWith(
                                      color: isLow
                                          ? AppColors.warning
                                          : AppColors.textMuted),
                                ),
                              ]),
                            ),
                            Icon(
                              isLow
                                  ? Icons.warning_amber_rounded
                                  : Icons.check_circle_outline_rounded,
                              size: 16,
                              color:
                                  isLow ? AppColors.warning : AppColors.success,
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
            ]),
          ),
          if (widget.onRemove != null) ...[
            const SizedBox(width: AppSpacing.sm),
            IconButton(
              onPressed: widget.onRemove,
              icon: const Icon(Icons.delete_outline_rounded,
                  color: AppColors.error, size: 20),
              visualDensity: VisualDensity.compact,
            ),
          ],
        ]),

        if (!hasProduct) const SizedBox.shrink()
        else ...[
          const SizedBox(height: AppSpacing.sm),

          // Pack info badge
          if (item.packSize > 1)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                '1 ${item.packUnit} = ${item.packSize} ${item.contentUnit}s'
                '  ·  Per ${item.contentUnit}: ₹${item.perUnitMrp.toStringAsFixed(2)}'
                '  ·  Total: ${item.quantity.toStringAsFixed(0)} ${item.contentUnit}s',
                style: AppTypography.caption.copyWith(color: AppColors.primary),
              ),
            ),

          const SizedBox(height: AppSpacing.sm),

          // ── Batch selector (if inventory selected with multiple batches) ──
          if (item.selectedInventory != null &&
              item.selectedInventory!.availableBatches.length > 1)
            _BatchSelector(
              key: ValueKey('bs_${item.productId}'),
              batches: item.selectedInventory!.availableBatches,
              selectedBatchNumber: item.batchNumber,
              onBatchSelected: _selectBatch,
            )
          else ...[
            // Manual batch + MM/YY expiry
            Row(children: [
              Expanded(
                child: TextFormField(
                  initialValue: item.batchNumber,
                  textInputAction: TextInputAction.next,
                  onChanged: (v) {
                    item.batchNumber = v;
                    widget.onChanged();
                  },
                  style: AppTypography.body,
                  decoration: const InputDecoration(
                    labelText: 'Batch No.',
                    isDense: true,
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: TextFormField(
                  controller: _expiryCtrl,
                  textInputAction: TextInputAction.next,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    _SalesMmYyFormatter(),
                  ],
                  style: AppTypography.body,
                  decoration: InputDecoration(
                    labelText: 'Expiry (MM/YY)',
                    isDense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                    suffixIcon:
                        _expiryCtrl.text.length == 5 &&
                                _parseMmYy(_expiryCtrl.text) != null
                            ? const Icon(Icons.check_rounded,
                                size: 16, color: AppColors.success)
                            : null,
                  ),
                  onChanged: (_) => _update(),
                  onFieldSubmitted: (_) => _moveFocus(
                      FocusNode(), _mrpFocus), // move to MRP
                ),
              ),
            ]),
          ],

          const SizedBox(height: AppSpacing.sm),

          // ── MRP/Strip + Discount % ─────────────────────────────────────
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _mrpCtrl,
                focusNode: _mrpFocus,
                textInputAction: TextInputAction.next,
                onChanged: (_) => _update(),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
                ],
                style: AppTypography.body,
                decoration: InputDecoration(
                  labelText: 'MRP/${item.packUnit} (₹)',
                  prefixText: '₹ ',
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                ),
                onFieldSubmitted: (_) => _moveFocus(_mrpFocus, _stripQtyFocus),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: TextFormField(
                controller: _discCtrl,
                focusNode: _discFocus,
                onChanged: (_) => _update(),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
                ],
                style: AppTypography.body,
                decoration: const InputDecoration(
                  labelText: 'Discount %',
                  suffixText: '%',
                  isDense: true,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                ),
              ),
            ),
          ]),

          const SizedBox(height: AppSpacing.sm),

          // ── Strips qty + Loose tablets qty ─────────────────────────────
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _stripQtyCtrl,
                focusNode: _stripQtyFocus,
                textInputAction: TextInputAction.next,
                onChanged: (_) => _update(),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
                ],
                style: AppTypography.body,
                decoration: InputDecoration(
                  labelText: '${item.packUnit}s',
                  hintText: '0',
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                ),
                onFieldSubmitted: (_) =>
                    _moveFocus(_stripQtyFocus, _looseQtyFocus),
              ),
            ),
            if (item.hasPack) ...[
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: TextFormField(
                  controller: _looseQtyCtrl,
                  focusNode: _looseQtyFocus,
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => _update(),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))
                  ],
                  style: AppTypography.body,
                  decoration: InputDecoration(
                    labelText: 'Loose ${item.contentUnit}s',
                    hintText: '0',
                    isDense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                  ),
                  onFieldSubmitted: (_) =>
                      _moveFocus(_looseQtyFocus, _discFocus),
                ),
              ),
            ],
          ]),

          // Line total chip
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: Alignment.centerRight,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Text(
                'Total: ${AppFormatters.formatCurrency(item.lineTotal)}',
                style: AppTypography.numericSmall
                    .copyWith(color: AppColors.primary),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

// ─── Sales MM/YY Formatter ────────────────────────────────────────────────────
class _SalesMmYyFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll('/', '');
    if (digits.length > 4) return oldValue;
    final result = digits.length <= 2
        ? digits
        : '${digits.substring(0, 2)}/${digits.substring(2)}';
    return TextEditingValue(
      text: result,
      selection: TextSelection.collapsed(offset: result.length),
    );
  }
}



// ─── Inventory Picker Modal ───────────────────────────────────────────────────
/// Two-step picker: first choose product from inventory, then choose batch.
class _InventoryPickerSheet extends StatefulWidget {
  final List<InventoryModel> inventory;
  final List<ProductModel> products;
  final void Function(InventoryModel inv, InventoryBatch? batch, ProductModel? product)
      onInventorySelected;

  const _InventoryPickerSheet({
    required this.inventory,
    required this.products,
    required this.onInventorySelected,
  });

  @override
  State<_InventoryPickerSheet> createState() => _InventoryPickerSheetState();
}

class _InventoryPickerSheetState extends State<_InventoryPickerSheet> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  InventoryModel? _selectedProduct;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<InventoryModel> get _filtered {
    final q = _search.toLowerCase();
    return widget.inventory
        .where((i) =>
            i.totalStock > 0 &&
            (q.isEmpty || i.productName.toLowerCase().contains(q)))
        .toList()
      ..sort((a, b) => a.productName.compareTo(b.productName));
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      builder: (_, controller) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          const SizedBox(height: 12),
          Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              if (_selectedProduct != null)
                IconButton(
                  icon: const Icon(Icons.arrow_back_rounded, size: 20),
                  onPressed: () => setState(() => _selectedProduct = null),
                ),
              Expanded(
                child: Text(
                  _selectedProduct == null
                      ? 'Select Product'
                      : _selectedProduct!.productName,
                  style: AppTypography.h3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ]),
          ),
          const SizedBox(height: 8),

          // Step 1: Product list
          if (_selectedProduct == null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextField(
                controller: _searchCtrl,
                autofocus: true,
                onChanged: (v) => setState(() => _search = v),
                decoration: const InputDecoration(
                  hintText: 'Search product name...',
                  prefixIcon: Icon(Icons.search_rounded, size: 18),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            Expanded(
              child: _filtered.isEmpty
                  ? Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.search_off_rounded,
                            size: 36, color: AppColors.textMuted),
                        const SizedBox(height: 12),
                        Text('No in-stock products found',
                            style: AppTypography.bodySmall),
                      ]),
                    )
                  : Stack(
                      children: [
                        ListView.builder(
                        controller: controller,
                        padding: const EdgeInsets.all(16),
                        itemCount: _filtered.length,
                        itemExtent: 78,
                        itemBuilder: (_, i) {
                          final inv = _filtered[i];
                          final batch = inv.nextToDispense;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: ListTile(
                            onTap: () => setState(() => _selectedProduct = inv),
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                              side: const BorderSide(color: AppColors.border),
                            ),
                            tileColor: AppColors.background,
                            leading: Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(Icons.medication_rounded,
                                  size: 20, color: AppColors.primary),
                            ),
                            title: Text(inv.productName,
                                style: AppTypography.labelLarge),
                            subtitle: Text(
                              batch != null
                                  ? 'Batch: ${batch.batchNumber}  ·  MRP: ₹${batch.mrp.toStringAsFixed(0)}'
                                  : 'No batch info',
                              style: AppTypography.caption,
                            ),
                            trailing: StatusChip(
                              label: inv.isLowStock
                                  ? 'Low: ${inv.totalStock.toStringAsFixed(0)}'
                                  : '${inv.totalStock.toStringAsFixed(0)} units',
                              type: inv.isLowStock
                                  ? StatusType.warning
                                  : StatusType.success,
                              small: true,
                            ),
                          ),
                        );
                        },
                      ),
                      Positioned(
                        right: 0,
                        top: 0,
                        bottom: 0,
                        child: AlphabetScrollbar(
                          scrollController: controller,
                          items: _filtered.map((i) => i.productName).toList(),
                          estimatedItemHeight: 78,
                          topOffset: 16,
                        ),
                      ),
                    ],
                  ),
            ),
          ]

          // Step 2: Batch selection
          else ...[
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Select Batch', style: AppTypography.labelLarge
                      .copyWith(color: AppColors.textSecondary)),
                  const SizedBox(height: 12),
                  if (_selectedProduct!.availableBatches.isEmpty)
                    const Center(child: Text('No batches with stock'))
                  else
                    ..._selectedProduct!.availableBatches.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final batch = entry.value;
                      final isFEFO = idx == 0;
                      final daysLeft =
                          batch.expiryDate.difference(DateTime.now()).inDays;
                      final expiryColor = daysLeft < 0
                          ? AppColors.error
                          : daysLeft < 90
                              ? AppColors.warning
                              : AppColors.success;

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: AppColors.background,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            onTap: () {
                              final product = widget.products
                                  .where((p) => p.id == _selectedProduct!.productId)
                                  .firstOrNull;
                              Navigator.pop(context);
                              widget.onInventorySelected(
                                  _selectedProduct!, batch, product);
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isFEFO
                                      ? AppColors.primary.withValues(alpha: 0.4)
                                      : AppColors.border,
                                  width: isFEFO ? 1.5 : 1,
                                ),
                              ),
                              child: Row(children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(children: [
                                        Text(batch.batchNumber,
                                            style: AppTypography.labelLarge
                                                .copyWith(fontFamily: 'monospace')),
                                        if (isFEFO) ...[
                                          const SizedBox(width: 6),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: AppColors.primaryContainer,
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text('FEFO',
                                                style: AppTypography.caption.copyWith(
                                                    color: AppColors.primary,
                                                    fontSize: 9)),
                                          ),
                                        ],
                                      ]),
                                      const SizedBox(height: 3),
                                      Text(
                                        'Exp: ${AppFormatters.formatShortDate(batch.expiryDate)}'
                                        '  ·  Qty: ${batch.quantity.toStringAsFixed(0)} units'
                                        '  ·  MRP: ₹${batch.mrp.toStringAsFixed(2)}',
                                        style: AppTypography.caption,
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: expiryColor.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    daysLeft < 0
                                        ? 'Expired'
                                        : '$daysLeft days',
                                    style: AppTypography.caption.copyWith(
                                        color: expiryColor,
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ]),
                            ),
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

// ─── Batch Selector (inline, after product selected) ─────────────────────────
class _BatchSelector extends StatelessWidget {
  final List<InventoryBatch> batches;
  final String selectedBatchNumber;
  final void Function(InventoryBatch) onBatchSelected;

  const _BatchSelector({
    super.key,
    required this.batches,
    required this.selectedBatchNumber,
    required this.onBatchSelected,
  });

  @override
  Widget build(BuildContext context) {
    final selected = batches.firstWhere(
      (b) => b.batchNumber == selectedBatchNumber,
      orElse: () => batches.first,
    );
    final isFEFO = selected.batchNumber == batches.first.batchNumber;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(children: [
        const Icon(Icons.layers_rounded, size: 14, color: AppColors.textMuted),
        const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('Batch: ', style: AppTypography.caption),
              Text(selected.batchNumber,
                  style: AppTypography.label.copyWith(fontFamily: 'monospace')),
              if (isFEFO) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('FEFO',
                      style: AppTypography.overline
                          .copyWith(color: AppColors.primary, fontSize: 9)),
                ),
              ],
            ]),
            Text(
              'Exp: ${AppFormatters.formatShortDate(selected.expiryDate)}'
              '  ·  Qty: ${AppFormatters.formatQuantity(selected.quantity)}'
              '  ·  MRP: ₹${selected.mrp.toStringAsFixed(0)}',
              style: AppTypography.caption,
            ),
          ]),
        ),
        if (batches.length > 1)
          PopupMenuButton<InventoryBatch>(
            tooltip: 'Change batch',
            onSelected: onBatchSelected,
            itemBuilder: (_) => batches.map((b) {
              final isFirst = b.batchNumber == batches.first.batchNumber;
              return PopupMenuItem<InventoryBatch>(
                value: b,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text(b.batchNumber,
                        style: AppTypography.labelLarge.copyWith(fontFamily: 'monospace')),
                    if (isFirst) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('FEFO',
                            style: AppTypography.overline
                                .copyWith(color: AppColors.primary, fontSize: 9)),
                      ),
                    ],
                  ]),
                  Text(
                    'Exp: ${AppFormatters.formatShortDate(b.expiryDate)}'
                    '  ·  Qty: ${AppFormatters.formatQuantity(b.quantity)}'
                    '  ·  ₹${b.mrp.toStringAsFixed(0)}',
                    style: AppTypography.caption,
                  ),
                ]),
              );
            }).toList(),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('Change batch',
                  style: AppTypography.label.copyWith(color: AppColors.primary)),
              const Icon(Icons.expand_more_rounded, size: 14, color: AppColors.primary),
            ]),
          ),
      ]),
    );
  }
}

// ─── Total Row ────────────────────────────────────────────────────────────────
class _TotalRow extends StatelessWidget {
  final String label;
  final double value;
  final Color? valueColor;
  final bool isTotal;

  const _TotalRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.isTotal = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: isTotal ? AppTypography.h3 : AppTypography.bodySmall),
          Text(
            AppFormatters.formatCurrency(value.abs()),
            style: isTotal
                ? AppTypography.numeric.copyWith(color: valueColor ?? AppColors.primary)
                : AppTypography.numericSmall.copyWith(
                    color: valueColor ?? AppColors.textPrimary),
          ),
        ],
      ),
    );
  }
}
