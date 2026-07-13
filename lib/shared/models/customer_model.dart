import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

class CustomerModel extends Equatable {
  final String? id;
  final String name;
  final String phone;
  final String? email;
  final String? address;
  final String? doctorName;
  final double creditBalance;
  final DateTime createdAt;
  final bool isActive;

  const CustomerModel({
    this.id,
    required this.name,
    required this.phone,
    this.email,
    this.address,
    this.doctorName,
    this.creditBalance = 0,
    required this.createdAt,
    this.isActive = true,
  });

  factory CustomerModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return CustomerModel(
      id: doc.id,
      name: data['name'] ?? '',
      phone: data['phone'] ?? '',
      email: data['email'],
      address: data['address'],
      doctorName: data['doctorName'],
      creditBalance: (data['creditBalance'] ?? 0).toDouble(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isActive: data['isActive'] ?? true,
    );
  }

  Map<String, dynamic> toFirestore() => {
        'name': name,
        'nameLower': name.toLowerCase(),
        'phone': phone,
        'email': email,
        'address': address,
        'doctorName': doctorName,
        'creditBalance': creditBalance,
        'createdAt': Timestamp.fromDate(createdAt),
        'isActive': isActive,
      };

  CustomerModel copyWith({
    String? name,
    String? phone,
    String? email,
    String? address,
    String? doctorName,
    double? creditBalance,
    bool? isActive,
  }) {
    return CustomerModel(
      id: id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      address: address ?? this.address,
      doctorName: doctorName ?? this.doctorName,
      creditBalance: creditBalance ?? this.creditBalance,
      createdAt: createdAt,
      isActive: isActive ?? this.isActive,
    );
  }

  @override
  List<Object?> get props => [id, name, phone];
}
