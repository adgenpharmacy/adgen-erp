import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../shared/models/user_model.dart';
import '../../shared/models/attendance_model.dart';
import '../utils/constants.dart';
import 'auth_provider.dart';

// ─── All Users (for admin) ────────────────────────────────────────────────────
final allUsersProvider = StreamProvider<List<UserModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colUsers)
      .snapshots()
      .map((snap) {
        final users = snap.docs.map((d) => UserModel.fromFirestore(d)).toList();
        users.sort((a, b) => a.name.compareTo(b.name));
        return users;
      });
});

// ─── Pending Users ────────────────────────────────────────────────────────────
final pendingUsersProvider = Provider<AsyncValue<List<UserModel>>>((ref) {
  final users = ref.watch(allUsersProvider);
  return users.when(
    data: (list) => AsyncValue.data(list.where((u) => u.isPending).toList()),
    loading: () => const AsyncValue.loading(),
    error: (e, s) => AsyncValue.error(e, s),
  );
});

// ─── Attendance for a specific date (all employees) ──────────────────────────
final attendanceByDateProvider =
    StreamProvider.family<List<AttendanceModel>, String>((ref, date) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colAttendance)
      .where('date', isEqualTo: date)
      .snapshots()
      .map((snap) => snap.docs.map((d) => AttendanceModel.fromFirestore(d)).toList());
});

// ─── Attendance for a specific user (history) ────────────────────────────────
final attendanceByUserProvider =
    StreamProvider.family<List<AttendanceModel>, String>((ref, uid) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colAttendance)
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map((snap) {
        final list = snap.docs.map((d) => AttendanceModel.fromFirestore(d)).toList();
        list.sort((a, b) => b.loginTime.compareTo(a.loginTime));
        return list;
      });
});

// ─── Today's attendance ───────────────────────────────────────────────────────
String _todayDate() {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}

final todayAttendanceProvider = StreamProvider<List<AttendanceModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colAttendance)
      .where('date', isEqualTo: _todayDate())
      .snapshots()
      .map((snap) => snap.docs.map((d) => AttendanceModel.fromFirestore(d)).toList());
});

final allAttendanceProvider = StreamProvider<List<AttendanceModel>>((ref) {
  return FirebaseFirestore.instance
      .collection(AppConstants.colAttendance)
      .orderBy('loginTime', descending: true)
      .limit(500)
      .snapshots()
      .map((snap) => snap.docs.map((d) => AttendanceModel.fromFirestore(d)).toList());
});

// ─── Admin Actions Notifier ───────────────────────────────────────────────────
class AdminNotifier extends StateNotifier<AsyncValue<void>> {
  final FirebaseFirestore _db;

  AdminNotifier(this._db) : super(const AsyncValue.data(null));

  /// Approve a pending user — sets status to active
  Future<String?> approveUser(String uid) async {
    try {
      await _db.collection(AppConstants.colUsers).doc(uid).update({
        'status': UserStatus.active.name,
        'isActive': true,
      });
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Reject and delete a pending user registration
  Future<String?> rejectUser(String uid) async {
    try {
      await _db.collection(AppConstants.colUsers).doc(uid).update({
        'status': UserStatus.inactive.name,
        'isActive': false,
      });
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Update a user's profile details
  Future<String?> updateUser(UserModel user) async {
    try {
      await _db
          .collection(AppConstants.colUsers)
          .doc(user.uid)
          .update(user.toFirestore());
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Toggle a user's active status (activate / deactivate)
  Future<String?> toggleUserActive(String uid, bool isActive) async {
    try {
      await _db.collection(AppConstants.colUsers).doc(uid).update({
        'isActive': isActive,
        'status': isActive ? UserStatus.active.name : UserStatus.inactive.name,
      });
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// Create an employee account directly (owner creates on behalf)
  Future<String?> createEmployee({
    required String uid,
    required String name,
    required String email,
    String phone = '',
    String designation = '',
  }) async {
    try {
      final user = UserModel(
        uid: uid,
        name: name,
        email: email,
        phone: phone,
        designation: designation,
        role: UserRole.employee,
        status: UserStatus.active,
        createdAt: DateTime.now(),
      );
      await _db
          .collection(AppConstants.colUsers)
          .doc(uid)
          .set(user.toFirestore());
      return null;
    } catch (e) {
      return e.toString();
    }
  }
}

final adminNotifierProvider =
    StateNotifierProvider<AdminNotifier, AsyncValue<void>>((ref) {
  return AdminNotifier(ref.watch(firestoreProvider));
});
