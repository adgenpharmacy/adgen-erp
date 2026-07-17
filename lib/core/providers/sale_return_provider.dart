import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/return_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';
import 'inventory_provider.dart';

// ─── Collection name ──────────────────────────────────────────────────────────
const _colSaleReturns = 'saleReturns';
const _colCreditNoteCounter = 'meta';

// ─── Sale Returns List (by original bill) ────────────────────────────────────
final saleReturnsByBillProvider =
    StreamProvider.family<List<SaleReturnModel>, String>((ref, billId) {
  return FirebaseFirestore.instance
      .collection(_colSaleReturns)
      .where('originalBillId', isEqualTo: billId)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => SaleReturnModel.fromFirestore(d)).toList());
});

// ─── All Sale Returns (for reports) ──────────────────────────────────────────
final allSaleReturnsProvider = StreamProvider<List<SaleReturnModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(_colSaleReturns)
      .orderBy('createdAt', descending: true)
      .limit(500)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => SaleReturnModel.fromFirestore(d)).toList());
});

// ─── Sale Return Notifier ─────────────────────────────────────────────────────
class SaleReturnNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  SaleReturnNotifier(this._db, this._ref) : super(const AsyncValue.data(null));

  /// Generate next credit note number atomically (no duplicates)
  Future<String> _nextCreditNoteNumber() async {
    final counterRef = _db.collection(_colCreditNoteCounter).doc('creditNoteCounter');
    final year = DateTime.now().year;

    return await _db.runTransaction<String>((tx) async {
      final snap = await tx.get(counterRef);
      final existing = snap.data();
      final lastYear = existing?['year'] as int? ?? 0;
      final lastCount = lastYear == year ? (existing?['count'] as int? ?? 0) : 0;
      final nextCount = lastCount + 1;

      tx.set(counterRef, {'year': year, 'count': nextCount});
      return 'CN/$year/${nextCount.toString().padLeft(4, '0')}';
    });
  }

  /// Create a sale return:
  /// 1. Generate credit note number atomically
  /// 2. Restore stock to original batch (via existing revertSalesStock)
  /// 3. Save return document
  /// 4. Add ledger entry (credit against customer)
  Future<String?> createSaleReturn(SaleReturnModel returnModel) async {
    try {
      state = const AsyncValue.loading();

      // 1. Generate credit note number
      final creditNoteNumber = await _nextCreditNoteNumber();

      // 2. Restore stock for each returned item (Firestore transaction inside)
      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);
      for (final item in returnModel.items) {
        final error = await inventoryNotifier.revertSalesStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          quantity: item.returnQty,
        );
        if (error != null) {
          // Non-fatal: log but continue (same policy as sale deduction)
          // ignore: avoid_print
          print('Stock revert on return error for ${item.productName}: $error');
        }
      }

      // 3. Save return document
      final finalReturn = SaleReturnModel(
        creditNoteNumber: creditNoteNumber,
        originalBillId: returnModel.originalBillId,
        originalInvoiceNumber: returnModel.originalInvoiceNumber,
        customerId: returnModel.customerId,
        customerName: returnModel.customerName,
        customerPhone: returnModel.customerPhone,
        returnDate: returnModel.returnDate,
        createdAt: DateTime.now(),
        createdByUid: returnModel.createdByUid,
        createdByName: returnModel.createdByName,
        items: returnModel.items,
        totalRefundAmount: returnModel.totalRefundAmount,
        totalGstReversed: returnModel.totalGstReversed,
        reason: returnModel.reason,
        reasonNotes: returnModel.reasonNotes,
        refundMethod: returnModel.refundMethod,
        isSettled: returnModel.refundMethod != 'credit_note', // auto-settled if cash/UPI
        notes: returnModel.notes,
      );

      final docRef = await _db
          .collection(_colSaleReturns)
          .add(finalReturn.toFirestore());

      // 4. Add ledger credit entry (reduces customer balance)
      await _db.collection(AppConstants.colLedger).add({
        'partyId': returnModel.customerId,
        'partyName': returnModel.customerName,
        'type': 'credit_note',
        'amount': returnModel.totalRefundAmount,
        'description': 'Sale Return — Credit Note $creditNoteNumber (against ${returnModel.originalInvoiceNumber})',
        'billId': docRef.id,
        'billNumber': creditNoteNumber,
        'originalBillId': returnModel.originalBillId,
        'date': Timestamp.fromDate(returnModel.returnDate),
        'createdByUid': returnModel.createdByUid,
        'createdByName': returnModel.createdByName,
        'runningBalance': 0,
        'isSettled': finalReturn.isSettled,
      });

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  /// Mark a credit note as settled (refund given to customer)
  Future<String?> settleReturn(String returnId) async {
    try {
      await _db.collection(_colSaleReturns).doc(returnId).update({
        'isSettled': true,
        'settledAt': FieldValue.serverTimestamp(),
      });
      // Also update ledger entry
      final ledgerSnap = await _db
          .collection(AppConstants.colLedger)
          .where('billId', isEqualTo: returnId)
          .get();
      if (ledgerSnap.docs.isNotEmpty) {
        await ledgerSnap.docs.first.reference.update({'isSettled': true});
      }
      return null;
    } catch (e) {
      return e.toString();
    }
  }
}

final saleReturnNotifierProvider =
    StateNotifierProvider<SaleReturnNotifier, AsyncValue<void>>((ref) {
  return SaleReturnNotifier(ref.watch(firestoreProvider), ref);
});
