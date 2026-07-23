import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/ledger_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

final ledgerProvider = StreamProvider<List<LedgerModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colLedger)
      .orderBy('date', descending: true)
      .limit(200)
      .snapshots()
      .map((snap) => snap.docs.map((d) => LedgerModel.fromFirestore(d)).toList());
});

// ─── Ledger by Party (sort in Dart — no composite index needed) ───────────────
final ledgerByPartyProvider =
    StreamProvider.family<List<LedgerModel>, String>((ref, partyId) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colLedger)
      .where('partyId', isEqualTo: partyId)
      .snapshots()
      .map((snap) {
        final list = snap.docs.map((d) => LedgerModel.fromFirestore(d)).toList();
        list.sort((a, b) => b.date.compareTo(a.date));
        return list;
      });
});

class LedgerNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  LedgerNotifier(this._db) : super(const AsyncValue.data(null));

  Future<String?> addEntry(LedgerModel entry) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colLedger).add(entry.toFirestore());
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateEntry(String id, LedgerModel entry) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colLedger).doc(id).update(entry.toFirestore());
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> deleteEntry(String id) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colLedger).doc(id).delete();
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  /// Marks a ledger entry as settled (credit → cash conversion).
  /// Also marks the associated purchase bill as isPaid = true or sales bill as isCreditPaid = true.
  Future<String?> markAsSettled(String id, {String? billId, required LedgerEntryType entryType}) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colLedger).doc(id).update({
        'isSettled': true,
        'settledAt': Timestamp.fromDate(DateTime.now()),
      });
      // Also update linked bill if any
      if (billId != null) {
        if (entryType == LedgerEntryType.debit) {
          await _db
              .collection(AppConstants.colPurchaseBills)
              .doc(billId)
              .update({'isPaid': true});
        } else {
          // Read the bill to get the actual grandTotal for amountPaid
          final billDoc = await _db
              .collection(AppConstants.colSalesBills)
              .doc(billId)
              .get();
          final grandTotal = billDoc.exists
              ? (billDoc.data()?['grandTotal'] ?? 0).toDouble()
              : 0.0;
          await _db
              .collection(AppConstants.colSalesBills)
              .doc(billId)
              .update({
            'isCreditPaid': true,
            'amountPaid': grandTotal,
            'paidAt': FieldValue.serverTimestamp(),
          });

          // Also decrement customer creditBalance
          final customerId = billDoc.data()?['customerId'] as String?;
          if (customerId != null && customerId.isNotEmpty) {
            await _db.collection(AppConstants.colCustomers).doc(customerId).update({
              'creditBalance': FieldValue.increment(-grandTotal),
            }).catchError((_) {});
          }
        }
      }
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final ledgerNotifierProvider =
    StateNotifierProvider<LedgerNotifier, AsyncValue<void>>((ref) {
  return LedgerNotifier(ref.watch(firestoreProvider));
});
