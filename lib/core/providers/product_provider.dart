import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/product_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';
import 'inventory_provider.dart';

// ─── All Products Stream ──────────────────────────────────────────────────────
final productCatalogProvider = StreamProvider<List<ProductModel>>((ref) {
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

// ─── All Products including inactive (for admin) ──────────────────────────────
final allProductsProvider = StreamProvider<List<ProductModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colProducts)
      .snapshots()
      .map((snap) {
        final all = snap.docs.map((d) => ProductModel.fromFirestore(d)).toList();
        all.sort((a, b) => a.name.compareTo(b.name));
        return all;
      });
});

// ─── Product Search ────────────────────────────────────────────────────────────
final productSearchQueryProvider = StateProvider<String>((ref) => '');

final filteredProductsProvider = Provider<List<ProductModel>>((ref) {
  final query = ref.watch(productSearchQueryProvider).toLowerCase();
  final products = ref.watch(productCatalogProvider).valueOrNull ?? [];
  if (query.isEmpty) return products;
  return products.where((p) =>
    p.name.toLowerCase().contains(query) ||
    (p.genericName?.toLowerCase().contains(query) ?? false) ||
    p.companyName.toLowerCase().contains(query) ||
    p.hsnCode.contains(query)
  ).toList();
});

// ─── Product CRUD Notifier ────────────────────────────────────────────────────
class ProductNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;
  final Ref _ref;

  ProductNotifier(this._db, this._ref) : super(const AsyncValue.data(null));

  Future<String?> createProduct(ProductModel product) async {
    try {
      state = const AsyncValue.loading();

      // Save to products collection
      final docRef = await _db
          .collection(AppConstants.colProducts)
          .add(product.toFirestore());

      // Create empty inventory entry so product appears in inventory with 0 stock
      await _ref.read(inventoryNotifierProvider.notifier).createEmptyInventory(
        productId: docRef.id,
        productName: product.name,
        lowStockThreshold: product.lowStockThreshold,
      );

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateProduct(String id, ProductModel product) async {
    try {
      state = const AsyncValue.loading();
      await _db
          .collection(AppConstants.colProducts)
          .doc(id)
          .update(product.toFirestore());

      // Update the product name in inventory doc if changed (use set with merge in case it doesn't exist)
      await _db
          .collection(AppConstants.colInventory)
          .doc(id)
          .set({
            'productName': product.name,
            'productNameLower': product.name.toLowerCase(),
            'lowStockThreshold': product.lowStockThreshold,
          }, SetOptions(merge: true));

      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> toggleActive(String id, bool isActive) async {
    try {
      await _db
          .collection(AppConstants.colProducts)
          .doc(id)
          .update({'isActive': isActive});
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> deleteProduct(String id) async {
    try {
      state = const AsyncValue.loading();
      // Delete from products
      await _db.collection(AppConstants.colProducts).doc(id).delete();
      // Delete from inventory
      await _db.collection(AppConstants.colInventory).doc(id).delete();
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final productNotifierProvider =
    StateNotifierProvider<ProductNotifier, AsyncValue<void>>((ref) {
  return ProductNotifier(ref.watch(firestoreProvider), ref);
});
