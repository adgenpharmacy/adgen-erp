import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

// ─── Product Type ─────────────────────────────────────────────────────────────
enum ProductType { tablet, capsule, syrup, injection, cream, drops, ointment, powder, others }

extension ProductTypeExt on ProductType {
  String get displayName {
    switch (this) {
      case ProductType.tablet:    return 'Tablet';
      case ProductType.capsule:   return 'Capsule';
      case ProductType.syrup:     return 'Syrup';
      case ProductType.injection: return 'Injection';
      case ProductType.cream:     return 'Cream';
      case ProductType.drops:     return 'Drops';
      case ProductType.ointment:  return 'Ointment';
      case ProductType.powder:    return 'Powder';
      case ProductType.others:    return 'Others';
    }
  }

  /// Tablets and capsules can be sold as loose units (conversion feature).
  bool get hasPack => this == ProductType.tablet || this == ProductType.capsule;

  String get defaultPackUnit {
    switch (this) {
      case ProductType.tablet:
      case ProductType.capsule:   return 'Strip';
      case ProductType.syrup:     return 'Bottle';
      case ProductType.injection: return 'Vial';
      case ProductType.cream:
      case ProductType.ointment:  return 'Tube';
      default:                    return 'Unit';
    }
  }

  String get defaultContentUnit {
    switch (this) {
      case ProductType.tablet:    return 'Tablet';
      case ProductType.capsule:   return 'Capsule';
      case ProductType.syrup:     return 'ml';
      case ProductType.injection: return 'ml';
      case ProductType.cream:
      case ProductType.ointment:  return 'gm';
      default:                    return 'Unit';
    }
  }
}

// ─── Schedule Division ────────────────────────────────────────────────────────
enum ProductDivision { general, scheduleH, scheduleH1, scheduleX }

extension ProductDivisionExt on ProductDivision {
  String get displayName {
    switch (this) {
      case ProductDivision.general:    return 'General';
      case ProductDivision.scheduleH:  return 'Schedule H';
      case ProductDivision.scheduleH1: return 'Schedule H1';
      case ProductDivision.scheduleX:  return 'Schedule X';
    }
  }

  bool get isRestricted => this != ProductDivision.general;
}

// ─── Product Model ────────────────────────────────────────────────────────────
/// Stores product catalog information only.
/// MRP and purchase rate are NOT stored here — they vary per purchase batch
/// and are entered directly in the purchase entry screen.
class ProductModel extends Equatable {
  final String? id;
  final String name;
  final String? genericName;
  final String companyName;       // Manufacturer / Company
  final String hsnCode;
  final double gstPercent;        // Default GST rate for this product
  final ProductType productType;
  final ProductDivision division;
  final int packSize;             // e.g. 10 tablets per strip (for hasPack types)
  final String packUnit;          // e.g. "Strip", "Bottle"
  final String contentUnit;       // e.g. "Tablet", "ml"
  final double mrp;
  final double rate;
  final bool requiresColdStorage;
  final double lowStockThreshold;
  final bool isActive;
  final DateTime createdAt;

  const ProductModel({
    this.id,
    required this.name,
    this.genericName,
    this.companyName = '',
    required this.hsnCode,
    required this.gstPercent,
    this.productType = ProductType.tablet,
    this.division = ProductDivision.general,
    this.packSize = 1,
    this.packUnit = 'Strip',
    this.contentUnit = 'Tablet',
    this.mrp = 0.0,
    this.rate = 0.0,
    this.requiresColdStorage = false,
    this.lowStockThreshold = 1,
    this.isActive = true,
    required this.createdAt,
  });

  factory ProductModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ProductModel(
      id: doc.id,
      name: data['name'] ?? '',
      genericName: data['genericName'],
      companyName: data['companyName'] ?? data['manufacturer'] ?? '',
      hsnCode: data['hsnCode'] ?? '',
      gstPercent: (data['gstPercent'] ?? 12).toDouble(),
      mrp: (data['mrp'] ?? 0).toDouble(),
      rate: (data['rate'] ?? 0).toDouble(),
      productType: ProductType.values.firstWhere(
        (t) => t.name == data['productType'],
        orElse: () => ProductType.tablet,
      ),
      division: ProductDivision.values.firstWhere(
        (d) => d.name == data['division'],
        orElse: () => ProductDivision.general,
      ),
      packSize: data['packSize'] ?? 1,
      packUnit: data['packUnit'] ?? 'Strip',
      contentUnit: data['contentUnit'] ?? 'Tablet',
      requiresColdStorage: data['requiresColdStorage'] ?? false,
      lowStockThreshold: (data['lowStockThreshold'] ?? 1).toDouble(),
      isActive: data['isActive'] ?? true,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() => {
    'name': name,
    'nameLower': name.toLowerCase(),
    'genericName': genericName,
    'companyName': companyName,
    'manufacturer': companyName, // backward compat
    'hsnCode': hsnCode,
    'gstPercent': gstPercent,
    'productType': productType.name,
    'division': division.name,
    'packSize': packSize,
    'packUnit': packUnit,
    'contentUnit': contentUnit,
    'mrp': mrp,
    'rate': rate,
    'requiresColdStorage': requiresColdStorage,
    'lowStockThreshold': lowStockThreshold,
    'isActive': isActive,
    'createdAt': Timestamp.fromDate(createdAt),
  };

  ProductModel copyWith({
    String? name,
    String? genericName,
    String? companyName,
    String? hsnCode,
    double? gstPercent,
    ProductType? productType,
    ProductDivision? division,
    int? packSize,
    String? packUnit,
    String? contentUnit,
    double? mrp,
    double? rate,
    bool? requiresColdStorage,
    double? lowStockThreshold,
    bool? isActive,
  }) {
    return ProductModel(
      id: id,
      name: name ?? this.name,
      genericName: genericName ?? this.genericName,
      companyName: companyName ?? this.companyName,
      hsnCode: hsnCode ?? this.hsnCode,
      gstPercent: gstPercent ?? this.gstPercent,
      productType: productType ?? this.productType,
      division: division ?? this.division,
      packSize: packSize ?? this.packSize,
      packUnit: packUnit ?? this.packUnit,
      contentUnit: contentUnit ?? this.contentUnit,
      mrp: mrp ?? this.mrp,
      rate: rate ?? this.rate,
      requiresColdStorage: requiresColdStorage ?? this.requiresColdStorage,
      lowStockThreshold: lowStockThreshold ?? this.lowStockThreshold,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt,
    );
  }

  @override
  List<Object?> get props => [id, name, hsnCode, productType];
}
