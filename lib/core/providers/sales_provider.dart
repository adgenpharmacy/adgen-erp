import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/sales_bill_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';
import 'inventory_provider.dart';

// ─── Sales Bills List ─────────────────────────────────────────────────────────
final salesBillsProvider = StreamProvider<List<SalesBillModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colSalesBills)
      .orderBy('createdAt', descending: true)
      .limit(100)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => SalesBillModel.fromFirestore(d)).toList());
});

// ─── Credit Bills (derived from salesBillsProvider — no index needed) ─────────
final creditBillsProvider = Provider<AsyncValue<List<SalesBillModel>>>((ref) {
  final allSales = ref.watch(salesBillsProvider);
  return allSales.when(
    data: (bills) => AsyncValue.data(
      bills
          .where((b) => b.paymentMethod == PaymentMethod.credit && !b.isCreditPaid)
          .toList()
        ..sort((a, b) => b.saleDate.compareTo(a.saleDate)),
    ),
    loading: () => const AsyncValue.loading(),
    error: (e, s) => AsyncValue.error(e, s),
  );
});

// ─── Invoice counter ──────────────────────────────────────────────────────────
final nextInvoiceNumberProvider = FutureProvider<int>((ref) async {
  final snap = await FirebaseFirestore.instance
      .collection(AppConstants.colSalesBills)
      .orderBy('createdAt', descending: true)
      .limit(1)
      .get();
  if (snap.docs.isEmpty) return 1;
  final last = snap.docs.first.data()['invoiceNumber'] as String? ?? '';
  final parts = last.split('/');
  if (parts.isNotEmpty) {
    final num = int.tryParse(parts.last) ?? 0;
    return num + 1;
  }
  return 1;
});

// ─── Sales CRUD Notifier ──────────────────────────────────────────────────────
class SalesNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  SalesNotifier(this._db, this._ref) : super(const AsyncValue.data(null));

  Future<String?> saveSale(SalesBillModel bill) async {
    try {
      state = const AsyncValue.loading();

      // Save bill
      final docRef = await _db
          .collection(AppConstants.colSalesBills)
          .add(bill.toFirestore());

      // Deduct stock from inventory
      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);
      for (final item in bill.items) {
        final error = await inventoryNotifier.deductStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          quantity: item.quantity,
        );
        if (error != null) {
          // Log error but don't fail the sale
          debugPrint('Stock deduction error for ${item.productName}: $error');
        }
      }

      // Create ledger entry for credit sales
      if (bill.paymentMethod == PaymentMethod.credit) {
        await _db.collection(AppConstants.colLedger).add({
          'partyId': bill.customerId ?? bill.customerName,
          'partyName': bill.customerName,
          'type': 'credit',
          'amount': bill.grandTotal,
          'description': 'Sales Bill ${bill.invoiceNumber} — Credit',
          'billId': docRef.id,
          'billNumber': bill.invoiceNumber,
          'date': Timestamp.fromDate(bill.saleDate),
          'createdByUid': bill.createdByUid,
          'createdByName': bill.createdByName,
          'runningBalance': 0,
        });
      }

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> deleteSale(String id) async {
    try {
      state = const AsyncValue.loading();

      // 1. Fetch the old sales bill to revert its stock changes
      final oldDoc = await _db.collection(AppConstants.colSalesBills).doc(id).get();
      if (!oldDoc.exists) return 'Sales bill not found';
      final oldBill = SalesBillModel.fromFirestore(oldDoc);

      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);

      // 2. Revert old stock deduction
      for (final item in oldBill.items) {
        final error = await inventoryNotifier.revertSalesStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          quantity: item.quantity,
        );
        if (error != null) {
          debugPrint('Stock revert error for ${item.productName}: $error');
        }
      }

      // 3. Delete ledger entry & update party balance
      if (oldBill.paymentMethod == PaymentMethod.credit) {
        final partyId = oldBill.customerId ?? oldBill.customerName;
        if (partyId.isNotEmpty) {
          await _db.collection(AppConstants.colParties).doc(partyId).update({
            'outstandingBalance': FieldValue.increment(-oldBill.grandTotal),
          }).catchError((_) {});
        }

        // Batch-delete associated ledger entries (atomic + faster)
        final ledgerSnap = await _db
            .collection(AppConstants.colLedger)
            .where('billId', isEqualTo: id)
            .get();
        if (ledgerSnap.docs.isNotEmpty) {
          final ledgerBatch = _db.batch();
          for (final doc in ledgerSnap.docs) {
            ledgerBatch.delete(doc.reference);
          }
          await ledgerBatch.commit();
        }
      }

      // 4. Delete the sales bill document
      await _db.collection(AppConstants.colSalesBills).doc(id).delete();

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateSale(String id, SalesBillModel bill) async {
    try {
      state = const AsyncValue.loading();

      // 1. Fetch the old sales bill to revert its stock changes
      final oldDoc = await _db.collection(AppConstants.colSalesBills).doc(id).get();
      if (!oldDoc.exists) return 'Sales bill not found';
      final oldBill = SalesBillModel.fromFirestore(oldDoc);

      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);

      // 2. Revert old stock deduction
      for (final item in oldBill.items) {
        final error = await inventoryNotifier.revertSalesStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          quantity: item.quantity,
        );
        if (error != null) {
          debugPrint('Stock revert error for ${item.productName}: $error');
        }
      }

      // 3. Update the sales bill document
      await _db.collection(AppConstants.colSalesBills).doc(id).update(bill.toFirestore());

      // 4. Deduct new stock
      for (final item in bill.items) {
        final error = await inventoryNotifier.deductStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          quantity: item.quantity,
        );
        if (error != null) {
          debugPrint('Stock deduction error for ${item.productName}: $error');
        }
      }

      // 5. Update or sync ledger entry
      final ledgerSnap = await _db
          .collection(AppConstants.colLedger)
          .where('billId', isEqualTo: id)
          .get();

      if (bill.paymentMethod == PaymentMethod.credit) {
        final ledgerData = {
          'partyId': bill.customerId ?? bill.customerName,
          'partyName': bill.customerName,
          'type': 'credit',
          'amount': bill.grandTotal,
          'description': 'Sales Bill ${bill.invoiceNumber} — Credit (Updated)',
          'billId': id,
          'billNumber': bill.invoiceNumber,
          'date': Timestamp.fromDate(bill.saleDate),
          'createdByUid': bill.createdByUid,
          'createdByName': bill.createdByName,
          'runningBalance': 0,
          'isSettled': bill.isCreditPaid,
        };

        if (ledgerSnap.docs.isNotEmpty) {
          await ledgerSnap.docs.first.reference.update(ledgerData);
        } else {
          await _db.collection(AppConstants.colLedger).add(ledgerData);
        }
      } else {
        // If payment method is no longer credit, batch-delete ledger entry
        if (ledgerSnap.docs.isNotEmpty) {
          final deleteBatch = _db.batch();
          for (final doc in ledgerSnap.docs) {
            deleteBatch.delete(doc.reference);
          }
          await deleteBatch.commit();
        }
      }

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> markCreditPaid(String billId, {required double amount}) async {
    try {
      await _db.collection(AppConstants.colSalesBills).doc(billId).update({
        'isCreditPaid': true,
        'amountPaid': amount,          // rupee amount — stays a double
        'paidAt': FieldValue.serverTimestamp(), // separate timestamp field
      });
      return null;
    } catch (e) {
      return e.toString();
    }
  }


}

final salesNotifierProvider =
    StateNotifierProvider<SalesNotifier, AsyncValue<void>>((ref) {
  return SalesNotifier(ref.watch(firestoreProvider), ref);
});
