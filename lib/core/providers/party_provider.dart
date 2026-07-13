import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/party_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

// ─── Party List (client-side filter — no index needed) ──────────────────────────
final partiesProvider = StreamProvider<List<PartyModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colParties)
      .snapshots()
      .map((snap) {
        final all = snap.docs.map((d) => PartyModel.fromFirestore(d)).toList();
        final active = all.where((p) => p.isActive).toList();
        active.sort((a, b) => a.name.compareTo(b.name));
        return active;
      });
});

// ─── Party Search (client-side — no index needed) ─────────────────────────────
final partySearchProvider =
    Provider.family<List<PartyModel>, String>((ref, query) {
  final allParties = ref.watch(partiesProvider);
  if (query.isEmpty) return [];
  final lowerQuery = query.toLowerCase();
  return allParties.valueOrNull
          ?.where((p) =>
              p.isActive &&
              (p.name.toLowerCase().contains(lowerQuery) ||
               p.phone.contains(lowerQuery) ||
               (p.email?.toLowerCase().contains(lowerQuery) ?? false) ||
               p.address.toLowerCase().contains(lowerQuery)))
          .toList() ??
      [];
});

// ─── Party CRUD Notifier ─────────────────────────────────────────────────────
class PartyNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  PartyNotifier(this._db) : super(const AsyncValue.data(null));

  Future<String?> addParty(PartyModel party) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colParties).add(party.toFirestore());
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> updateParty(String id, PartyModel party) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colParties).doc(id).update(party.toFirestore());
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }

  Future<String?> deleteParty(String id) async {
    try {
      state = const AsyncValue.loading();
      await _db.collection(AppConstants.colParties).doc(id).update({'isActive': false});
      state = const AsyncValue.data(null);
      return null;
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      return e.toString();
    }
  }
}

final partyNotifierProvider =
    StateNotifierProvider<PartyNotifier, AsyncValue<void>>((ref) {
  return PartyNotifier(ref.watch(firestoreProvider));
});
