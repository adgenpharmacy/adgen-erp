import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/customer_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

// ─── Customers (client-side filter — no index needed) ─────────────────────────
final customersProvider = StreamProvider<List<CustomerModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colCustomers)
      .snapshots()
      .map((snap) {
        final all = snap.docs.map((d) => CustomerModel.fromFirestore(d)).toList();
        final active = all.where((c) => c.isActive).toList();
        active.sort((a, b) => a.name.compareTo(b.name));
        return active;
      });
});

// ─── Customer Search (client-side — no index needed) ──────────────────────────
final customerSearchProvider =
    Provider.family<List<CustomerModel>, String>((ref, query) {
  final allCustomers = ref.watch(customersProvider);
  if (query.isEmpty) return [];
  final lowerQuery = query.toLowerCase();
  return allCustomers.valueOrNull
          ?.where((c) =>
              c.isActive &&
              (c.name.toLowerCase().contains(lowerQuery) ||
               c.phone.contains(lowerQuery) ||
               (c.email?.toLowerCase().contains(lowerQuery) ?? false)))
          .toList() ??
      [];
});

class CustomerNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  CustomerNotifier(this._db) : super(const AsyncValue.data(null));

  Future<String?> addCustomer(CustomerModel customer) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colCustomers).add(customer.toFirestore());
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateCustomer(String id, CustomerModel customer) async {
    try {
      state = const AsyncValue.loading();

      final batch = _db.batch();
      final custRef = _db.collection(AppConstants.colCustomers).doc(id);
      batch.update(custRef, customer.toFirestore());

      // ── Fan-out updates for Data Redundancy ──
      // Update customerName in all sales_bills
      final salesBillsSnap = await _db.collection(AppConstants.colSalesBills)
          .where('customerId', isEqualTo: id)
          .get();
      for (final doc in salesBillsSnap.docs) {
        batch.update(doc.reference, {'customerName': customer.name});
      }

      // Update partyName in ledger (sales ledger uses customerId as partyId)
      final ledgerSnap = await _db.collection(AppConstants.colLedger)
          .where('partyId', isEqualTo: id)
          .get();
      for (final doc in ledgerSnap.docs) {
        batch.update(doc.reference, {'partyName': customer.name});
      }

      await batch.commit();

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> importCustomers(List<CustomerModel> customers) async {
    try {
      state = const AsyncValue.loading();
      final batch = _db.batch();
      for (final customer in customers) {
        final docRef = _db.collection(AppConstants.colCustomers).doc();
        batch.set(docRef, customer.toFirestore());
      }
      await batch.commit();
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final customerNotifierProvider =
    StateNotifierProvider<CustomerNotifier, AsyncValue<void>>((ref) {
  return CustomerNotifier(ref.watch(firestoreProvider));
});
