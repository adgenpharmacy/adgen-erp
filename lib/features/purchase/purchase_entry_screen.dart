import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/party_provider.dart';
import '../../core/providers/purchase_provider.dart';
import '../../core/providers/inventory_provider.dart';
import '../../core/utils/constants.dart';
import '../../core/utils/formatters.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/models/product_model.dart';
import '../../shared/models/party_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';
import '../../shared/widgets/app_card.dart';

// ─── Item Form State ──────────────────────────────────────────────────────────
class _PurchaseItemForm {
  // Product reference
  String productId = '';
  String productName = '';
  String hsnCode = '';
  int packSize = 1;
  String packUnit = 'Unit';
  String contentUnit = 'Unit';
  String division = 'General';

  // Batch/Expiry
  String batchNumber = '';
  DateTime expiryDate = DateTime.now().add(const Duration(days: 365));

  // Quantities
  double quantity = 0;      // In pack units (strips)
  double freeQuantity = 0;  // In pack units

  // Pricing
  double mrp = 0;
  double rate = 0;
  double gstPercent = 12;
  double discountPercent = 0;

  // Computed
  double get taxableAmount {
    final gross = rate * quantity;
    return gross - (gross * discountPercent / 100);
  }
  double get gstAmount => taxableAmount * gstPercent / 100;
  double get lineTotal => taxableAmount + gstAmount;
  double get discountAmount => rate * quantity * discountPercent / 100;

  /// Total tablets/ml/units going into inventory
  double get totalContentQty => (quantity + freeQuantity) * packSize;

  PurchaseItem toPurchaseItem() => PurchaseItem(
        productId: productId,
        productName: productName,
        hsnCode: hsnCode,
        batchNumber: batchNumber,
        expiryDate: expiryDate,
        quantity: quantity,
        freeQuantity: freeQuantity,
        packSize: packSize,
        packUnit: packUnit,
        contentUnit: contentUnit,
        mrp: mrp,
        rate: rate,
        gstPercent: gstPercent,
        discountPercent: discountPercent,
        division: division,
      );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
class PurchaseEntryScreen extends ConsumerStatefulWidget {
  final String? billId;
  const PurchaseEntryScreen({super.key, this.billId});

  @override
  ConsumerState<PurchaseEntryScreen> createState() => _PurchaseEntryScreenState();
}

class _PurchaseEntryScreenState extends ConsumerState<PurchaseEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _invoiceCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _partySearchCtrl = TextEditingController();
  final _partySearchFocus = FocusNode();

  PartyModel? _selectedParty;
  DateTime _invoiceDate = DateTime.now();
  LedgerType _ledgerType = LedgerType.credit;
  List<_PurchaseItemForm> _items = [];
  bool _isLoading = false;
  bool _showPartyDropdown = false;
  List<PartyModel> _partyResults = [];

  DateTime? _existingCreatedAt;
  String? _existingCreatedByUid;
  String? _existingCreatedByName;
  bool _existingIsPaid = false;

  String _schemeDiscountType = 'amount';
  final _schemeDiscountValueCtrl = TextEditingController(text: '0');
  bool _isRoundOff = true;

  @override
  void initState() {
    super.initState();
    _partySearchCtrl.addListener(_onPartySearchChanged);
    _partySearchFocus.addListener(_onPartySearchFocusChanged);
    if (widget.billId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadExistingBill());
    } else {
      _items.add(_PurchaseItemForm());
    }
  }

  Future<void> _loadExistingBill() async {
    PurchaseBillModel? bill;
    final cached = ref.read(purchaseBillsProvider).value ?? [];
    final found = cached.where((b) => b.id == widget.billId).toList();
    if (found.isNotEmpty) {
      bill = found.first;
    } else {
      try {
        final doc = await FirebaseFirestore.instance
            .collection(AppConstants.colPurchaseBills)
            .doc(widget.billId!)
            .get();
        if (doc.exists) bill = PurchaseBillModel.fromFirestore(doc);
      } catch (_) {}
    }
    if (bill == null || !mounted) return;
    setState(() {
      _invoiceCtrl.text = bill!.invoiceNumber;
      _invoiceDate = bill.invoiceDate;
      _ledgerType = bill.ledgerType;
      _existingCreatedAt = bill.createdAt;
      _existingCreatedByUid = bill.createdByUid;
      _existingCreatedByName = bill.createdByName;
      _existingIsPaid = bill.isPaid;
      _schemeDiscountType = bill.schemeDiscountType;
      _schemeDiscountValueCtrl.text = bill.schemeDiscountValue > 0 ? bill.schemeDiscountValue.toStringAsFixed(2) : '0';
      _isRoundOff = bill.isRoundOff;
      _notesCtrl.text = bill.notes ?? '';
      _selectedParty = PartyModel(
        id: bill.partyId,
        name: bill.partyName,
        address: '',
        phone: '',
        createdAt: DateTime.now(),
      );
      _partySearchCtrl.text = bill.partyName;
      _items = bill.items.map((item) {
        final form = _PurchaseItemForm();
        form.productId = item.productId;
        form.productName = item.productName;
        form.hsnCode = item.hsnCode;
        form.packSize = item.packSize;
        form.packUnit = item.packUnit;
        form.contentUnit = item.contentUnit;
        form.division = item.division;
        form.batchNumber = item.batchNumber;
        form.expiryDate = item.expiryDate;
        form.quantity = item.quantity;
        form.freeQuantity = item.freeQuantity;
        form.mrp = item.mrp;
        form.rate = item.rate;
        form.gstPercent = item.gstPercent;
        form.discountPercent = item.discountPercent;
        return form;
      }).toList();
      if (_items.isEmpty) _items.add(_PurchaseItemForm());
    });
  }

  void _onPartySearchFocusChanged() {
    if (_partySearchFocus.hasFocus) {
      _showAvailableParties();
    } else {
      Future.delayed(const Duration(milliseconds: 200), () {
        if (mounted && !_partySearchFocus.hasFocus) {
          setState(() => _showPartyDropdown = false);
        }
      });
    }
  }

  void _showAvailableParties() {
    final query = _partySearchCtrl.text.trim();
    final parties = ref.read(partiesProvider).value ?? [];

    if (query.isEmpty || (_selectedParty != null && query == _selectedParty!.name)) {
      setState(() {
        _partyResults = parties.take(15).toList();
        _showPartyDropdown = _partyResults.isNotEmpty;
      });
    } else {
      _onPartySearchChanged();
    }
  }

  void _onPartySearchChanged() {
    if (!_partySearchFocus.hasFocus) return;
    final query = _partySearchCtrl.text.trim();
    final parties = ref.read(partiesProvider).value ?? [];

    if (query.isEmpty) {
      if (_selectedParty != null) {
        _selectedParty = null;
      }
      setState(() {
        _partyResults = parties.take(15).toList();
        _showPartyDropdown = _partyResults.isNotEmpty;
      });
      return;
    }

    if (_selectedParty != null && query == _selectedParty!.name) {
      return;
    }

    setState(() {
      _partyResults = parties
          .where((p) =>
              p.name.toLowerCase().contains(query.toLowerCase()) ||
              p.phone.contains(query))
          .take(15)
          .toList();
      _showPartyDropdown = _partyResults.isNotEmpty;
    });
  }

  @override
  void dispose() {
    _invoiceCtrl.dispose();
    _notesCtrl.dispose();
    _partySearchCtrl.dispose();
    _partySearchFocus.dispose();
    _schemeDiscountValueCtrl.dispose();
    super.dispose();
  }

  double get _subtotal => _items.fold(0, (acc, i) => acc + i.taxableAmount);
  double get _totalGst => _items.fold(0, (acc, i) => acc + i.gstAmount);
  double get _totalDiscount => _items.fold(0, (acc, i) => acc + i.discountAmount);

  double get _schemeDiscountValue {
    return double.tryParse(_schemeDiscountValueCtrl.text.trim()) ?? 0.0;
  }

  double get _schemeDiscountAmount {
    final val = _schemeDiscountValue;
    if (val == 0) return 0;
    if (_schemeDiscountType == 'percent') {
      // Scheme discount applies on taxable subtotal before GST
      return _subtotal * (val / 100);
    }
    return val;
  }

  double get _roundOffAmount {
    if (!_isRoundOff) return 0;
    final total = (_subtotal - _schemeDiscountAmount) + _totalGst;
    return total.roundToDouble() - total;
  }

  double get _grandTotal {
    final total = (_subtotal - _schemeDiscountAmount) + _totalGst;
    if (_isRoundOff) {
      return total.roundToDouble();
    }
    return total;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedParty == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Please select a party'), backgroundColor: AppColors.error));
      return;
    }
    if (_items.isEmpty || _items.every((i) => i.productId.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Add at least one item'), backgroundColor: AppColors.error));
      return;
    }
    setState(() => _isLoading = true);
    final user = ref.read(authNotifierProvider).value!;
    final bill = PurchaseBillModel(
      partyId: _selectedParty!.id!,
      partyName: _selectedParty!.name,
      invoiceNumber: _invoiceCtrl.text.trim(),
      invoiceDate: _invoiceDate,
      createdAt: _existingCreatedAt ?? DateTime.now(),
      createdByUid: _existingCreatedByUid ?? user.uid,
      createdByName: _existingCreatedByName ?? user.name,
      ledgerType: _ledgerType,
      items: _items
          .where((i) => i.productId.isNotEmpty && i.quantity > 0)
          .map((i) => i.toPurchaseItem())
          .toList(),
      subtotal: _subtotal,
      totalGst: _totalGst,
      totalDiscount: _totalDiscount,
      grandTotal: _grandTotal,
      isPaid: _existingIsPaid,
      schemeDiscountType: _schemeDiscountType,
      schemeDiscountValue: _schemeDiscountValue,
      schemeDiscountAmount: _schemeDiscountAmount,
      isRoundOff: _isRoundOff,
      roundOffAmount: _roundOffAmount,
      notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    );

    final error = widget.billId != null
        ? await ref.read(purchaseNotifierProvider.notifier).updatePurchase(widget.billId!, bill)
        : await ref.read(purchaseNotifierProvider.notifier).savePurchase(bill);
    if (mounted) {
      setState(() => _isLoading = false);
      if (error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $error'), backgroundColor: AppColors.error));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Purchase saved!'), backgroundColor: AppColors.success));
        context.pop();
      }
    }
  }

  void _showProductPicker(int itemIndex) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProductPickerSheet(
        onProductSelected: (product) {
          setState(() {
            final item = _items[itemIndex];
            item.productId = product.id ?? '';
            item.productName = product.name;
            item.hsnCode = product.hsnCode;
            item.packSize = product.packSize;
            item.packUnit = product.packUnit;
            item.contentUnit = product.contentUnit;
            item.division = product.division.displayName;
            // MRP and Rate are NOT autofilled — they come from the purchase invoice
            item.gstPercent = product.gstPercent;
          });
        },
        onAddNewProduct: () {
          Navigator.pop(context);
          context.push('/products/add').then((_) {
            // After adding product, re-open picker
            Future.delayed(const Duration(milliseconds: 300), () {
              if (mounted) _showProductPicker(itemIndex);
            });
          });
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 800;

    final titleText = Text(
      widget.billId != null ? 'Edit Purchase' : 'New Purchase Entry',
      style: AppTypography.h3,
    );
    final saveActions = <Widget>[
      AppButton(
        label: 'Save', icon: Icons.save_rounded,
        onPressed: _save, isLoading: _isLoading, small: isMobile,
      ),
      const SizedBox(width: AppSpacing.lg),
    ];

    if (isMobile) {
      return DefaultTabController(
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
                icon: const Icon(Icons.arrow_back_rounded)),
            actions: saveActions,
            bottom: TabBar(
              labelStyle: AppTypography.label.copyWith(fontWeight: FontWeight.w700),
              indicatorColor: AppColors.primary,
              indicatorWeight: 3,
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.textSecondary,
              tabs: const [
                Tab(icon: Icon(Icons.info_outline_rounded, size: 16), text: 'Bill Details'),
                Tab(icon: Icon(Icons.inventory_rounded, size: 16), text: 'Items'),
              ],
            ),
          ),
          body: Form(
            key: _formKey,
            child: TabBarView(children: [
              SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(children: [
                  _buildBillDetailsPanel(),
                  const SizedBox(height: AppSpacing.lg),
                  _buildTotalsPanel(),
                  const SizedBox(height: AppSpacing.xl),
                ]),
              ),
              Column(children: [
                _buildItemsHeader(),
                Expanded(child: _buildItemsList()),
              ]),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: titleText,
        leading: IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back_rounded)),
        actions: saveActions,
      ),
      body: Form(
        key: _formKey,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: 340,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(children: [
                _buildBillDetailsPanel(),
                const SizedBox(height: AppSpacing.lg),
                _buildTotalsPanel(),
              ]),
            ),
          ),
          const VerticalDivider(color: AppColors.border, width: 1),
          Expanded(child: Column(children: [
            _buildItemsHeader(),
            Expanded(child: _buildItemsList()),
          ])),
        ]),
      ),
    );
  }

  Widget _buildBillDetailsPanel() {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Bill Details', style: AppTypography.h3),
        const SizedBox(height: AppSpacing.lg),

        // Party search
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AppTextField(
            label: 'Party / Supplier *',
            controller: _partySearchCtrl,
            prefixIcon: Icons.business_rounded,
            focusNode: _partySearchFocus,
            onTap: _showAvailableParties,
            hint: 'Search supplier…',
            suffix: _selectedParty != null
                ? const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 18)
                : null,
          ),
          if (_showPartyDropdown)
            Container(
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                border: Border.all(color: AppColors.border),
                boxShadow: [BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 8, offset: const Offset(0, 4))],
              ),
              child: Column(
                children: _partyResults.map((party) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.business_outlined,
                      color: AppColors.textMuted, size: 16),
                  title: Text(party.name, style: AppTypography.labelLarge),
                  subtitle: Text(party.phone, style: AppTypography.caption),
                  onTap: () {
                    _partySearchFocus.unfocus();
                    setState(() {
                      _selectedParty = party;
                      _partySearchCtrl.text = party.name;
                      _showPartyDropdown = false;
                    });
                  },
                )).toList(),
              ),
            ),
        ]),
        const SizedBox(height: AppSpacing.md),

        AppTextField(
          label: 'Invoice Number *',
          controller: _invoiceCtrl,
          prefixIcon: Icons.receipt_rounded,
          validator: (v) => v?.isEmpty ?? true ? 'Required' : null,
        ),
        const SizedBox(height: AppSpacing.md),

        // Invoice Date
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _invoiceDate,
              firstDate: DateTime(2020),
              lastDate: DateTime.now().add(const Duration(days: 1)),
            );
            if (picked != null) setState(() => _invoiceDate = picked);
          },
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg, vertical: AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(children: [
              const Icon(Icons.calendar_today_rounded,
                  color: AppColors.textMuted, size: 16),
              const SizedBox(width: AppSpacing.md),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Invoice Date', style: AppTypography.caption),
                Text(AppFormatters.formatDate(_invoiceDate),
                    style: AppTypography.labelLarge),
              ]),
            ]),
          ),
        ),
        const SizedBox(height: AppSpacing.md),

        // Payment type
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Payment Type', style: AppTypography.label),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: LedgerType.values.map((type) {
              final isSelected = _ledgerType == type;
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _ledgerType = type),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    margin: const EdgeInsets.only(right: AppSpacing.xs),
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primaryContainer : AppColors.surface3,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      border: Border.all(
                          color: isSelected ? AppColors.primary : AppColors.border),
                    ),
                    child: Text(
                      type.displayName,
                      style: AppTypography.caption.copyWith(
                        color: isSelected ? AppColors.primary : AppColors.textSecondary,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ]),
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
      child: Column(children: [
        _buildSchemeDiscountInput(),
        const SizedBox(height: AppSpacing.sm),
        _buildRoundOffToggle(),
        const Divider(color: AppColors.border),
        _TotalRow(label: 'Subtotal', value: _subtotal),
        _TotalRow(label: 'Item Discount (-)', value: _totalDiscount, valueColor: AppColors.success),
        if (_schemeDiscountAmount > 0)
          _TotalRow(label: 'Scheme Discount (-)', value: _schemeDiscountAmount, valueColor: AppColors.success),
        _TotalRow(label: 'GST (+)', value: _totalGst),
        if (_isRoundOff && _roundOffAmount != 0)
          _TotalRow(label: 'Round Off', value: _roundOffAmount, valueColor: AppColors.warning),
        const Divider(),
        _TotalRow(
          label: 'Grand Total',
          value: _grandTotal,
          labelStyle: AppTypography.labelLarge,
          valueStyle: AppTypography.numericLarge.copyWith(color: AppColors.primary),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          '${_items.where((i) => i.productId.isNotEmpty).length} items · '
          '${_items.fold(0, (acc, i) => acc + (i.totalContentQty).toInt())} content units',
          style: AppTypography.caption,
        ),
      ]),
    );
  }

  Widget _buildItemsHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(children: [
        Text('Items (${_items.where((i) => i.productId.isNotEmpty).length})',
            style: AppTypography.h3),
        const Spacer(),
        AppButton(
          label: 'Add Item',
          icon: Icons.add_rounded,
          small: true,
          onPressed: () {
            setState(() => _items.add(_PurchaseItemForm()));
            // Immediately open product picker for the new item
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _showProductPicker(_items.length - 1);
            });
          },
        ),
      ]),
    );
  }

  Widget _buildItemsList() {
    if (_items.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.inventory_2_outlined, size: 36, color: AppColors.textMuted),
          const SizedBox(height: AppSpacing.md),
          Text('No items added', style: AppTypography.bodySmall),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Add Item', icon: Icons.add_rounded, small: true,
            onPressed: () {
              setState(() => _items.add(_PurchaseItemForm()));
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _showProductPicker(0);
              });
            },
          ),
        ]),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, i) => _PurchaseItemCard(
        key: ValueKey(i),
        item: _items[i],
        index: i,
        onUpdate: () => setState(() {}),
        onRemove: _items.length > 1 ? () => setState(() => _items.removeAt(i)) : null,
        onPickProduct: () => _showProductPicker(i),
      ),
    );
  }
}

// ─── Item Card ────────────────────────────────────────────────────────────────
class _PurchaseItemCard extends StatefulWidget {
  final _PurchaseItemForm item;
  final int index;
  final VoidCallback onUpdate;
  final VoidCallback? onRemove;
  final VoidCallback onPickProduct;

  const _PurchaseItemCard({
    super.key,
    required this.item,
    required this.index,
    required this.onUpdate,
    this.onRemove,
    required this.onPickProduct,
  });

  @override
  State<_PurchaseItemCard> createState() => _PurchaseItemCardState();
}

class _PurchaseItemCardState extends State<_PurchaseItemCard> {
  late TextEditingController _batchCtrl;
  late TextEditingController _qtyCtrl;
  late TextEditingController _freeQtyCtrl;
  late TextEditingController _mrpCtrl;
  late TextEditingController _rateCtrl;
  late TextEditingController _discCtrl;

  @override
  void initState() {
    super.initState();
    _batchCtrl = TextEditingController(text: widget.item.batchNumber);
    _qtyCtrl = TextEditingController(
        text: widget.item.quantity > 0 ? widget.item.quantity.toString() : '');
    _freeQtyCtrl = TextEditingController(
        text: widget.item.freeQuantity > 0 ? widget.item.freeQuantity.toString() : '');
    _mrpCtrl = TextEditingController(
        text: widget.item.mrp > 0 ? widget.item.mrp.toStringAsFixed(2) : '');
    _rateCtrl = TextEditingController(
        text: widget.item.rate > 0 ? widget.item.rate.toStringAsFixed(2) : '');
    _discCtrl = TextEditingController(
        text: widget.item.discountPercent > 0
            ? widget.item.discountPercent.toString()
            : '');
  }

  @override
  void dispose() {
    _batchCtrl.dispose();
    _qtyCtrl.dispose();
    _freeQtyCtrl.dispose();
    _mrpCtrl.dispose();
    _rateCtrl.dispose();
    _discCtrl.dispose();
    super.dispose();
  }

  void _update() {
    widget.item.batchNumber = _batchCtrl.text;
    widget.item.quantity = double.tryParse(_qtyCtrl.text) ?? 0;
    widget.item.freeQuantity = double.tryParse(_freeQtyCtrl.text) ?? 0;
    widget.item.mrp = double.tryParse(_mrpCtrl.text) ?? 0;
    widget.item.rate = double.tryParse(_rateCtrl.text) ?? 0;
    widget.item.discountPercent = double.tryParse(_discCtrl.text) ?? 0;
    widget.onUpdate();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final hasProduct = item.productId.isNotEmpty;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // ── Product selector row ───────────────────────────────────────────
        Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text('${widget.index + 1}',
                  style: AppTypography.label.copyWith(color: AppColors.primary)),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: GestureDetector(
              onTap: widget.onPickProduct,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: hasProduct ? AppColors.primaryContainer : AppColors.surface2,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                  border: Border.all(
                    color: hasProduct ? AppColors.primary.withValues(alpha: 0.3) : AppColors.border,
                  ),
                ),
                child: Row(children: [
                  Icon(
                    hasProduct ? Icons.medication_rounded : Icons.search_rounded,
                    size: 16,
                    color: hasProduct ? AppColors.primary : AppColors.textMuted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      hasProduct ? item.productName : 'Select product…',
                      style: AppTypography.label.copyWith(
                        color: hasProduct ? AppColors.primary : AppColors.textMuted,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.arrow_drop_down_rounded,
                      color: AppColors.textMuted, size: 18),
                ]),
              ),
            ),
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

        if (!hasProduct) const SizedBox(height: 0)
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
                '1 ${item.packUnit} = ${item.packSize} ${item.contentUnit}s  ·  '
                'Total: ${item.totalContentQty > 0 ? item.totalContentQty.toStringAsFixed(0) : "?"} ${item.contentUnit}s'
                '${item.freeQuantity > 0 ? " (incl. ${(item.freeQuantity * item.packSize).toStringAsFixed(0)} free)" : ""}',
                style: AppTypography.caption.copyWith(color: AppColors.primary),
              ),
            ),

          const SizedBox(height: AppSpacing.md),

          // ── Batch + Expiry ─────────────────────────────────────────────
          Row(children: [
            Expanded(child: _numField('Batch No. *', _batchCtrl, isText: true)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: item.expiryDate,
                    firstDate: DateTime.now().subtract(const Duration(days: 30)),
                    lastDate: DateTime(2035),
                  );
                  if (picked != null) {
                    setState(() => item.expiryDate = picked);
                    widget.onUpdate();
                  }
                },
                child: Container(
                  height: 52,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: AppColors.surface2,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Expiry Date', style: AppTypography.caption),
                      Text(AppFormatters.formatDate(item.expiryDate),
                          style: AppTypography.label),
                    ],
                  ),
                ),
              ),
            ),
          ]),
          const SizedBox(height: AppSpacing.sm),

          // ── Qty + Free Qty (Row 1) ─────────────────────────────────────
          Row(children: [
            Expanded(child: _numField('Qty (${item.packUnit}s) *', _qtyCtrl)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: _numField('Free ${item.packUnit}s', _freeQtyCtrl)),
          ]),
          const SizedBox(height: AppSpacing.sm),
          // ── MRP + Rate per strip (Row 2) ───────────────────────────────
          Row(children: [
            Expanded(child: _numField('MRP/Strip (₹)', _mrpCtrl, prefix: '₹')),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: _numField('Rate/Strip (₹)', _rateCtrl, prefix: '₹')),
          ]),
          const SizedBox(height: AppSpacing.sm),

          // ── GST + Discount + Line Total ────────────────────────────────
          Row(children: [
            SizedBox(
              width: 110,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('GST %', style: AppTypography.caption),
                const SizedBox(height: 4),
                DropdownButton<double>(
                  value: item.gstPercent,
                  dropdownColor: AppColors.surface2,
                  style: AppTypography.label,
                  underline: const SizedBox(),
                  isDense: true,
                  items: AppConstants.gstRates.map((r) =>
                    DropdownMenuItem(value: r, child: Text('${r.toInt()}%'))
                  ).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      setState(() => item.gstPercent = v);
                      _update();
                    }
                  },
                ),
              ]),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: _numField('Disc %', _discCtrl, suffix: '%')),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Line Total', style: AppTypography.caption.copyWith(color: AppColors.primary)),
                  Text(
                    AppFormatters.formatCurrency(item.lineTotal),
                    style: AppTypography.numericSmall.copyWith(color: AppColors.primary),
                  ),
                ]),
              ),
            ),
          ]),
        ],
      ]),
    );
  }

  Widget _numField(String label, TextEditingController ctrl,
      {String? prefix, String? suffix, bool isText = false}) {
    return TextFormField(
      controller: ctrl,
      onChanged: (_) => _update(),
      keyboardType: isText ? TextInputType.text
          : const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: isText ? null
          : [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
      style: AppTypography.body,
      decoration: InputDecoration(
        labelText: label,
        prefixText: prefix,
        suffixText: suffix,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      ),
    );
  }
}

// ─── Product Picker Bottom Sheet ──────────────────────────────────────────────
class _ProductPickerSheet extends ConsumerStatefulWidget {
  final ValueChanged<ProductModel> onProductSelected;
  final VoidCallback onAddNewProduct;

  const _ProductPickerSheet({
    required this.onProductSelected,
    required this.onAddNewProduct,
  });

  @override
  ConsumerState<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends ConsumerState<_ProductPickerSheet> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  ProductType? _typeFilter;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(productsProvider);
    final inventoryAsync = ref.watch(inventoryProvider);
    final stockMap = <String, double>{};
    inventoryAsync.valueOrNull?.forEach((inv) {
      stockMap[inv.productId] = inv.totalStock;
    });

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, controller) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          // Handle
          const SizedBox(height: 12),
          Container(
            width: 36, height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Text('Select Product', style: AppTypography.h3),
              const Spacer(),
              TextButton.icon(
                onPressed: widget.onAddNewProduct,
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('New Product'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  textStyle: AppTypography.label,
                ),
              ),
            ]),
          ),
          const SizedBox(height: 12),

          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              controller: _searchCtrl,
              autofocus: true,
              onChanged: (v) => setState(() => _search = v),
              decoration: const InputDecoration(
                hintText: 'Search product…',
                prefixIcon: Icon(Icons.search_rounded, size: 18),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Type filter
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _typeChip(null, 'All'),
                ...ProductType.values.map((t) => _typeChip(t, t.displayName)),
              ],
            ),
          ),
          const Divider(height: 1),

          // Product list
          Expanded(
            child: productsAsync.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (products) {
                final q = _search.toLowerCase();
                final filtered = products.where((p) {
                  final matchQ = q.isEmpty ||
                      p.name.toLowerCase().contains(q) ||
                      (p.genericName?.toLowerCase().contains(q) ?? false) ||
                      p.companyName.toLowerCase().contains(q);
                  final matchType = _typeFilter == null || p.productType == _typeFilter;
                  return matchQ && matchType;
                }).toList();

                if (filtered.isEmpty) {
                  return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.search_off_rounded, size: 36, color: AppColors.textMuted),
                    const SizedBox(height: 12),
                    Text('No products found', style: AppTypography.bodySmall),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: widget.onAddNewProduct,
                      icon: const Icon(Icons.add_rounded, size: 16),
                      label: const Text('Create this product'),
                      style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                    ),
                  ]);
                }

                return ListView.separated(
                  controller: controller,
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final p = filtered[i];
                    final stock = stockMap[p.id] ?? 0;
                    final isLow = stock <= p.lowStockThreshold && stock > 0;
                    final isOut = stock <= 0;

                    return ListTile(
                      onTap: () {
                        Navigator.pop(context);
                        widget.onProductSelected(p);
                      },
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: BorderSide(color: AppColors.border),
                      ),
                      tileColor: AppColors.background,
                      leading: Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          _productIcon(p.productType),
                          size: 20, color: AppColors.primary,
                        ),
                      ),
                      title: Text(p.name, style: AppTypography.labelLarge),
                      subtitle: Row(children: [
                        Text(p.companyName, style: AppTypography.caption),
                        if (p.productType.hasPack) ...[
                          const Text(' · ', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                          Text('${p.packSize} ${p.contentUnit}s/${p.packUnit}',
                              style: AppTypography.caption),
                        ],
                      ]),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          if (p.packSize > 1)
                            Text(
                              '${p.packSize} ${p.contentUnit}s/${p.packUnit}',
                              style: AppTypography.caption.copyWith(color: AppColors.primary),
                            ),
                          Text(
                            isOut ? 'Out of stock'
                                : '${stock.toStringAsFixed(0)} ${p.contentUnit}s',
                            style: AppTypography.caption.copyWith(
                              color: isOut ? AppColors.error
                                  : isLow ? AppColors.warning
                                  : AppColors.success,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ]),
      ),
    );
  }

  Widget _typeChip(ProductType? type, String label) {
    final isSelected = _typeFilter == type;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: isSelected,
        onSelected: (_) => setState(() => _typeFilter = isSelected ? null : type),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        labelStyle: AppTypography.label.copyWith(
          color: isSelected ? AppColors.primary : AppColors.textSecondary,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        ),
        selectedColor: AppColors.primaryContainer,
        side: BorderSide(color: isSelected ? AppColors.primary : AppColors.border),
        backgroundColor: AppColors.surface,
      ),
    );
  }

  IconData _productIcon(ProductType type) {
    switch (type) {
      case ProductType.tablet:    return Icons.medication_rounded;
      case ProductType.capsule:   return Icons.medication_liquid_rounded;
      case ProductType.syrup:     return Icons.local_drink_rounded;
      case ProductType.injection: return Icons.vaccines_rounded;
      case ProductType.cream:     return Icons.soap_rounded;
      case ProductType.drops:     return Icons.opacity_rounded;
      case ProductType.ointment:  return Icons.sanitizer_rounded;
      case ProductType.powder:    return Icons.grain_rounded;
      case ProductType.others:    return Icons.category_rounded;
    }
  }
}

// ─── Total Row ────────────────────────────────────────────────────────────────
class _TotalRow extends StatelessWidget {
  final String label;
  final double value;
  final Color? valueColor;
  final TextStyle? labelStyle;
  final TextStyle? valueStyle;

  const _TotalRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.labelStyle,
    this.valueStyle,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: labelStyle ?? AppTypography.bodySmall),
          Text(
            AppFormatters.formatCurrency(value.abs()),
            style: valueStyle ?? AppTypography.numericSmall.copyWith(
              color: valueColor ?? AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
