import 'dart:convert';
import 'dart:io';
import 'package:archive/archive_io.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:csv/csv.dart';
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
      final file = File('${dir.path}/${collectionName}_export.json');
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

  Future<void> syncAllLegacyData() async {
    try {
      state = const AsyncValue.loading();
      int updatedCount = 0;

      // 1. Load masters
      final customersSnap = await _db.collection(AppConstants.colCustomers).get();
      final partiesSnap = await _db.collection(AppConstants.colParties).get();
      final productsSnap = await _db.collection(AppConstants.colProducts).get();

      final customerMap = {for (var doc in customersSnap.docs) doc.id: doc.data()};
      final partyMap = {for (var doc in partiesSnap.docs) doc.id: doc.data()};
      final productMap = {for (var doc in productsSnap.docs) doc.id: doc.data()};

      WriteBatch batch = _db.batch();
      int opCount = 0;

      // 2. Sync Inventory
      final inventorySnap = await _db.collection(AppConstants.colInventory).get();
      for (var doc in inventorySnap.docs) {
        final data = doc.data();
        final productId = data['productId'] as String?;
        if (productId != null && productMap.containsKey(productId)) {
          final prodData = productMap[productId]!;
          final prodName = prodData['name'] ?? '';
          final prodThresh = (prodData['lowStockThreshold'] ?? 1.0).toDouble();
          
          if (data['productName'] != prodName || data['lowStockThreshold'] != prodThresh) {
            batch.update(doc.reference, {
              'productName': prodName,
              'productNameLower': prodName.toLowerCase(),
              'lowStockThreshold': prodThresh,
            });
            opCount++;
            updatedCount++;
            if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
          }
        }
      }

      // 3. Sync Sales Bills & compute Customer Balances
      final salesSnap = await _db.collection(AppConstants.colSalesBills).get();
      Map<String, double> customerCredits = {}; 
      
      for (var doc in salesSnap.docs) {
        final data = doc.data();
        final customerId = data['customerId'] as String?;
        if (customerId != null && customerMap.containsKey(customerId)) {
          final custData = customerMap[customerId]!;
          final custName = custData['name'] ?? '';
          
          if (data['customerName'] != custName) {
            batch.update(doc.reference, {'customerName': custName});
            opCount++;
            updatedCount++;
            if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
          }

          if (data['paymentMethod']?.toString().toLowerCase() == 'credit') {
            final grandTotal = (data['grandTotal'] ?? 0).toDouble();
            final amountPaid = (data['amountPaid'] ?? 0).toDouble();
            customerCredits[customerId] = (customerCredits[customerId] ?? 0.0) + (grandTotal - amountPaid);
          }
        }
      }

      // 4. Sync Purchase Bills & compute Party Balances
      final purchaseSnap = await _db.collection(AppConstants.colPurchaseBills).get();
      Map<String, double> partyCredits = {};
      for (var doc in purchaseSnap.docs) {
        final data = doc.data();
        final partyId = data['partyId'] as String?;
        if (partyId != null && partyMap.containsKey(partyId)) {
          final pData = partyMap[partyId]!;
          final pName = pData['name'] ?? '';
          
          if (data['partyName'] != pName) {
            batch.update(doc.reference, {'partyName': pName});
            opCount++;
            updatedCount++;
            if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
          }

          if (data['isPaid'] == false) {
            final grandTotal = (data['grandTotal'] ?? 0).toDouble();
            partyCredits[partyId] = (partyCredits[partyId] ?? 0.0) + grandTotal;
          }
        }
      }

      // 5. Sync Ledger
      final ledgerSnap = await _db.collection(AppConstants.colLedger).get();
      for (var doc in ledgerSnap.docs) {
        final data = doc.data();
        final partyId = data['partyId'] as String?;
        final type = data['type'] as String?; 
        
        if (partyId != null) {
          String? newName;
          if (type == 'credit' && customerMap.containsKey(partyId)) {
            newName = customerMap[partyId]!['name'];
          } else if (type == 'debit' && partyMap.containsKey(partyId)) {
            newName = partyMap[partyId]!['name'];
          }

          if (newName != null && data['partyName'] != newName) {
            batch.update(doc.reference, {'partyName': newName});
            opCount++;
            updatedCount++;
            if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
          }
        }
      }

      // 6. Update Master Balances
      for (final entry in customerMap.entries) {
        final currentBal = (entry.value['creditBalance'] ?? 0).toDouble();
        final correctBal = customerCredits[entry.key] ?? 0.0;
        if ((currentBal - correctBal).abs() > 0.01) {
          batch.update(_db.collection(AppConstants.colCustomers).doc(entry.key), {
            'creditBalance': correctBal
          });
          opCount++;
          updatedCount++;
          if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
        }
      }

      for (final entry in partyMap.entries) {
        final currentBal = (entry.value['outstandingBalance'] ?? 0).toDouble();
        final correctBal = partyCredits[entry.key] ?? 0.0;
        if ((currentBal - correctBal).abs() > 0.01) {
          batch.update(_db.collection(AppConstants.colParties).doc(entry.key), {
            'outstandingBalance': correctBal
          });
          opCount++;
          updatedCount++;
          if (opCount >= 400) { await batch.commit(); batch = _db.batch(); opCount = 0; }
        }
      }

      if (opCount > 0) await batch.commit();

      state = AsyncValue.data("Data Sync Complete! $updatedCount corrupted records were fixed.");
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  // ── Export All Data as ZIP ──────────────────────────────────────────────────
  /// Fetches all Firestore collections → CSV files → ZIP → share.
  /// Human-readable AND re-importable via importFromZip().
  Future<void> exportAllAsZip() async {
    try {
      state = const AsyncValue.loading();

      // Collections to export
      final collections = [
        AppConstants.colProducts,
        AppConstants.colInventory,
        AppConstants.colParties,
        AppConstants.colCustomers,
        AppConstants.colPurchaseBills,
        AppConstants.colSalesBills,
        AppConstants.colLedger,
        AppConstants.colReturns,
        'attendance',
      ];

      final archive = Archive();

      // Metadata file
      final meta = jsonEncode({
        'exportedAt': DateTime.now().toIso8601String(),
        'version': '1.0',
        'app': 'PharmacyERP',
        'collections': collections,
      });
      archive.addFile(ArchiveFile(
          'metadata.json', meta.length, utf8.encode(meta)));

      // Custom encoder to handle nested Timestamps
      String safeJsonEncode(dynamic data) {
        return jsonEncode(data, toEncodable: (dynamic item) {
          if (item is Timestamp) {
            return item.toDate().toUtc().toIso8601String();
          }
          if (item is DateTime) {
            return item.toUtc().toIso8601String();
          }
          return item.toString();
        });
      }

      // Export each collection
      for (final col in collections) {
        try {
          final snap = await _db.collection(col).get();
          if (snap.docs.isEmpty) continue;

          // ── CSV ────────────────────────────────────────────────────
          final docs = snap.docs.map((d) {
            final data = Map<String, dynamic>.from(d.data());
            data['_id'] = d.id; // preserve doc ID
            // Convert Timestamps to ISO strings
            data.forEach((k, v) {
              if (v is Timestamp) data[k] = v.toDate().toUtc().toIso8601String();
              if (v is Map || v is List) data[k] = safeJsonEncode(v);
            });
            return data;
          }).toList();

          final headers = <String>{};
          for (final d in docs) {
            headers.addAll(d.keys);
          }
          final headerList = headers.toList();

          final rows = <List<dynamic>>[
            headerList, // header row
            ...docs.map((d) => headerList
                .map((h) => d[h] ?? '')
                .toList()),
          ];
          final csvStr = const CsvEncoder().convert(rows);
          final csvBytes = utf8.encode(csvStr);
          archive.addFile(ArchiveFile('$col.csv', csvBytes.length, csvBytes));

          // ── JSON (machine-readable, preserves all types) ──────────
          final jsonStr = safeJsonEncode({
            'collection': col,
            'count': docs.length,
            'docs': snap.docs.map((d) {
              final data = Map<String, dynamic>.from(d.data());
              data['_id'] = d.id;
              return data;
            }).toList(),
          });
          final jsonBytes = utf8.encode(jsonStr);
          archive.addFile(
              ArchiveFile('$col.json', jsonBytes.length, jsonBytes));
        } catch (e) {
          // skip collections that fail (e.g. permission denied)
          debugPrint('Export failed for $col: $e');
        }
      }

      // Encode ZIP
      final zipEncoder = ZipEncoder();
      final encoded = zipEncoder.encode(archive);
      if (encoded == null) throw Exception('Failed to encode ZIP');
      final zipBytes = Uint8List.fromList(encoded);

      if (kIsWeb) {
        // On web, trigger download via share_plus
        final xFile = XFile.fromData(zipBytes,
            name: 'pharmacy_backup_${DateTime.now().millisecondsSinceEpoch}.zip',
            mimeType: 'application/zip');
        await Share.shareXFiles([xFile],
            text: 'Pharmacy ERP — Full Backup');
      } else {
        // On mobile/desktop, save to temp dir then share
        final tmpDir = await getTemporaryDirectory();
        final timestamp =
            DateTime.now().toIso8601String().replaceAll(':', '-').substring(0, 19);
        final zipFile =
            File('${tmpDir.path}/pharmacy_backup_$timestamp.zip');
        await zipFile.writeAsBytes(zipBytes);
        await Share.shareXFiles([XFile(zipFile.path)],
            text: 'Pharmacy ERP — Full Backup ($timestamp)');
      }

      state = const AsyncValue.data('Export complete!');
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }

  // ── Import from ZIP ─────────────────────────────────────────────────────────
  /// Pick a previously exported ZIP → validate → upsert all docs back to Firestore.
  Future<void> importFromZip() async {
    try {
      state = const AsyncValue.loading();

      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['zip'],
        withData: true,
      );

      if (result == null) {
        state = const AsyncValue.data(null);
        return;
      }

      Uint8List zipBytes;
      if (kIsWeb) {
        zipBytes = result.files.single.bytes!;
      } else {
        zipBytes =
            await File(result.files.single.path!).readAsBytes();
      }

      final archive = ZipDecoder().decodeBytes(zipBytes);

      // Validate metadata
      final metaFile = archive.findFile('metadata.json');
      if (metaFile == null) {
        state = AsyncValue.error(
            'Invalid backup file — missing metadata.json', StackTrace.current);
        return;
      }
      final metaContent = metaFile.content;
      final meta = jsonDecode(utf8.decode(
          metaContent is Uint8List ? metaContent : Uint8List.fromList(metaContent as List<int>)))
          as Map<String, dynamic>;
      if (meta['app'] != 'PharmacyERP') {
        state = AsyncValue.error(
            'Not a PharmacyERP backup file.', StackTrace.current);
        return;
      }

      int totalRestored = 0;

      // Restore each JSON collection file (JSON preserves types better than CSV)
      for (final file in archive.files) {
        if (!file.name.endsWith('.json') || file.name == 'metadata.json') continue;
        final colName = file.name.replaceAll('.json', '');

        final rawContent = file.content;
        final data = jsonDecode(utf8.decode(
            rawContent is Uint8List ? rawContent : Uint8List.fromList(rawContent as List<int>)))
            as Map<String, dynamic>;
        final docs = (data['docs'] as List<dynamic>);

        if (docs.isEmpty) continue;

        // Firestore batched write (max 500 per batch)
        WriteBatch batch = _db.batch();
        int opCount = 0;

        for (final doc in docs) {
          final docMap = Map<String, dynamic>.from(doc as Map);
          final docId = docMap.remove('_id') as String?;
          if (docId == null || docId.isEmpty) continue;

          // Re-parse ISO strings back to Timestamps for known date fields
          const dateFields = [
            'createdAt', 'updatedAt', 'invoiceDate', 'expiryDate',
            'date', 'timestamp', 'paymentDate'
          ];
          for (final field in dateFields) {
            if (docMap[field] is String) {
              final dt = DateTime.tryParse(docMap[field]);
              if (dt != null) docMap[field] = Timestamp.fromDate(dt);
            }
          }

          batch.set(
            _db.collection(colName).doc(docId),
            docMap,
            SetOptions(merge: true), // safe merge — won't delete existing fields
          );
          opCount++;
          totalRestored++;

          if (opCount >= 400) {
            await batch.commit();
            batch = _db.batch();
            opCount = 0;
          }
        }
        if (opCount > 0) await batch.commit();
      }

      state = AsyncValue.data(
          'Import complete — $totalRestored records restored!');
    } catch (e, st) {
      state = AsyncValue.error(e.toString(), st);
    }
  }
}

final dataOpsNotifierProvider =
    StateNotifierProvider<DataOpsNotifier, AsyncValue<String?>>((ref) {
  return DataOpsNotifier(ref.watch(firestoreProvider));
});
