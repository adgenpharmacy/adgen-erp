import 'dart:convert';
import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

class DataOpsNotifier extends StateNotifier<AsyncValue<String?>> {
  final FirebaseFirestore _db;

  DataOpsNotifier(this._db) : super(const AsyncValue.data(null));

  Future<void> importLegacyProductsAndInventory() async {
    try {
      state = const AsyncValue.loading();
      
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        withData: true,
      );

      if (result == null || (!kIsWeb && result.files.single.path == null)) {
        state = const AsyncValue.data(null);
        return;
      }

      String content;
      if (kIsWeb) {
        content = utf8.decode(result.files.single.bytes!);
      } else {
        final file = File(result.files.single.path!);
        content = await file.readAsString();
      }
      final data = jsonDecode(content);

      final List<dynamic> products = data['products'] ?? [];
      final List<dynamic> inventory = data['inventory'] ?? [];

      int totalUploaded = 0;

      // 1. Upload Products (Batched)
      if (products.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;

        for (var p in products) {
          final docRef = _db.collection(AppConstants.colProducts).doc(p['id']);
          p['createdAt'] = FieldValue.serverTimestamp();
          batch.set(docRef, p);
          opCount++;

          if (opCount == 400) { // Firestore limit is 500 per batch
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
        totalUploaded += products.length;
      }

      // 2. Upload Inventory (Batched)
      if (inventory.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;

        for (var inv in inventory) {
          final docRef = _db.collection(AppConstants.colInventory).doc(inv['productId']);
          
          // Map timestamps properly
          final batchesList = inv['batches'] as List;
          final mappedBatches = batchesList.map((b) => {
            'batchNumber': b['batchNumber'],
            'quantity': (b['quantity'] as num).toDouble(),
            'mrp': (b['mrp'] as num).toDouble(),
            'purchaseRate': (b['purchaseRate'] as num).toDouble(),
            'expiryDate': Timestamp.fromDate(DateTime.parse(b['expiryDate'])),
            'purchaseDate': Timestamp.fromDate(DateTime.parse(b['purchaseDate'])),
          }).toList();

          final payload = {
            'id': inv['productId'],
            'productId': inv['productId'],
            'productName': inv['productName'],
            'systemStock': (inv['systemStock'] as num).toDouble(),
            'physicalStock': (inv['physicalStock'] as num).toDouble(),
            'lowStockThreshold': (inv['lowStockThreshold'] as num).toDouble(),
            'lastUpdated': FieldValue.serverTimestamp(),
            'batches': mappedBatches,
          };

          batch.set(docRef, payload);
          opCount++;

          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      }

      state = AsyncValue.data("Successfully imported ${products.length} products and ${inventory.length} inventory records!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  Future<void> importLegacyParties() async {
    try {
      state = const AsyncValue.loading();
      
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        withData: true,
      );

      if (result == null || (!kIsWeb && result.files.single.path == null)) {
        state = const AsyncValue.data(null);
        return;
      }

      String content;
      if (kIsWeb) {
        content = utf8.decode(result.files.single.bytes!);
      } else {
        final file = File(result.files.single.path!);
        content = await file.readAsString();
      }
      final data = jsonDecode(content);

      final List<dynamic> parties = data['parties'] ?? [];

      if (parties.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;

        for (var p in parties) {
          final docRef = _db.collection(AppConstants.colParties).doc();
          p['createdAt'] = FieldValue.serverTimestamp();
          p['nameLower'] = p['name'].toString().toLowerCase();
          p['outstandingBalance'] = 0.0;
          p['creditLimit'] = 0.0;
          
          batch.set(docRef, p);
          opCount++;

          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      }

      state = AsyncValue.data("Successfully imported ${parties.length} parties!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  Future<void> exportCollection(String collectionName) async {
    try {
      state = const AsyncValue.loading();
      
      final snap = await _db.collection(collectionName).get();
      final docs = snap.docs.map((d) => d.data()).toList();
      
      final jsonStr = jsonEncode(docs);
      
      // Save to temp file
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$collectionName\_export.json');
      await file.writeAsString(jsonStr);
      
      // Share file
      final xFile = XFile(file.path, mimeType: 'application/json');
      await Share.shareXFiles([xFile], text: '$collectionName Export');
      
      state = const AsyncValue.data("Export ready for sharing!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  Future<void> clearInventory() async {
    try {
      state = const AsyncValue.loading();
      
      // Fetch all inventory documents
      final snap = await _db.collection(AppConstants.colInventory).get();
      
      if (snap.docs.isEmpty) {
        state = const AsyncValue.data("Inventory is already empty.");
        return;
      }

      WriteBatch batch = _db.batch();
      int opCount = 0;

      for (var doc in snap.docs) {
        batch.delete(doc.reference);
        opCount++;
        
        if (opCount == 400) {
          await batch.commit();
          batch = _db.batch();
          opCount = 0;
        }
      }
      
      if (opCount > 0) await batch.commit();

      state = const AsyncValue.data("Successfully wiped all inventory stock!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }
}

final dataOpsNotifierProvider =
    StateNotifierProvider<DataOpsNotifier, AsyncValue<String?>>((ref) {
  return DataOpsNotifier(ref.watch(firestoreProvider));
});
