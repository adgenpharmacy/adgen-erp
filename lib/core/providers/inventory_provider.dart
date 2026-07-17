import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/inventory_batch_model.dart';
import '../../shared/models/product_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

// ─── Product List (no index needed — filter active + sort in Dart) ───────────
final productsProvider = StreamProvider<List<ProductModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colProducts)
      .snapshots()
      .map((snap) {
        final all = snap.docs.map((d) => ProductModel.fromFirestore(d)).toList();
        final active = all.where((p) => p.isActive).toList();
        active.sort((a, b) => a.name.compareTo(b.name));
        return active;
      });
});

// ─── Product Search (client-side — no index needed) ─────────────────────────
final productSearchProvider =
    Provider.family<List<ProductModel>, String>((ref, query) {
  final allProducts = ref.watch(productsProvider);
  if (query.isEmpty) return [];
  final lowerQuery = query.toLowerCase();
  return allProducts.valueOrNull
          ?.where((p) =>
              p.isActive &&
              (p.name.toLowerCase().contains(lowerQuery) ||
               (p.genericName?.toLowerCase().contains(lowerQuery) ?? false) ||
               (p.companyName.toLowerCase().contains(lowerQuery))))
          .toList() ??
      [];
});

// ─── Inventory List ───────────────────────────────────────────────────────────
final inventoryProvider = StreamProvider<List<InventoryModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colInventory)
      .snapshots()
      .map((snap) => snap.docs.map((d) => InventoryModel.fromFirestore(d)).toList());
});

// ─── Low Stock Products ───────────────────────────────────────────────────────
final lowStockProvider = Provider<AsyncValue<List<InventoryModel>>>((ref) {
  final inventory = ref.watch(inventoryProvider);
  return inventory.when(
    data: (list) => AsyncValue.data(
      list.where((i) => i.isLowStock || i.isOutOfStock).toList(),
    ),
    loading: () => const AsyncValue.loading(),
    error: (e, s) => AsyncValue.error(e, s),
  );
});

// ─── Expiring/Expired Products ────────────────────────────────────────────────
final expiringProductsProvider = Provider<AsyncValue<List<InventoryModel>>>((ref) {
  final inventory = ref.watch(inventoryProvider);
  return inventory.when(
    data: (list) => AsyncValue.data(
      list
          .where((i) =>
              i.expiredBatches.isNotEmpty || i.expiringSoonBatches.isNotEmpty)
          .toList(),
    ),
    loading: () => const AsyncValue.loading(),
    error: (e, s) => AsyncValue.error(e, s),
  );
});

// ─── Inventory CRUD Notifier ──────────────────────────────────────────────────
class InventoryNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  InventoryNotifier(this._db) : super(const AsyncValue.data(null));

  // ── Helper: recalculate and persist totals after any batch mutation ─────────
  Future<void> _recalculateAndSave({
    required DocumentReference docRef,
    required List<InventoryBatch> batches,
  }) async {
    final total = batches.fold<double>(0, (acc, b) => acc + b.quantity);
    await docRef.update({
      'batches': batches.map((b) => b.toMap()).toList(),
      'systemStock': total,
      'physicalStock': total,
      'lastUpdated': Timestamp.fromDate(DateTime.now()),
    });
  }

  /// Create an empty inventory record when a new product is added to the catalog
  Future<void> createEmptyInventory({
    required String productId,
    required String productName,
    required double lowStockThreshold,
  }) async {
    try {
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      final doc = await docRef.get();
      if (doc.exists) return; // already exists, skip
      final inventory = InventoryModel(
        id: productId,
        productId: productId,
        productName: productName,
        batches: const [],
        systemStock: 0,
        physicalStock: 0,
        lowStockThreshold: lowStockThreshold,
        lastUpdated: DateTime.now(),
      );
      await docRef.set(inventory.toFirestore());
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  /// Add or update inventory for a product (called after purchase)
  /// [batch.quantity] should be in content units (e.g. total tablets, not strips)
  Future<void> addStock({
    required String productId,
    required String productName,
    required InventoryBatch batch,
    required double lowStockThreshold,
  }) async {
    try {
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      final doc = await docRef.get();

      if (!doc.exists) {
        // Create new inventory entry
        final inventory = InventoryModel(
          id: productId,
          productId: productId,
          productName: productName,
          batches: [batch],
          systemStock: batch.quantity,
          physicalStock: batch.quantity,
          lowStockThreshold: lowStockThreshold,
          lastUpdated: DateTime.now(),
        );
        await docRef.set(inventory.toFirestore());
      } else {
        // Add batch to existing inventory
        final existing = InventoryModel.fromFirestore(doc);
        final batches = List<InventoryBatch>.from(existing.batches);

        // Check if batch already exists (match by batch, expiry, mrp, and purchase rate)
        final idx = batches.indexWhere((b) => 
            b.batchNumber == batch.batchNumber &&
            b.expiryDate.year == batch.expiryDate.year &&
            b.expiryDate.month == batch.expiryDate.month &&
            b.mrp == batch.mrp &&
            b.purchaseRate == batch.purchaseRate
        );
        if (idx >= 0) {
          // Update existing batch qty
          batches[idx] = batches[idx].copyWith(
            quantity: batches[idx].quantity + batch.quantity,
          );
        } else {
          batches.add(batch);
        }

        await _recalculateAndSave(docRef: docRef, batches: batches);
      }
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  /// Deduct stock after sales (transaction-safe, FEFO fallback)
  Future<String?> deductStock({
    required String productId,
    required String batchNumber,
    required double quantity,
  }) async {
    try {
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);

      return await _db.runTransaction<String?>((transaction) async {
        final doc = await transaction.get(docRef);

        if (!doc.exists) return 'Product not found in inventory';

        final existing = InventoryModel.fromFirestore(doc);
        final batches = List<InventoryBatch>.from(existing.batches);
        
        double remainingQtyToDeduct = quantity;
        
        // 1. Try to find the exact batch first
        if (batchNumber.isNotEmpty) {
          final exactIdx = batches.indexWhere((b) => b.batchNumber == batchNumber);
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

        // 2. FEFO fallback: if we still need to deduct (batch missing, wrong, or insufficient)
        if (remainingQtyToDeduct > 0) {
          // Sort available batches by expiry date
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

        // 3. If still remaining (selling more than system stock), let the exact batch (or first batch) go negative
        // This prevents silent failures when a pharmacy sells items they physically have but forgot to log in the system.
        if (remainingQtyToDeduct > 0) {
          if (batchNumber.isNotEmpty) {
            final exactIdx = batches.indexWhere((b) => b.batchNumber == batchNumber);
            if (exactIdx >= 0) {
              batches[exactIdx] = batches[exactIdx].copyWith(quantity: batches[exactIdx].quantity - remainingQtyToDeduct);
            } else if (batches.isNotEmpty) {
              batches[0] = batches[0].copyWith(quantity: batches[0].quantity - remainingQtyToDeduct);
            }
          } else if (batches.isNotEmpty) {
            batches[0] = batches[0].copyWith(quantity: batches[0].quantity - remainingQtyToDeduct);
          }
          remainingQtyToDeduct = 0;
        }

        final newTotal = batches.fold<double>(0, (acc, b) => acc + b.quantity);
        transaction.update(docRef, {
          'batches': batches.map((b) => b.toMap()).toList(),
          'systemStock': newTotal,
          'physicalStock': newTotal,
          'lastUpdated': Timestamp.fromDate(DateTime.now()),
        });

        return null; // success
      });
    } catch (e) {
      return e.toString();
    }
  }

  /// Revert/deduct stock when updating or deleting a purchase bill
  Future<void> revertPurchaseStock({
    required String productId,
    required String batchNumber,
    required DateTime expiryDate,
    required double mrp,
    required double purchaseRate,
    required double quantity,
  }) async {
    try {
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      await _db.runTransaction((transaction) async {
        final doc = await transaction.get(docRef);
        if (!doc.exists) return;

        final existing = InventoryModel.fromFirestore(doc);
        final batches = List<InventoryBatch>.from(existing.batches);
        
        // Find exact matching batch
        final idx = batches.indexWhere((b) => 
            b.batchNumber == batchNumber &&
            b.expiryDate.year == expiryDate.year &&
            b.expiryDate.month == expiryDate.month &&
            b.mrp == mrp &&
            b.purchaseRate == purchaseRate
        );

        if (idx < 0) return;

        if (batches[idx].quantity <= quantity) {
          batches.removeAt(idx);
        } else {
          batches[idx] = batches[idx].copyWith(
            quantity: batches[idx].quantity - quantity,
          );
        }

        final newTotal = batches.fold<double>(0, (acc, b) => acc + b.quantity);
        transaction.update(docRef, {
          'batches': batches.map((b) => b.toMap()).toList(),
          'systemStock': newTotal,
          'physicalStock': newTotal,
          'lastUpdated': Timestamp.fromDate(DateTime.now()),
        });
      });
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  /// Revert stock when a sales bill is deleted or updated
  /// Adds the sold quantity back to its original batch, or the closest matching batch
  Future<String?> revertSalesStock({
    required String productId,
    required String batchNumber,
    required double quantity,
  }) async {
    try {
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);

      return await _db.runTransaction<String?>((transaction) async {
        final doc = await transaction.get(docRef);

        if (!doc.exists) return 'Product not found in inventory';

        final existing = InventoryModel.fromFirestore(doc);
        final batches = List<InventoryBatch>.from(existing.batches);
        
        bool batchFound = false;

        // Try to add it back to the exact batch
        if (batchNumber.isNotEmpty) {
          final exactIdx = batches.indexWhere((b) => b.batchNumber == batchNumber);
          if (exactIdx >= 0) {
            batches[exactIdx] = batches[exactIdx].copyWith(
              quantity: batches[exactIdx].quantity + quantity
            );
            batchFound = true;
          }
        }

        // If batch not found, add it to the first available batch, or re-create a default one
        if (!batchFound) {
          if (batches.isNotEmpty) {
            batches[0] = batches[0].copyWith(
              quantity: batches[0].quantity + quantity
            );
          } else {
            // Recreate a generic batch if none exist
            batches.add(
              InventoryBatch(
                batchNumber: batchNumber.isNotEmpty ? batchNumber : 'RESTORED',
                quantity: quantity,
                mrp: 0,
                purchaseRate: 0,
                purchaseDate: DateTime.now(),
                expiryDate: DateTime.now().add(const Duration(days: 365)),
                purchaseBillId: 'REVERTED_SALE',
              )
            );
          }
        }

        final newTotal = batches.fold<double>(0, (acc, b) => acc + b.quantity);
        transaction.update(docRef, {
          'batches': batches.map((b) => b.toMap()).toList(),
          'systemStock': newTotal,
          'physicalStock': newTotal,
          'lastUpdated': Timestamp.fromDate(DateTime.now()),
        });

        return null;
      });
    } catch (e) {
      return e.toString();
    }
  }

  // ── Batch-Level Manual Adjustment (replaces whole-stock correction) ──────────

  /// Adjust quantity of a specific batch (owner only)
  Future<String?> adjustBatchQuantity({
    required String productId,
    required String batchNumber,
    required double newQuantity,
    required String reason,
    required String adjustedByName,
  }) async {
    try {
      state = const AsyncValue.loading();
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      final doc = await docRef.get();
      if (!doc.exists) {
        state = const AsyncValue.data(null);
        return 'Product not found in inventory';
      }

      final existing = InventoryModel.fromFirestore(doc);
      final batches = List<InventoryBatch>.from(existing.batches);
      final idx = batches.indexWhere((b) => b.batchNumber == batchNumber);
      if (idx < 0) {
        state = const AsyncValue.data(null);
        return 'Batch not found';
      }

      batches[idx] = batches[idx].copyWith(
        quantity: newQuantity,
        adjustmentReason: reason,
        adjustedByName: adjustedByName,
        isManualAdjustment: true,
      );

      await _recalculateAndSave(docRef: docRef, batches: batches);
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  /// Completely remove a batch from inventory (for expired/cleared stock)
  Future<String?> removeBatch({
    required String productId,
    required String batchNumber,
    required String reason,
    required String removedByName,
  }) async {
    try {
      state = const AsyncValue.loading();
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      final doc = await docRef.get();
      if (!doc.exists) {
        state = const AsyncValue.data(null);
        return 'Product not found';
      }

      final existing = InventoryModel.fromFirestore(doc);
      final batches = List<InventoryBatch>.from(existing.batches)
        ..removeWhere((b) => b.batchNumber == batchNumber);

      await _recalculateAndSave(docRef: docRef, batches: batches);
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  /// Add a standalone manual adjustment batch (e.g. damage, donation, opening stock)
  Future<String?> addManualAdjustmentBatch({
    required String productId,
    required InventoryBatch batch,
  }) async {
    try {
      state = const AsyncValue.loading();
      final docRef = _db.collection(AppConstants.colInventory).doc(productId);
      final doc = await docRef.get();
      if (!doc.exists) {
        state = const AsyncValue.data(null);
        return 'Product not found in inventory';
      }

      final existing = InventoryModel.fromFirestore(doc);
      final batches = List<InventoryBatch>.from(existing.batches);

      // Check for duplicate batch number
      final exists = batches.any((b) => b.batchNumber == batch.batchNumber);
      if (exists) {
        // Merge quantity into existing batch
        final idx = batches.indexWhere((b) => b.batchNumber == batch.batchNumber);
        batches[idx] = batches[idx].copyWith(
          quantity: batches[idx].quantity + batch.quantity,
          adjustmentReason: batch.adjustmentReason,
          adjustedByName: batch.adjustedByName,
          isManualAdjustment: true,
        );
      } else {
        batches.add(batch);
      }

      await _recalculateAndSave(docRef: docRef, batches: batches);
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  /// Update low-stock alert threshold for a product
  Future<String?> updateThreshold(String productId, double threshold) async {
    try {
      await _db
          .collection(AppConstants.colInventory)
          .doc(productId)
          .update({'lowStockThreshold': threshold});
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Hard delete an inventory record — use for dummy/false records only
  Future<String?> deleteInventory(String productId) async {
    try {
      await _db
          .collection(AppConstants.colInventory)
          .doc(productId)
          .delete();
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  // Keep legacy correctStock for any existing call sites — delegates to adjustBatchQuantity
  // or a full recalculate if no specific batch is targeted.
  Future<String?> correctStock({
    required String productId,
    required double correctedQty,
    required String reason,
    String? batchNumber,
    String adjustedByName = 'Owner',
  }) async {
    if (batchNumber != null) {
      return adjustBatchQuantity(
        productId: productId,
        batchNumber: batchNumber,
        newQuantity: correctedQty,
        reason: reason,
        adjustedByName: adjustedByName,
      );
    }
    // Legacy: just update physicalStock totals (for backwards compat)
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colInventory).doc(productId).update({
        'physicalStock': correctedQty,
        'lastUpdated': Timestamp.fromDate(DateTime.now()),
        'lastCorrectionReason': reason,
        'lastCorrectionAt': Timestamp.fromDate(DateTime.now()),
      });
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final inventoryNotifierProvider =
    StateNotifierProvider<InventoryNotifier, AsyncValue<void>>((ref) {
  return InventoryNotifier(ref.watch(firestoreProvider));
});
