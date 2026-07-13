import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

class AttendanceModel extends Equatable {
  final String? id;
  final String uid;
  final String userName;
  final DateTime loginTime;
  final DateTime? logoutTime;
  final String date; // 'YYYY-MM-DD' for easy querying

  const AttendanceModel({
    this.id,
    required this.uid,
    required this.userName,
    required this.loginTime,
    this.logoutTime,
    required this.date,
  });

  Duration? get sessionDuration {
    if (logoutTime == null) return null;
    return logoutTime!.difference(loginTime);
  }

  String get formattedDuration {
    final dur = sessionDuration;
    if (dur == null) return 'Active';
    final h = dur.inHours;
    final m = dur.inMinutes.remainder(60);
    return '${h}h ${m}m';
  }

  factory AttendanceModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return AttendanceModel(
      id: doc.id,
      uid: data['uid'] ?? '',
      userName: data['userName'] ?? '',
      loginTime: (data['loginTime'] as Timestamp?)?.toDate() ?? DateTime.now(),
      logoutTime: (data['logoutTime'] as Timestamp?)?.toDate(),
      date: data['date'] ?? '',
    );
  }

  Map<String, dynamic> toFirestore() => {
        'uid': uid,
        'userName': userName,
        'loginTime': Timestamp.fromDate(loginTime),
        'logoutTime': logoutTime != null ? Timestamp.fromDate(logoutTime!) : null,
        'date': date,
      };

  @override
  List<Object?> get props => [id, uid, loginTime];
}
