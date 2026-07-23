import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

// ─── Return Item (mirrors SalesItem but with returnQty) ───────────────────────
class SaleReturnItem extends Equatable {
  final String productId;
  final String productName;
  final String batchNumber;
  final DateTime expiryDate;
  final double mrp;
  final double rate;           // Sale rate (for refund calc)
  final double purchaseRate;   // For COGS reversal
  final double gstPercent;
  final double returnQty;      // Content units returned
  final double packQty;        // Pack units returned
  final int packSize;
  final double discountPercent;
  final String division;

  const SaleReturnItem({
    required this.productId,
    required this.productName,
    required this.batchNumber,
    required this.expiryDate,
    required this.mrp,
    required this.rate,
    required this.purchaseRate,
    required this.gstPercent,
    required this.returnQty,
    required this.packQty,
    required this.packSize,
    this.discountPercent = 0,
    this.division = 'General',
  });

  // Refund amount for this item (what the customer gets back)
  double get refundAmount {
    final gross = rate * returnQty;
    final discount = gross * discountPercent / 100;
    return gross - discount;
  }

  // GST reversed
  double get gstReversed => refundAmount - (refundAmount / (1 + gstPercent / 100));

  factory SaleReturnItem.fromMap(Map<String, dynamic> data) {
    return SaleReturnItem(
      productId: data['productId'] ?? '',
      productName: data['productName'] ?? '',
      batchNumber: data['batchNumber'] ?? '',
      expiryDate: (data['expiryDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      mrp: (data['mrp'] ?? 0).toDouble(),
      rate: (data['rate'] ?? 0).toDouble(),
      purchaseRate: (data['purchaseRate'] ?? 0).toDouble(),
      gstPercent: (data['gstPercent'] ?? 0).toDouble(),
      returnQty: (data['returnQty'] ?? 0).toDouble(),
      packQty: (data['packQty'] ?? 0).toDouble(),
      packSize: data['packSize'] ?? 1,
      discountPercent: (data['discountPercent'] ?? 0).toDouble(),
      division: data['division'] ?? 'General',
    );
  }

  Map<String, dynamic> toMap() => {
    'productId': productId,
    'productName': productName,
    'batchNumber': batchNumber,
    'expiryDate': Timestamp.fromDate(expiryDate),
    'mrp': mrp,
    'rate': rate,
    'purchaseRate': purchaseRate,
    'gstPercent': gstPercent,
    'returnQty': returnQty,
    'packQty': packQty,
    'packSize': packSize,
    'discountPercent': discountPercent,
    'division': division,
  };

  @override
  List<Object?> get props => [productId, batchNumber, returnQty];
}

// ─── Return Reason Enum ───────────────────────────────────────────────────────
enum SaleReturnReason {
  wrongMedicine,
  expiredProduct,
  damagedPackaging,
  prescriptionChange,
  sideEffects,
  qualityIssue,
  other,
}

extension SaleReturnReasonExt on SaleReturnReason {
  String get displayName {
    switch (this) {
      case SaleReturnReason.wrongMedicine:    return 'Wrong Medicine Dispensed';
      case SaleReturnReason.expiredProduct:   return 'Expired / Near-Expiry Product';
      case SaleReturnReason.damagedPackaging: return 'Damaged Packaging';
      case SaleReturnReason.prescriptionChange: return 'Prescription Changed';
      case SaleReturnReason.sideEffects:     return 'Side Effects / Stopped by Doctor';
      case SaleReturnReason.qualityIssue:    return 'Quality Issue';
      case SaleReturnReason.other:           return 'Other';
    }
  }
}

// ─── Sale Return Model ────────────────────────────────────────────────────────
class SaleReturnModel extends Equatable {
  final String? id;
  final String creditNoteNumber;      // e.g. "CN/2025/001"
  final String originalBillId;        // ID of the SalesBillModel
  final String originalInvoiceNumber; // e.g. "INV/2025/043" — for display
  final String customerId;
  final String customerName;
  final String? customerPhone;
  final DateTime returnDate;
  final DateTime createdAt;
  final String createdByUid;
  final String createdByName;
  final List<SaleReturnItem> items;
  final double totalRefundAmount;     // Total refund owed to customer
  final double totalGstReversed;      // Total GST reversed
  final SaleReturnReason reason;
  final String? reasonNotes;          // Additional notes for 'other' reason
  final String refundMethod;          // 'cash', 'upi', 'credit_note'
  final bool isSettled;               // Has refund been paid?
  final String? notes;

  const SaleReturnModel({
    this.id,
    required this.creditNoteNumber,
    required this.originalBillId,
    required this.originalInvoiceNumber,
    required this.customerId,
    required this.customerName,
    this.customerPhone,
    required this.returnDate,
    required this.createdAt,
    required this.createdByUid,
    required this.createdByName,
    required this.items,
    required this.totalRefundAmount,
    required this.totalGstReversed,
    required this.reason,
    this.reasonNotes,
    this.refundMethod = 'cash',
    this.isSettled = false,
    this.notes,
  });

  factory SaleReturnModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return SaleReturnModel(
      id: doc.id,
      creditNoteNumber: data['creditNoteNumber'] ?? '',
      originalBillId: data['originalBillId'] ?? '',
      originalInvoiceNumber: data['originalInvoiceNumber'] ?? '',
      customerId: data['customerId'] ?? '',
      customerName: data['customerName'] ?? '',
      customerPhone: data['customerPhone'],
      returnDate: (data['returnDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdByUid: data['createdByUid'] ?? '',
      createdByName: data['createdByName'] ?? '',
      items: (data['items'] as List<dynamic>?)
              ?.map((i) => SaleReturnItem.fromMap(i as Map<String, dynamic>))
              .toList() ?? [],
      totalRefundAmount: (data['totalRefundAmount'] ?? 0).toDouble(),
      totalGstReversed: (data['totalGstReversed'] ?? 0).toDouble(),
      reason: SaleReturnReason.values.firstWhere(
        (r) => r.name == data['reason'],
        orElse: () => SaleReturnReason.other,
      ),
      reasonNotes: data['reasonNotes'],
      refundMethod: data['refundMethod'] ?? 'cash',
      isSettled: data['isSettled'] ?? false,
      notes: data['notes'],
    );
  }

  Map<String, dynamic> toFirestore() => {
    'creditNoteNumber': creditNoteNumber,
    'originalBillId': originalBillId,
    'originalInvoiceNumber': originalInvoiceNumber,
    'customerId': customerId,
    'customerName': customerName,
    'customerPhone': customerPhone,
    'returnDate': Timestamp.fromDate(returnDate),
    'createdAt': Timestamp.fromDate(createdAt),
    'createdByUid': createdByUid,
    'createdByName': createdByName,
    'items': items.map((i) => i.toMap()).toList(),
    'totalRefundAmount': totalRefundAmount,
    'totalGstReversed': totalGstReversed,
    'reason': reason.name,
    'reasonNotes': reasonNotes,
    'refundMethod': refundMethod,
    'isSettled': isSettled,
    'notes': notes,
  };

  @override
  List<Object?> get props => [id, creditNoteNumber, originalBillId];
}
