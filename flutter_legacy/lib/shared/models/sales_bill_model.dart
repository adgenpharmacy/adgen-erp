import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum PaymentMethod { cash, upi, card, credit }

extension PaymentMethodExt on PaymentMethod {
  String get displayName {
    switch (this) {
      case PaymentMethod.cash: return 'Cash';
      case PaymentMethod.upi: return 'UPI';
      case PaymentMethod.card: return 'Card';
      case PaymentMethod.credit: return 'Credit';
    }
  }

  String get icon {
    switch (this) {
      case PaymentMethod.cash: return '💵';
      case PaymentMethod.upi: return '📱';
      case PaymentMethod.card: return '💳';
      case PaymentMethod.credit: return '🕐';
    }
  }
}

class SalesItem extends Equatable {
  final String productId;
  final String productName;
  final String batchNumber;
  final DateTime expiryDate;
  final double mrp;
  final double rate;
  final double gstPercent;
  final double quantity;       // In content units (e.g., tablets)
  final double packQuantity;   // In pack units (e.g., strips)
  final int packSize;          // e.g., 10 tablets per strip
  final double discountPercent;
  final String division;

  const SalesItem({
    required this.productId,
    required this.productName,
    required this.batchNumber,
    required this.expiryDate,
    required this.mrp,
    required this.rate,
    required this.gstPercent,
    required this.quantity,
    required this.packQuantity,
    required this.packSize,
    this.discountPercent = 0,
    this.division = 'General',
  });

  double get taxableAmount {
    final gross = rate * quantity;
    final discount = gross * discountPercent / 100;
    return gross - discount;
  }

  // In retail sales, MRP is tax-inclusive. Therefore, the GST is part of the taxableAmount.
  // We do not add GST on top of it.
  double get gstAmount => 0; // Or back-calculated: taxableAmount - (taxableAmount / (1 + gstPercent / 100))
  double get lineTotal => taxableAmount;
  double get discountAmount => rate * quantity * discountPercent / 100;

  factory SalesItem.fromMap(Map<String, dynamic> data) {
    return SalesItem(
      productId: data['productId'] ?? '',
      productName: data['productName'] ?? '',
      batchNumber: data['batchNumber'] ?? '',
      expiryDate: (data['expiryDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      mrp: (data['mrp'] ?? 0).toDouble(),
      rate: (data['rate'] ?? 0).toDouble(),
      gstPercent: (data['gstPercent'] ?? 0).toDouble(),
      quantity: (data['quantity'] ?? 0).toDouble(),
      packQuantity: (data['packQuantity'] ?? 0).toDouble(),
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
        'gstPercent': gstPercent,
        'quantity': quantity,
        'packQuantity': packQuantity,
        'packSize': packSize,
        'discountPercent': discountPercent,
        'division': division,
      };

  @override
  List<Object?> get props => [productId, batchNumber, quantity];
}

class SalesBillModel extends Equatable {
  final String? id;
  final String invoiceNumber;
  final String? customerId;
  final String customerName;
  final String? customerPhone;
  final String? doctorName;
  final String? customerAddress;
  final DateTime saleDate;
  final DateTime createdAt;
  final String createdByUid;
  final String createdByName;
  final PaymentMethod paymentMethod;
  final List<SalesItem> items;
  final double subtotal;       // Before tax and discount
  final double totalDiscount;
  final double totalGst;
  final double grandTotal;     // Payable amount
  final double? amountPaid;
  final double? balanceDue;
  final String? prescriptionUrl;
  final bool isPrescriptionRequired;
  final String? notes;
  final bool isCreditPaid;
  final String schemeDiscountType; // 'percent' or 'amount'
  final double schemeDiscountValue;
  final double schemeDiscountAmount;
  final bool isRoundOff;
  final double roundOffAmount;

  const SalesBillModel({
    this.id,
    required this.invoiceNumber,
    this.customerId,
    required this.customerName,
    this.customerPhone,
    this.doctorName,
    this.customerAddress,
    required this.saleDate,
    required this.createdAt,
    required this.createdByUid,
    required this.createdByName,
    required this.paymentMethod,
    required this.items,
    required this.subtotal,
    required this.totalDiscount,
    required this.totalGst,
    required this.grandTotal,
    this.amountPaid,
    this.balanceDue,
    this.prescriptionUrl,
    this.isPrescriptionRequired = false,
    this.notes,
    this.isCreditPaid = false,
    this.schemeDiscountType = 'amount',
    this.schemeDiscountValue = 0,
    this.schemeDiscountAmount = 0,
    this.isRoundOff = true,
    this.roundOffAmount = 0,
  });

  bool get hasOutstandingCredit =>
      paymentMethod == PaymentMethod.credit && !isCreditPaid;

  factory SalesBillModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return SalesBillModel(
      id: doc.id,
      invoiceNumber: data['invoiceNumber'] ?? '',
      customerId: data['customerId'],
      customerName: data['customerName'] ?? '',
      customerPhone: data['customerPhone'],
      doctorName: data['doctorName'],
      customerAddress: data['customerAddress'],
      saleDate: (data['saleDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdByUid: data['createdByUid'] ?? '',
      createdByName: data['createdByName'] ?? '',
      paymentMethod: PaymentMethod.values.firstWhere(
        (p) => p.name == data['paymentMethod'],
        orElse: () => PaymentMethod.cash,
      ),
      items: (data['items'] as List<dynamic>?)
              ?.map((i) => SalesItem.fromMap(i as Map<String, dynamic>))
              .toList() ??
          [],
      subtotal: (data['subtotal'] ?? 0).toDouble(),
      totalDiscount: (data['totalDiscount'] ?? 0).toDouble(),
      totalGst: (data['totalGst'] ?? 0).toDouble(),
      grandTotal: (data['grandTotal'] ?? 0).toDouble(),
      amountPaid: (data['amountPaid'] as num?)?.toDouble(),
      balanceDue: (data['balanceDue'] as num?)?.toDouble(),
      prescriptionUrl: data['prescriptionUrl'],
      isPrescriptionRequired: data['isPrescriptionRequired'] ?? false,
      notes: data['notes'],
      isCreditPaid: data['isCreditPaid'] ?? false,
      schemeDiscountType: data['schemeDiscountType'] ?? 'amount',
      schemeDiscountValue: (data['schemeDiscountValue'] ?? 0).toDouble(),
      schemeDiscountAmount: (data['schemeDiscountAmount'] ?? 0).toDouble(),
      isRoundOff: data['isRoundOff'] ?? true,
      roundOffAmount: (data['roundOffAmount'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toFirestore() => {
        'invoiceNumber': invoiceNumber,
        'customerId': customerId,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'doctorName': doctorName,
        'customerAddress': customerAddress,
        'saleDate': Timestamp.fromDate(saleDate),
        'createdAt': Timestamp.fromDate(createdAt),
        'createdByUid': createdByUid,
        'createdByName': createdByName,
        'paymentMethod': paymentMethod.name,
        'items': items.map((i) => i.toMap()).toList(),
        'subtotal': subtotal,
        'totalDiscount': totalDiscount,
        'totalGst': totalGst,
        'grandTotal': grandTotal,
        'amountPaid': amountPaid,
        'balanceDue': balanceDue,
        'prescriptionUrl': prescriptionUrl,
        'isPrescriptionRequired': isPrescriptionRequired,
        'notes': notes,
        'isCreditPaid': isCreditPaid,
        'schemeDiscountType': schemeDiscountType,
        'schemeDiscountValue': schemeDiscountValue,
        'schemeDiscountAmount': schemeDiscountAmount,
        'isRoundOff': isRoundOff,
        'roundOffAmount': roundOffAmount,
      };

  @override
  List<Object?> get props => [id, invoiceNumber, customerId];
}
