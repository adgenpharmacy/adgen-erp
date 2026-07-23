import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_provider.dart';

// ─── Settings doc reference ───────────────────────────────────────────────────
// Stored at: settings/app  (single document, owner-readable only via Firestore rules)

// ─── Gemini API key stream ────────────────────────────────────────────────────
final geminiApiKeyProvider = StreamProvider<String?>((ref) {
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('app')
      .snapshots()
      .map((snap) => snap.data()?['geminiApiKey'] as String?);
});

// ─── Full settings stream ─────────────────────────────────────────────────────
final appSettingsProvider = StreamProvider<Map<String, dynamic>>((ref) {
  return FirebaseFirestore.instance
      .collection('settings')
      .doc('app')
      .snapshots()
      .map((snap) => snap.data() ?? {});
});

// ─── Settings Notifier ────────────────────────────────────────────────────────
class SettingsNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  SettingsNotifier(this._db) : super(const AsyncValue.data(null));

  Future<String?> updateGeminiApiKey(String key) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection('settings').doc('app').set(
        {'geminiApiKey': key.trim()},
        SetOptions(merge: true),
      );
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateSetting(String key, dynamic value) async {
    try {
      await _db.collection('settings').doc('app').set(
        {key: value},
        SetOptions(merge: true),
      );
      return null;
    } catch (e) {
      return e.toString();
    }
  }
}

final settingsNotifierProvider =
    StateNotifierProvider<SettingsNotifier, AsyncValue<void>>((ref) {
  return SettingsNotifier(ref.watch(firestoreProvider));
});
