import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/models/inventory_batch_model.dart';
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

// ─── Invoice counter (atomic — no duplicates) ────────────────────────────────
final nextInvoiceNumberProvider = FutureProvider<int>((ref) async {
  final counterRef = FirebaseFirestore.instance
      .collection('meta')
      .doc('invoiceCounter');
  final year = DateTime.now().year;

  return await FirebaseFirestore.instance.runTransaction<int>((tx) async {
    final snap = await tx.get(counterRef);
    final existing = snap.data();
    final lastYear = existing?['year'] as int? ?? 0;
    final lastCount = lastYear == year ? (existing?['count'] as int? ?? 0) : 0;
    final nextCount = lastCount + 1;
    tx.set(counterRef, {'year': year, 'count': nextCount});
    return nextCount;
  });
});

// ─── Sales CRUD Notifier ──────────────────────────────────────────────────────
class SalesNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  SalesNotifier(this._db, this._ref) : super(const AsyncValue.data(null));

  Future<String?> saveSale(SalesBillModel bill) async {
    try {
      state = const AsyncValue.loading();

      await _db.runTransaction((transaction) async {
        // 1. Read all inventory documents first (required by Firestore transactions before any writes)
        final Map<String, DocumentSnapshot<Map<String, dynamic>>> inventoryDocs = {};
        for (final item in bill.items) {
          final docRef = _db.collection(AppConstants.colInventory).doc(item.productId);
          final doc = await transaction.get(docRef);
          if (doc.exists) {
            inventoryDocs[item.productId] = doc;
          }
        }

        // 2. Perform all stock deductions
        for (final item in bill.items) {
          final doc = inventoryDocs[item.productId];
          if (doc == null) continue; // Product missing from inventory, skip deduction
          
          final existing = InventoryModel.fromFirestore(doc);
          final batches = List<InventoryBatch>.from(existing.batches);
          double remainingQtyToDeduct = item.quantity;
          
          // Try to find exact batch
          if (item.batchNumber.isNotEmpty) {
            final exactIdx = batches.indexWhere((b) => b.batchNumber == item.batchNumber);
            if (exactIdx >= 0) {
              final batch = batches[exactIdx];
              if (batch.quantity >= remainingQtyToDeduct) {
                batches[exactIdx] = batch.copyWith(quantity: batch.quantity - remainingQtyToDeduct);
                remainingQtyToDeduct = 0;
              } else if (batch.quantity > 0) {
                remainingQtyToDeduct -= batch.quantity;
                batches[exactIdx] = batch.copyWith(quantity: 0);
              }
            }
          }

          // FEFO fallback
          if (remainingQtyToDeduct > 0) {
            final availableIndices = <int>[];
            for (int i = 0; i < batches.length; i++) {
              if (batches[i].quantity > 0) availableIndices.add(i);
            }
            availableIndices.sort((a, b) => batches[a].expiryDate.compareTo(batches[b].expiryDate));

            for (final idx in availableIndices) {
              if (remainingQtyToDeduct <= 0) break;
              final batch = batches[idx];
              if (batch.quantity >= remainingQtyToDeduct) {
                batches[idx] = batch.copyWith(quantity: batch.quantity - remainingQtyToDeduct);
                remainingQtyToDeduct = 0;
              } else {
                remainingQtyToDeduct -= batch.quantity;
                batches[idx] = batch.copyWith(quantity: 0);
              }
            }
          }

          // Do not allow negative stock
          if (remainingQtyToDeduct > 0) {
            throw Exception('Insufficient stock for ${item.productName}');
          }

          final newTotal = batches.fold<double>(0, (acc, b) => acc + b.quantity);
          transaction.update(doc.reference, {
            'batches': batches.map((b) => b.toMap()).toList(),
            'systemStock': newTotal,
            'physicalStock': newTotal,
            'lastUpdated': Timestamp.fromDate(DateTime.now()),
          });
        }

        // 3. Save Sales Bill
        final billRef = _db.collection(AppConstants.colSalesBills).doc();
        transaction.set(billRef, bill.toFirestore());

        // 4. Create Ledger Entry for credit sales
        if (bill.paymentMethod == PaymentMethod.credit) {
          final ledgerRef = _db.collection(AppConstants.colLedger).doc();
          transaction.set(ledgerRef, {
            'partyId': bill.customerId ?? bill.customerName,
            'partyName': bill.customerName,
            'type': 'credit',
            'amount': bill.grandTotal,
            'description': 'Sales Bill ${bill.invoiceNumber} — Credit',
            'billId': billRef.id,
            'billNumber': bill.invoiceNumber,
            'date': Timestamp.fromDate(bill.saleDate),
            'createdByUid': bill.createdByUid,
            'createdByName': bill.createdByName,
            'runningBalance': 0,
            'isSettled': false,
          });

          // 5. Update customer creditBalance
          if (bill.customerId != null && bill.customerId!.isNotEmpty) {
            final custRef = _db.collection(AppConstants.colCustomers).doc(bill.customerId!);
            transaction.update(custRef, {
              'creditBalance': FieldValue.increment(bill.grandTotal),
            });
          }
        }
      });

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

      // 3. Delete ledger entry & update customer balance
      if (oldBill.paymentMethod == PaymentMethod.credit) {
        final customerId = oldBill.customerId;
        if (customerId != null && customerId.isNotEmpty) {
          await _db.collection(AppConstants.colCustomers).doc(customerId).update({
            'creditBalance': FieldValue.increment(-oldBill.grandTotal),
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
