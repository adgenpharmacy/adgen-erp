import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

class InventoryBatch extends Equatable {
  final String batchNumber;
  final DateTime expiryDate;
  final double quantity;
  final double mrp;
  final double purchaseRate;
  final DateTime purchaseDate;
  final String? purchaseBillId;
  // Manual adjustment audit fields
  final bool isManualAdjustment;
  final String? adjustmentReason;
  final String? adjustedByName;

  const InventoryBatch({
    required this.batchNumber,
    required this.expiryDate,
    required this.quantity,
    required this.mrp,
    required this.purchaseRate,
    required this.purchaseDate,
    this.purchaseBillId,
    this.isManualAdjustment = false,
    this.adjustmentReason,
    this.adjustedByName,
  });

  bool get isExpired => expiryDate.isBefore(DateTime.now());
  bool get isExpiringSoon =>
      !isExpired && expiryDate.difference(DateTime.now()).inDays <= 90;

  factory InventoryBatch.fromMap(Map<String, dynamic> data) {
    return InventoryBatch(
      batchNumber: data['batchNumber'] ?? '',
      expiryDate: (data['expiryDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      quantity: (data['quantity'] ?? 0).toDouble(),
      mrp: (data['mrp'] ?? 0).toDouble(),
      purchaseRate: (data['purchaseRate'] ?? 0).toDouble(),
      purchaseDate: (data['purchaseDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      purchaseBillId: data['purchaseBillId'],
      isManualAdjustment: data['isManualAdjustment'] ?? false,
      adjustmentReason: data['adjustmentReason'],
      adjustedByName: data['adjustedByName'],
    );
  }

  Map<String, dynamic> toMap() => {
        'batchNumber': batchNumber,
        'expiryDate': Timestamp.fromDate(expiryDate),
        'quantity': quantity,
        'mrp': mrp,
        'purchaseRate': purchaseRate,
        'purchaseDate': Timestamp.fromDate(purchaseDate),
        'purchaseBillId': purchaseBillId,
        'isManualAdjustment': isManualAdjustment,
        'adjustmentReason': adjustmentReason,
        'adjustedByName': adjustedByName,
      };

  InventoryBatch copyWith({
    double? quantity,
    double? mrp,
    double? purchaseRate,
    bool? isManualAdjustment,
    String? adjustmentReason,
    String? adjustedByName,
  }) {
    return InventoryBatch(
      batchNumber: batchNumber,
      expiryDate: expiryDate,
      quantity: quantity ?? this.quantity,
      mrp: mrp ?? this.mrp,
      purchaseRate: purchaseRate ?? this.purchaseRate,
      purchaseDate: purchaseDate,
      purchaseBillId: purchaseBillId,
      isManualAdjustment: isManualAdjustment ?? this.isManualAdjustment,
      adjustmentReason: adjustmentReason ?? this.adjustmentReason,
      adjustedByName: adjustedByName ?? this.adjustedByName,
    );
  }

  @override
  List<Object?> get props => [batchNumber, expiryDate, quantity];
}

class InventoryModel extends Equatable {
  final String? id;         // Same as productId
  final String productId;
  final String productName;
  final List<InventoryBatch> batches;
  final double systemStock;  // Calculated from batches
  final double physicalStock; // Corrected stock (after stock adjustment)
  final double lowStockThreshold;
  final DateTime lastUpdated;

  const InventoryModel({
    this.id,
    required this.productId,
    required this.productName,
    required this.batches,
    required this.systemStock,
    required this.physicalStock,
    required this.lowStockThreshold,
    required this.lastUpdated,
  });

  double get totalStock => physicalStock;
  bool get isLowStock => totalStock <= lowStockThreshold && totalStock > 0;
  bool get isOutOfStock => totalStock <= 0;

  List<InventoryBatch> get expiredBatches =>
      batches.where((b) => b.isExpired && b.quantity > 0).toList();

  List<InventoryBatch> get expiringSoonBatches =>
      batches.where((b) => b.isExpiringSoon && b.quantity > 0).toList();

  // Returns earliest-expiring batch with stock (FEFO)
  InventoryBatch? get nextToDispense {
    final available = batches
        .where((b) => !b.isExpired && b.quantity > 0)
        .toList()
      ..sort((a, b) => a.expiryDate.compareTo(b.expiryDate));
    return available.isEmpty ? null : available.first;
  }

  // All batches with available stock, sorted FEFO
  List<InventoryBatch> get availableBatches {
    final avail = batches.where((b) => b.quantity > 0).toList()
      ..sort((a, b) => a.expiryDate.compareTo(b.expiryDate));
    return avail;
  }

  factory InventoryModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final batchList = (data['batches'] as List<dynamic>?)
            ?.map((b) => InventoryBatch.fromMap(b as Map<String, dynamic>))
            .toList() ??
        [];
    return InventoryModel(
      id: doc.id,
      productId: data['productId'] ?? doc.id,
      productName: data['productName'] ?? '',
      batches: batchList,
      systemStock: (data['systemStock'] ?? 0).toDouble(),
      physicalStock: (data['physicalStock'] ?? 0).toDouble(),
      lowStockThreshold: (data['lowStockThreshold'] ?? 1).toDouble(),
      lastUpdated: (data['lastUpdated'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() => {
        'productId': productId,
        'productName': productName,
        'productNameLower': productName.toLowerCase(),
        'batches': batches.map((b) => b.toMap()).toList(),
        'systemStock': systemStock,
        'physicalStock': physicalStock,
        'lowStockThreshold': lowStockThreshold,
        'lastUpdated': Timestamp.fromDate(lastUpdated),
      };

  @override
  List<Object?> get props => [id, productId, systemStock, physicalStock];
}
