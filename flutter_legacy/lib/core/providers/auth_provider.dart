import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../shared/models/user_model.dart';
import '../../shared/models/attendance_model.dart';
import '../utils/constants.dart';

// ─── Firebase Providers ───────────────────────────────────────────────────────
final firebaseAuthProvider = Provider<FirebaseAuth>((ref) => FirebaseAuth.instance);
final firestoreProvider = Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

// ─── Current User Model (stream) ─────────────────────────────────────────────
final currentUserProvider = StreamProvider<UserModel?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) {
      if (user == null) return Stream.value(null);
      return FirebaseFirestore.instance
          .collection(AppConstants.colUsers)
          .doc(user.uid)
          .snapshots()
          .map((snap) => snap.exists ? UserModel.fromFirestore(snap) : null);
    },
    loading: () => Stream.value(null),
    error: (_, __) => Stream.value(null),
  );
});

// ─── Auth Notifier ────────────────────────────────────────────────────────────
class AuthNotifier extends StateNotifier<AsyncValue<UserModel?>> {
  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  AuthNotifier(this._auth, this._firestore) : super(const AsyncValue.loading()) {
    _auth.authStateChanges().listen((user) async {
      if (user == null) {
        state = const AsyncValue.data(null);
      } else {
        await _loadUser(user.uid);
      }
    });
  }

  Future<void> _loadUser(String uid) async {
    try {
      final doc = await _firestore.collection(AppConstants.colUsers).doc(uid).get();
      if (doc.exists) {
        final user = UserModel.fromFirestore(doc);
        state = AsyncValue.data(user);
      } else {
        state = const AsyncValue.data(null);
      }
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  Future<String?> signIn(String email, String password) async {
    try {
      state = const AsyncValue.loading();
      final credential = await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password.trim(),
      );
      await _loadUser(credential.user!.uid);

      // Check if user is pending approval
      final currentUser = state.value;
      if (currentUser != null && currentUser.isPending) {
        // Sign them out — they need approval first
        await _auth.signOut();
        state = const AsyncValue.data(null);
        return 'pending_approval'; // special signal to UI
      }

      // Record attendance (only for approved users)
      if (state.value != null) {
        await _recordAttendance(credential.user!.uid);
      }

      return null; // success
    } on FirebaseAuthException catch (e) {
      state = const AsyncValue.data(null);
      switch (e.code) {
        case 'user-not-found':
          return 'No account found with this email';
        case 'wrong-password':
          return 'Incorrect password';
        case 'invalid-credential':
          return 'Invalid email or password';
        case 'too-many-requests':
          return 'Too many attempts. Try again later.';
        default:
          return e.message ?? 'Login failed';
      }
    } catch (e) {
      state = const AsyncValue.data(null);
      return 'Login failed: ${e.toString()}';
    }
  }

  /// Register a new employee — account is pending until owner approves
  Future<String?> signUp({
    required String name,
    required String email,
    required String password,
    String phone = '',
    String designation = '',
  }) async {
    try {
      // Create Firebase Auth account
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password.trim(),
      );

      // Create Firestore user doc with pending status
      final user = UserModel(
        uid: credential.user!.uid,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        role: UserRole.employee, // new signups are always employees
        status: UserStatus.pending, // needs owner approval
        createdAt: DateTime.now(),
      );

      await _firestore
          .collection(AppConstants.colUsers)
          .doc(credential.user!.uid)
          .set(user.toFirestore());

      // Sign out immediately — they can't use the app until approved
      await _auth.signOut();
      state = const AsyncValue.data(null);

      return null; // success (show "awaiting approval" message)
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'email-already-in-use':
          return 'An account with this email already exists';
        case 'weak-password':
          return 'Password must be at least 6 characters';
        case 'invalid-email':
          return 'Invalid email address';
        default:
          return e.message ?? 'Registration failed';
      }
    } catch (e) {
      return 'Registration failed: ${e.toString()}';
    }
  }

  Future<void> signOut() async {
    try {
      final uid = _auth.currentUser?.uid;
      if (uid != null) {
        await _recordLogout(uid);
      }
      await _auth.signOut();
      state = const AsyncValue.data(null);
    } catch (_) {}
  }

  Future<void> _recordAttendance(String uid) async {
    try {
      final userDoc = await _firestore.collection(AppConstants.colUsers).doc(uid).get();
      final userName = userDoc.data()?['name'] ?? 'Unknown';
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final now = DateTime.now();

      final attendance = AttendanceModel(
        uid: uid,
        userName: userName,
        loginTime: now,
        date: today,
      );

      await _firestore
          .collection(AppConstants.colAttendance)
          .doc('${uid}_${today}_${now.millisecondsSinceEpoch}')
          .set(attendance.toFirestore());
    } catch (_) {}
  }

  Future<void> _recordLogout(String uid) async {
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final query = await _firestore
          .collection(AppConstants.colAttendance)
          .where('uid', isEqualTo: uid)
          .where('date', isEqualTo: today)
          .get();

      if (query.docs.isNotEmpty) {
        final sorted = query.docs.toList()
          ..sort((a, b) {
            final aTime = (a.data()['loginTime'] as Timestamp?)?.toDate() ?? DateTime(2000);
            final bTime = (b.data()['loginTime'] as Timestamp?)?.toDate() ?? DateTime(2000);
            return bTime.compareTo(aTime);
          });
        final doc = sorted.first;
        if (doc.data()['logoutTime'] == null) {
          await doc.reference.update({
            'logoutTime': Timestamp.fromDate(DateTime.now()),
          });
        }
      }
    } catch (_) {}
  }

  Future<void> clockIn() async {
    final user = state.value;
    if (user == null) return;
    await _recordAttendance(user.uid);
  }

  Future<void> clockOut() async {
    final user = state.value;
    if (user == null) return;
    await _recordLogout(user.uid);
  }
}

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<UserModel?>>((ref) {
  return AuthNotifier(
    ref.watch(firebaseAuthProvider),
    ref.watch(firestoreProvider),
  );
});

final myTodayAttendanceProvider = StreamProvider<AttendanceModel?>((ref) {
  final user = ref.watch(authNotifierProvider).value;
  if (user == null) return const Stream.empty();
  
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final firestore = ref.watch(firestoreProvider);
  
  return firestore
      .collection(AppConstants.colAttendance)
      .where('uid', isEqualTo: user.uid)
      .where('date', isEqualTo: today)
      .snapshots()
      .map((snap) {
        if (snap.docs.isEmpty) return null;
        final sorted = snap.docs.toList()
          ..sort((a, b) {
            final aTime = (a.data()['loginTime'] as Timestamp?)?.toDate() ?? DateTime(2000);
            final bTime = (b.data()['loginTime'] as Timestamp?)?.toDate() ?? DateTime(2000);
            return bTime.compareTo(aTime);
          });
        return AttendanceModel.fromFirestore(sorted.first);
      });
});
