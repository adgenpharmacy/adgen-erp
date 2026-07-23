import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/purchase_bill_model.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';
import 'inventory_provider.dart';

// ─── Purchase Bills List ──────────────────────────────────────────────────────
final purchaseBillsProvider = StreamProvider<List<PurchaseBillModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colPurchaseBills)
      .orderBy('createdAt', descending: true)
      .limit(100)
      .snapshots()
      .map((snap) =>
          snap.docs.map((d) => PurchaseBillModel.fromFirestore(d)).toList());
});

// ─── Purchase CRUD Notifier ───────────────────────────────────────────────────
class PurchaseNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  PurchaseNotifier(this._db, this._ref) : super(const AsyncValue.data(null));

  Future<String?> savePurchase(PurchaseBillModel bill) async {
    try {
      state = const AsyncValue.loading();

      // We will use a WriteBatch to ensure atomicity
      final batchWrite = _db.batch();

      // 1. Prepare Inventory Updates (Read first)
      final Map<String, List<PurchaseItem>> groupedItems = {};
      for (final item in bill.items) {
        groupedItems.putIfAbsent(item.productId, () => []).add(item);
      }

      for (final productId in groupedItems.keys) {
        final docRef = _db.collection(AppConstants.colInventory).doc(productId);
        final doc = await docRef.get();
        final itemsList = groupedItems[productId]!;

        if (!doc.exists) {
          // New product inventory
          final batches = itemsList.map((item) => InventoryBatch(
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.totalContentQty,
            mrp: item.mrp,
            purchaseRate: item.rate,
            purchaseDate: bill.invoiceDate,
            purchaseBillId: 'PENDING_BATCH', // We will fix this ID below
          )).toList();
          
          final total = batches.fold<double>(0, (acc, b) => acc + b.quantity);
          final inventory = InventoryModel(
            id: productId,
            productId: productId,
            productName: itemsList.first.productName,
            batches: batches,
            systemStock: total,
            physicalStock: total,
            lowStockThreshold: AppConstants.lowStockDefault.toDouble(),
            lastUpdated: DateTime.now(),
          );
          batchWrite.set(docRef, inventory.toFirestore());
        } else {
          // Existing inventory, merge batches
          final existing = InventoryModel.fromFirestore(doc);
          final existingBatches = List<InventoryBatch>.from(existing.batches);

          for (final item in itemsList) {
            final newBatch = InventoryBatch(
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              quantity: item.totalContentQty,
              mrp: item.mrp,
              purchaseRate: item.rate,
              purchaseDate: bill.invoiceDate,
              purchaseBillId: 'PENDING_BATCH',
            );
            
            final idx = existingBatches.indexWhere((b) => 
                b.batchNumber == newBatch.batchNumber &&
                b.expiryDate.year == newBatch.expiryDate.year &&
                b.expiryDate.month == newBatch.expiryDate.month &&
                b.mrp == newBatch.mrp &&
                b.purchaseRate == newBatch.purchaseRate
            );
            
            if (idx >= 0) {
              existingBatches[idx] = existingBatches[idx].copyWith(
                quantity: existingBatches[idx].quantity + newBatch.quantity,
              );
            } else {
              existingBatches.add(newBatch);
            }
          }

          final newTotal = existingBatches.fold<double>(0, (acc, b) => acc + b.quantity);
          batchWrite.update(docRef, {
            'batches': existingBatches.map((b) => b.toMap()).toList(),
            'systemStock': newTotal,
            'physicalStock': newTotal,
            'lastUpdated': Timestamp.fromDate(DateTime.now()),
          });
        }
      }

      // 2. Add Purchase Bill
      final billRef = _db.collection(AppConstants.colPurchaseBills).doc();
      batchWrite.set(billRef, bill.toFirestore());

      // 3. Add Ledger Entry if credit + update party balance
      if (bill.ledgerType == LedgerType.credit) {
        final ledgerRef = _db.collection(AppConstants.colLedger).doc();
        batchWrite.set(ledgerRef, {
          'partyId': bill.partyId,
          'partyName': bill.partyName,
          'type': 'debit',
          'amount': bill.grandTotal,
          'description': 'Purchase Bill ${bill.invoiceNumber}',
          'billId': billRef.id,
          'billNumber': bill.invoiceNumber,
          'date': Timestamp.fromDate(bill.invoiceDate),
          'createdByUid': bill.createdByUid,
          'createdByName': bill.createdByName,
          'runningBalance': 0,
          'isSettled': false,
        });

        // Update party outstandingBalance
        final partyRef = _db.collection(AppConstants.colParties).doc(bill.partyId);
        batchWrite.update(partyRef, {
          'outstandingBalance': FieldValue.increment(bill.grandTotal),
        });
      }

      // 4. Commit all atomic operations
      await batchWrite.commit();

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
  Future<String?> deletePurchase(String id) async {
    try {
      state = const AsyncValue.loading();

      // 1. Fetch the old bill to revert its stock changes
      final oldDoc = await _db.collection(AppConstants.colPurchaseBills).doc(id).get();
      if (!oldDoc.exists) return 'Purchase bill not found';
      final oldBill = PurchaseBillModel.fromFirestore(oldDoc);

      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);

      // 2. Revert old stock
      for (final item in oldBill.items) {
        await inventoryNotifier.revertPurchaseStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          mrp: item.mrp,
          purchaseRate: item.rate,
          quantity: item.totalContentQty,
        );
      }

      // 3. Delete ledger entry & update party balance
      if (oldBill.ledgerType == LedgerType.credit) {
        if (oldBill.partyId.isNotEmpty) {
          await _db.collection(AppConstants.colParties).doc(oldBill.partyId).update({
            'outstandingBalance': FieldValue.increment(-oldBill.grandTotal),
          }).catchError((_) {});
        }

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

      // 4. Delete the purchase bill document
      await _db.collection(AppConstants.colPurchaseBills).doc(id).delete();

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updatePurchase(String id, PurchaseBillModel bill) async {
    try {
      state = const AsyncValue.loading();

      // 1. Fetch the old bill to revert its stock changes
      final oldDoc = await _db.collection(AppConstants.colPurchaseBills).doc(id).get();
      if (!oldDoc.exists) return 'Purchase bill not found';
      final oldBill = PurchaseBillModel.fromFirestore(oldDoc);

      final inventoryNotifier = _ref.read(inventoryNotifierProvider.notifier);

      // 2. Revert old stock (deduct quantities in content units)
      for (final item in oldBill.items) {
        await inventoryNotifier.revertPurchaseStock(
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          mrp: item.mrp,
          purchaseRate: item.rate,
          quantity: item.totalContentQty,
        );
      }

      // 3. Update the purchase bill document
      await _db.collection(AppConstants.colPurchaseBills).doc(id).update(bill.toFirestore());

      // 4. Add new stock (in content units)
      final Map<String, List<PurchaseItem>> groupedItems = {};
      for (final item in bill.items) {
        groupedItems.putIfAbsent(item.productId, () => []).add(item);
      }

      await Future.wait(groupedItems.values.map((itemsList) async {
        for (final item in itemsList) {
          final batch = InventoryBatch(
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: item.totalContentQty,
            mrp: item.mrp,
            purchaseRate: item.rate,
            purchaseDate: bill.invoiceDate,
            purchaseBillId: id,
          );
          await inventoryNotifier.addStock(
            productId: item.productId,
            productName: item.productName,
            batch: batch,
            lowStockThreshold: AppConstants.lowStockDefault.toDouble(),
          );
        }
      }));

      // 5. Update or recreate ledger entry
      final ledgerSnap = await _db
          .collection(AppConstants.colLedger)
          .where('billId', isEqualTo: id)
          .get();

      if (bill.ledgerType == LedgerType.credit) {
        final ledgerData = {
          'partyId': bill.partyId,
          'partyName': bill.partyName,
          'type': 'debit',
          'amount': bill.grandTotal,
          'description': 'Purchase Bill ${bill.invoiceNumber} (Updated)',
          'billId': id,
          'billNumber': bill.invoiceNumber,
          'date': Timestamp.fromDate(bill.invoiceDate),
          'createdByUid': bill.createdByUid,
          'createdByName': bill.createdByName,
          'runningBalance': 0,
          'isSettled': false,
        };

        if (ledgerSnap.docs.isNotEmpty) {
          // Update existing
          await ledgerSnap.docs.first.reference.update(ledgerData);
        } else {
          // Create new
          await _db.collection(AppConstants.colLedger).add(ledgerData);
        }
      } else {
        // Payment type changed to cash/bank — batch-delete ledger entry
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


}

final purchaseNotifierProvider =
    StateNotifierProvider<PurchaseNotifier, AsyncValue<void>>((ref) {
  return PurchaseNotifier(ref.watch(firestoreProvider), ref);
});
