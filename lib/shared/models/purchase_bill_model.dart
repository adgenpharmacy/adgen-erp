import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

class PurchaseItem extends Equatable {
  final String productId;
  final String productName;
  final String hsnCode;
  final String batchNumber;
  final DateTime expiryDate;
  final double quantity;        // In pack units (strips, bottles, etc.)
  final double freeQuantity;    // Scheme free qty (also in pack units)
  final int packSize;           // e.g. 10 tablets per strip
  final String packUnit;        // e.g. "Strip"
  final String contentUnit;     // e.g. "Tablet"
  final double mrp;             // MRP per pack unit
  final double rate;            // Purchase rate per pack unit
  final double gstPercent;
  final double discountPercent;
  final String division;

  const PurchaseItem({
    required this.productId,
    required this.productName,
    required this.hsnCode,
    required this.batchNumber,
    required this.expiryDate,
    required this.quantity,
    this.freeQuantity = 0,
    this.packSize = 1,
    this.packUnit = 'Unit',
    this.contentUnit = 'Unit',
    required this.mrp,
    required this.rate,
    required this.gstPercent,
    this.discountPercent = 0,
    this.division = 'General',
  });

  /// Total content units going into inventory (e.g., strips × tablets/strip)
  double get totalContentQty => (quantity + freeQuantity) * packSize;

  double get taxableAmount {
    final gross = rate * quantity;
    final discount = gross * discountPercent / 100;
    return gross - discount;
  }

  double get gstAmount => taxableAmount * gstPercent / 100;
  double get lineTotal => taxableAmount + gstAmount;
  double get discountAmount => rate * quantity * discountPercent / 100;

  factory PurchaseItem.fromMap(Map<String, dynamic> data) {
    return PurchaseItem(
      productId: data['productId'] ?? '',
      productName: data['productName'] ?? '',
      hsnCode: data['hsnCode'] ?? '',
      batchNumber: data['batchNumber'] ?? '',
      expiryDate: (data['expiryDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      quantity: (data['quantity'] ?? 0).toDouble(),
      freeQuantity: (data['freeQuantity'] ?? 0).toDouble(),
      packSize: data['packSize'] ?? 1,
      packUnit: data['packUnit'] ?? 'Unit',
      contentUnit: data['contentUnit'] ?? 'Unit',
      mrp: (data['mrp'] ?? 0).toDouble(),
      rate: (data['rate'] ?? 0).toDouble(),
      gstPercent: (data['gstPercent'] ?? 0).toDouble(),
      discountPercent: (data['discountPercent'] ?? 0).toDouble(),
      division: data['division'] ?? 'General',
    );
  }

  Map<String, dynamic> toMap() => {
        'productId': productId,
        'productName': productName,
        'hsnCode': hsnCode,
        'batchNumber': batchNumber,
        'expiryDate': Timestamp.fromDate(expiryDate),
        'quantity': quantity,
        'freeQuantity': freeQuantity,
        'packSize': packSize,
        'packUnit': packUnit,
        'contentUnit': contentUnit,
        'mrp': mrp,
        'rate': rate,
        'gstPercent': gstPercent,
        'discountPercent': discountPercent,
        'division': division,
      };

  @override
  List<Object?> get props => [productId, batchNumber, quantity];
}

// ─── Ledger Type ──────────────────────────────────────────────────────────────
enum LedgerType { cash, credit, bank }

extension LedgerTypeExt on LedgerType {
  String get displayName {
    switch (this) {
      case LedgerType.cash:   return 'Cash';
      case LedgerType.credit: return 'Credit';
      case LedgerType.bank:   return 'Bank Transfer';
    }
  }
}

// ─── Purchase Bill ────────────────────────────────────────────────────────────
class PurchaseBillModel extends Equatable {
  final String? id;
  final String partyId;
  final String partyName;
  final String invoiceNumber;
  final DateTime invoiceDate;
  final DateTime createdAt;
  final String createdByUid;
  final String createdByName;
  final LedgerType ledgerType;
  final List<PurchaseItem> items;
  final double subtotal;
  final double totalGst;
  final double totalDiscount;
  final double grandTotal;
  final bool isPaid;
  final String? notes;
  final String schemeDiscountType; // 'percent' or 'amount'
  final double schemeDiscountValue;
  final double schemeDiscountAmount;
  final bool isRoundOff;
  final double roundOffAmount;

  const PurchaseBillModel({
    this.id,
    required this.partyId,
    required this.partyName,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.createdAt,
    required this.createdByUid,
    required this.createdByName,
    required this.ledgerType,
    required this.items,
    required this.subtotal,
    required this.totalGst,
    required this.totalDiscount,
    required this.grandTotal,
    this.isPaid = false,
    this.notes,
    this.schemeDiscountType = 'amount',
    this.schemeDiscountValue = 0,
    this.schemeDiscountAmount = 0,
    this.isRoundOff = true,
    this.roundOffAmount = 0,
  });

  factory PurchaseBillModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return PurchaseBillModel(
      id: doc.id,
      partyId: data['partyId'] ?? '',
      partyName: data['partyName'] ?? '',
      invoiceNumber: data['invoiceNumber'] ?? '',
      invoiceDate: (data['invoiceDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdByUid: data['createdByUid'] ?? '',
      createdByName: data['createdByName'] ?? '',
      ledgerType: LedgerType.values.firstWhere(
        (l) => l.name == data['ledgerType'],
        orElse: () => LedgerType.credit,
      ),
      items: (data['items'] as List<dynamic>?)
              ?.map((i) => PurchaseItem.fromMap(i as Map<String, dynamic>))
              .toList() ??
          [],
      subtotal: (data['subtotal'] ?? 0).toDouble(),
      totalGst: (data['totalGst'] ?? 0).toDouble(),
      totalDiscount: (data['totalDiscount'] ?? 0).toDouble(),
      grandTotal: (data['grandTotal'] ?? 0).toDouble(),
      isPaid: data['isPaid'] ?? false,
      notes: data['notes'],
      schemeDiscountType: data['schemeDiscountType'] ?? 'amount',
      schemeDiscountValue: (data['schemeDiscountValue'] ?? 0).toDouble(),
      schemeDiscountAmount: (data['schemeDiscountAmount'] ?? 0).toDouble(),
      isRoundOff: data['isRoundOff'] ?? true,
      roundOffAmount: (data['roundOffAmount'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toFirestore() => {
        'partyId': partyId,
        'partyName': partyName,
        'invoiceNumber': invoiceNumber,
        'invoiceDate': Timestamp.fromDate(invoiceDate),
        'createdAt': Timestamp.fromDate(createdAt),
        'createdByUid': createdByUid,
        'createdByName': createdByName,
        'ledgerType': ledgerType.name,
        'items': items.map((i) => i.toMap()).toList(),
        'subtotal': subtotal,
        'totalGst': totalGst,
        'totalDiscount': totalDiscount,
        'grandTotal': grandTotal,
        'isPaid': isPaid,
        'notes': notes,
        'schemeDiscountType': schemeDiscountType,
        'schemeDiscountValue': schemeDiscountValue,
        'schemeDiscountAmount': schemeDiscountAmount,
        'isRoundOff': isRoundOff,
        'roundOffAmount': roundOffAmount,
      };

  @override
  List<Object?> get props => [id, invoiceNumber, partyId];
}
