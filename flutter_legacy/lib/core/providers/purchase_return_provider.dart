import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';
import 'inventory_provider.dart';

// ─── Collection ───────────────────────────────────────────────────────────────
const _colPurchaseReturns = 'purchaseReturns';

// ─── Purchase Return Item Model ───────────────────────────────────────────────
class PurchaseReturnItem {
  final String productId;
  final String productName;
  final String hsnCode;
  final String batchNumber;
  final DateTime expiryDate;
  final double returnQty;       // Pack units returned to supplier
  final double contentQtyReturned; // Content units deducted from inventory
  final int packSize;
  final String packUnit;
  final String contentUnit;
  final double mrp;
  final double rate;
  final double gstPercent;
  final double discountPercent;

  PurchaseReturnItem({
    required this.productId,
    required this.productName,
    required this.hsnCode,
    required this.batchNumber,
    required this.expiryDate,
    required this.returnQty,
    required this.contentQtyReturned,
    required this.packSize,
    required this.packUnit,
    required this.contentUnit,
    required this.mrp,
    required this.rate,
    required this.gstPercent,
    this.discountPercent = 0,
  });

  double get taxableAmount {
    final gross = rate * returnQty;
    return gross - (gross * discountPercent / 100);
  }
  double get gstAmount => taxableAmount * gstPercent / 100;
  double get lineTotal => taxableAmount + gstAmount;

  Map<String, dynamic> toMap() => {
    'productId': productId,
    'productName': productName,
    'hsnCode': hsnCode,
    'batchNumber': batchNumber,
    'expiryDate': Timestamp.fromDate(expiryDate),
    'returnQty': returnQty,
    'contentQtyReturned': contentQtyReturned,
    'packSize': packSize,
    'packUnit': packUnit,
    'contentUnit': contentUnit,
    'mrp': mrp,
    'rate': rate,
    'gstPercent': gstPercent,
    'discountPercent': discountPercent,
  };

  factory PurchaseReturnItem.fromMap(Map<String, dynamic> data) =>
      PurchaseReturnItem(
        productId: data['productId'] ?? '',
        productName: data['productName'] ?? '',
        hsnCode: data['hsnCode'] ?? '',
        batchNumber: data['batchNumber'] ?? '',
        expiryDate: (data['expiryDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
        returnQty: (data['returnQty'] ?? 0).toDouble(),
        contentQtyReturned: (data['contentQtyReturned'] ?? 0).toDouble(),
        packSize: data['packSize'] ?? 1,
        packUnit: data['packUnit'] ?? 'Unit',
        contentUnit: data['contentUnit'] ?? 'Unit',
        mrp: (data['mrp'] ?? 0).toDouble(),
        rate: (data['rate'] ?? 0).toDouble(),
        gstPercent: (data['gstPercent'] ?? 0).toDouble(),
        discountPercent: (data['discountPercent'] ?? 0).toDouble(),
      );
}

// ─── Purchase Return Model ────────────────────────────────────────────────────
class PurchaseReturnModel {
  final String? id;
  final String debitNoteNumber;       // e.g. "DN/2025/001"
  final String originalBillId;
  final String originalInvoiceNumber;
  final String partyId;
  final String partyName;
  final DateTime returnDate;
  final DateTime createdAt;
  final String createdByUid;
  final String createdByName;
  final List<PurchaseReturnItem> items;
  final double totalReturnAmount;
  final double totalGstReversed;
  final String reason;
  final String? notes;
  final bool isSettled;

  PurchaseReturnModel({
    this.id,
    required this.debitNoteNumber,
    required this.originalBillId,
    required this.originalInvoiceNumber,
    required this.partyId,
    required this.partyName,
    required this.returnDate,
    required this.createdAt,
    required this.createdByUid,
    required this.createdByName,
    required this.items,
    required this.totalReturnAmount,
    required this.totalGstReversed,
    required this.reason,
    this.notes,
    this.isSettled = false,
  });

  factory PurchaseReturnModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return PurchaseReturnModel(
      id: doc.id,
      debitNoteNumber: data['debitNoteNumber'] ?? '',
      originalBillId: data['originalBillId'] ?? '',
      originalInvoiceNumber: data['originalInvoiceNumber'] ?? '',
      partyId: data['partyId'] ?? '',
      partyName: data['partyName'] ?? '',
      returnDate: (data['returnDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdByUid: data['createdByUid'] ?? '',
      createdByName: data['createdByName'] ?? '',
      items: (data['items'] as List<dynamic>?)
              ?.map((i) => PurchaseReturnItem.fromMap(i as Map<String, dynamic>))
              .toList() ?? [],
      totalReturnAmount: (data['totalReturnAmount'] ?? 0).toDouble(),
      totalGstReversed: (data['totalGstReversed'] ?? 0).toDouble(),
      reason: data['reason'] ?? '',
      notes: data['notes'],
      isSettled: data['isSettled'] ?? false,
    );
  }

  Map<String, dynamic> toFirestore() => {
    'debitNoteNumber': debitNoteNumber,
    'originalBillId': originalBillId,
    'originalInvoiceNumber': originalInvoiceNumber,
    'partyId': partyId,
    'partyName': partyName,
    'returnDate': Timestamp.fromDate(returnDate),
    'createdAt': Timestamp.fromDate(createdAt),
    'createdByUid': createdByUid,
    'createdByName': createdByName,
    'items': items.map((i) => i.toMap()).toList(),
    'totalReturnAmount': totalReturnAmount,
    'totalGstReversed': totalGstReversed,
    'reason': reason,
    'notes': notes,
    'isSettled': isSettled,
  };
}

// ─── Providers ────────────────────────────────────────────────────────────────
final purchaseReturnsByBillProvider =
    StreamProvider.family<List<PurchaseReturnModel>, String>((ref, billId) {
  return FirebaseFirestore.instance
      .collection(_colPurchaseReturns)
      .where('originalBillId', isEqualTo: billId)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => PurchaseReturnModel.fromFirestore(d)).toList());
});

final allPurchaseReturnsProvider =
    StreamProvider<List<PurchaseReturnModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(_colPurchaseReturns)
      .orderBy('createdAt', descending: true)
      .limit(500)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => PurchaseReturnModel.fromFirestore(d)).toList());
});

// ─── Notifier ─────────────────────────────────────────────────────────────────
class PurchaseReturnNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  PurchaseReturnNotifier(this._db, this._ref)
      : super(const AsyncValue.data(null));

  Future<String> _nextDebitNoteNumber() async {
    final counterRef =
        _db.collection('meta').doc('debitNoteCounter');
    final year = DateTime.now().year;
    return await _db.runTransaction<String>((tx) async {
      final snap = await tx.get(counterRef);
      final existing = snap.data();
      final lastYear = existing?['year'] as int? ?? 0;
      final lastCount =
          lastYear == year ? (existing?['count'] as int? ?? 0) : 0;
      final nextCount = lastCount + 1;
      tx.set(counterRef, {'year': year, 'count': nextCount});
      return 'DN/$year/${nextCount.toString().padLeft(4, '0')}';
    });
  }

  /// Create a purchase return:
  /// 1. Generate debit note number atomically
  /// 2. Deduct stock from inventory (items going back to supplier)
  /// 3. Save return document
  /// 4. Add ledger debit entry (reduces party payable)
  Future<String?> createPurchaseReturn(PurchaseReturnModel model) async {
    try {
      state = const AsyncValue.loading();

      final debitNoteNumber = await _nextDebitNoteNumber();

      // Deduct stock for each returned item
      final inventoryNotifier =
          _ref.read(inventoryNotifierProvider.notifier);
      for (final item in model.items) {
        if (item.contentQtyReturned <= 0) continue;
        // Purchase Return means we send stock back to the supplier, so we must deduct it.
        await inventoryNotifier.revertPurchaseStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          mrp: item.mrp,
          purchaseRate: item.rate,
          quantity: item.contentQtyReturned,
        );
      }

      final finalModel = PurchaseReturnModel(
        debitNoteNumber: debitNoteNumber,
        originalBillId: model.originalBillId,
        originalInvoiceNumber: model.originalInvoiceNumber,
        partyId: model.partyId,
        partyName: model.partyName,
        returnDate: model.returnDate,
        createdAt: DateTime.now(),
        createdByUid: model.createdByUid,
        createdByName: model.createdByName,
        items: model.items,
        totalReturnAmount: model.totalReturnAmount,
        totalGstReversed: model.totalGstReversed,
        reason: model.reason,
        notes: model.notes,
        isSettled: false,
      );

      final docRef = await _db
          .collection(_colPurchaseReturns)
          .add(finalModel.toFirestore());

      // Ledger: debit against party (reduces what we owe them)
      await _db.collection(AppConstants.colLedger).add({
        'partyId': model.partyId,
        'partyName': model.partyName,
        'type': 'debit',
        'subtype': 'debit_note',
        'amount': model.totalReturnAmount,
        'description':
            'Purchase Return — Debit Note $debitNoteNumber (against ${model.originalInvoiceNumber})',
        'billId': docRef.id,
        'billNumber': debitNoteNumber,
        'originalBillId': model.originalBillId,
        'date': Timestamp.fromDate(model.returnDate),
        'createdByUid': model.createdByUid,
        'createdByName': model.createdByName,
        'runningBalance': 0,
        'isSettled': false,
      });

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final purchaseReturnNotifierProvider =
    StateNotifierProvider<PurchaseReturnNotifier, AsyncValue<void>>((ref) {
  return PurchaseReturnNotifier(ref.watch(firestoreProvider), ref);
});
