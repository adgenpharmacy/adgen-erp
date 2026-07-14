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
          p['mrp'] = (p['mrp'] as num?)?.toDouble() ?? 0.0;
          p['rate'] = (p['rate'] as num?)?.toDouble() ?? 0.0;
          p['lowStockThreshold'] = 1.0;
          
          batch.set(docRef, p, SetOptions(merge: true));
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

      state = AsyncValue.data("Successfully updated ${products.length} products!");
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
      
      final jsonStr = jsonEncode(docs, toEncodable: (dynamic item) {
        if (item is Timestamp) {
          return item.toDate().toUtc().toIso8601String();
        }
        return item.toString();
      });
      
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

  Future<void> restoreBackup(String collectionName) async {
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
      final List<dynamic> data = jsonDecode(content);

      if (data.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;

        for (var doc in data) {
          if (doc is! Map<String, dynamic>) continue;
          
          Map<String, dynamic> parsedDoc = {};
          doc.forEach((key, value) {
            if (value is String && value.contains('T') && value.endsWith('Z')) {
              final dt = DateTime.tryParse(value);
              if (dt != null) {
                parsedDoc[key] = Timestamp.fromDate(dt);
                return;
              }
            }
            parsedDoc[key] = value;
          });

          String? docId = parsedDoc['id'];
          final docRef = docId != null 
              ? _db.collection(collectionName).doc(docId)
              : _db.collection(collectionName).doc();
              
          batch.set(docRef, parsedDoc, SetOptions(merge: true));
          opCount++;

          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      }

      state = AsyncValue.data("Successfully restored ${data.length} records to $collectionName!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  Future<void> clearInventory() async {
    try {
      state = const AsyncValue.loading();
      final snapshot = await _db.collection(AppConstants.colInventory).get();
      
      if (snapshot.docs.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;
        
        for (var doc in snapshot.docs) {
          batch.delete(doc.reference);
          opCount++;
          
          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      }
      
      state = const AsyncValue.data("All inventory stock has been successfully wiped!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  Future<void> bulkSetLowStockToOne() async {
    try {
      state = const AsyncValue.loading();
      int totalUpdated = 0;

      // 1. Update Products
      var productSnaps = await _db.collection(AppConstants.colProducts).get();
      if (productSnaps.docs.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;
        for (var doc in productSnaps.docs) {
          batch.update(doc.reference, {'lowStockThreshold': 1.0});
          opCount++;
          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
        totalUpdated += productSnaps.docs.length;
      }

      // 2. Update Inventory
      var invSnaps = await _db.collection(AppConstants.colInventory).get();
      if (invSnaps.docs.isNotEmpty) {
        WriteBatch batch = _db.batch();
        int opCount = 0;
        for (var doc in invSnaps.docs) {
          batch.update(doc.reference, {'lowStockThreshold': 1.0});
          opCount++;
          if (opCount == 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
        totalUpdated += invSnaps.docs.length;
      }

      state = AsyncValue.data("Successfully migrated $totalUpdated records to lowStock=1!");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }
}

final dataOpsNotifierProvider =
    StateNotifierProvider<DataOpsNotifier, AsyncValue<String?>>((ref) {
  return DataOpsNotifier(ref.watch(firestoreProvider));
});
