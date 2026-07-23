import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../../shared/models/product_model.dart';

// ─── Products Provider (REST API) ──────────────────────────────────────────────
final productsProvider = FutureProvider<List<ProductModel>>((ref) async {
  final response = await apiClient.get('/products');
  final List<dynamic> data = response.data;
  return data.map((json) => ProductModel.fromFirestoreMap(json)).toList();
});

final productCatalogProvider = productsProvider;
final allProductsProvider = productsProvider;

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

// ─── Product CRUD Notifier (REST API) ──────────────────────────────────────────
class ProductNotifier extends StateNotifier<AsyncValue<void>> {
  final Ref _ref;

  ProductNotifier(this._ref) : super(const AsyncValue.data(null));

  Future<String?> createProduct(ProductModel product) async {
    try {
      state = const AsyncValue.loading();
      await apiClient.post('/products', data: product.toFirestore());
      _ref.invalidate(productsProvider);
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
      await apiClient.put('/products/$id', data: product.toFirestore());
      _ref.invalidate(productsProvider);
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> toggleActive(String id, bool isActive) async {
    try {
      await apiClient.put('/products/$id', data: {'isActive': isActive});
      _ref.invalidate(productsProvider);
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> deleteProduct(String id) async {
    try {
      state = const AsyncValue.loading();
      await apiClient.delete('/products/$id');
      _ref.invalidate(productsProvider);
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
  return ProductNotifier(ref);
});
