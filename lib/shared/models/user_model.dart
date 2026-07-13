import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum UserRole { owner, employee }
enum UserStatus { active, pending, inactive }

class UserModel extends Equatable {
  final String uid;
  final String name;
  final String email;
  final String phone;
  final String designation;
  final UserRole role;
  final UserStatus status;
  final String? photoUrl;
  final DateTime createdAt;
  final bool isActive;

  const UserModel({
    required this.uid,
    required this.name,
    required this.email,
    this.phone = '',
    this.designation = '',
    required this.role,
    this.status = UserStatus.active,
    this.photoUrl,
    required this.createdAt,
    this.isActive = true,
  });

  bool get isOwner => role == UserRole.owner;
  bool get isEmployee => role == UserRole.employee;
  bool get isPending => status == UserStatus.pending;

  // Permissions — only owner has elevated access
  bool get canDeleteRecords => isOwner;
  bool get canCorrectStock => isOwner;
  bool get canViewFullReports => isOwner;
  bool get canModifyAccounts => isOwner;
  bool get canAccessBackup => isOwner;
  bool get canManageUsers => isOwner;

  factory UserModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UserModel(
      uid: doc.id,
      name: data['name'] ?? '',
      email: data['email'] ?? '',
      phone: data['phone'] ?? '',
      designation: data['designation'] ?? '',
      role: data['role'] == 'owner' ? UserRole.owner : UserRole.employee,
      status: _parseStatus(data['status']),
      photoUrl: data['photoUrl'],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isActive: data['isActive'] ?? true,
    );
  }

  static UserStatus _parseStatus(dynamic value) {
    switch (value) {
      case 'pending':  return UserStatus.pending;
      case 'inactive': return UserStatus.inactive;
      default:         return UserStatus.active;
    }
  }

  Map<String, dynamic> toFirestore() => {
        'name': name,
        'email': email,
        'phone': phone,
        'designation': designation,
        'role': role.name,
        'status': status.name,
        'photoUrl': photoUrl,
        'createdAt': Timestamp.fromDate(createdAt),
        'isActive': isActive,
      };

  UserModel copyWith({
    String? name,
    String? email,
    String? phone,
    String? designation,
    UserRole? role,
    UserStatus? status,
    String? photoUrl,
    bool? isActive,
  }) {
    return UserModel(
      uid: uid,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      designation: designation ?? this.designation,
      role: role ?? this.role,
      status: status ?? this.status,
      photoUrl: photoUrl ?? this.photoUrl,
      createdAt: createdAt,
      isActive: isActive ?? this.isActive,
    );
  }

  @override
  List<Object?> get props => [uid, name, email, role, status, isActive];
}
