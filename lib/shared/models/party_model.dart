import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

class PartyModel extends Equatable {
  final String? id;
  final String name;
  final String? gstNumber;
  final String? drugLicenseNo;
  final String address;
  final String phone;
  final String? email;
  final String? contactPerson;
  final double creditLimit;
  final double outstandingBalance;
  final DateTime createdAt;
  final bool isActive;

  const PartyModel({
    this.id,
    required this.name,
    this.gstNumber,
    this.drugLicenseNo,
    required this.address,
    required this.phone,
    this.email,
    this.contactPerson,
    this.creditLimit = 0,
    this.outstandingBalance = 0,
    required this.createdAt,
    this.isActive = true,
  });

  factory PartyModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return PartyModel(
      id: doc.id,
      name: data['name'] ?? '',
      gstNumber: data['gstNumber'],
      drugLicenseNo: data['drugLicenseNo'],
      address: data['address'] ?? '',
      phone: data['phone'] ?? '',
      email: data['email'],
      contactPerson: data['contactPerson'],
      creditLimit: (data['creditLimit'] ?? 0).toDouble(),
      outstandingBalance: (data['outstandingBalance'] ?? 0).toDouble(),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      isActive: data['isActive'] ?? true,
    );
  }

  Map<String, dynamic> toFirestore() => {
        'name': name,
        'nameLower': name.toLowerCase(),
        'gstNumber': gstNumber,
        'drugLicenseNo': drugLicenseNo,
        'address': address,
        'phone': phone,
        'email': email,
        'contactPerson': contactPerson,
        'creditLimit': creditLimit,
        'outstandingBalance': outstandingBalance,
        'createdAt': Timestamp.fromDate(createdAt),
        'isActive': isActive,
      };

  PartyModel copyWith({
    String? name,
    String? gstNumber,
    String? drugLicenseNo,
    String? address,
    String? phone,
    String? email,
    String? contactPerson,
    double? creditLimit,
    double? outstandingBalance,
    bool? isActive,
  }) {
    return PartyModel(
      id: id,
      name: name ?? this.name,
      gstNumber: gstNumber ?? this.gstNumber,
      drugLicenseNo: drugLicenseNo ?? this.drugLicenseNo,
      address: address ?? this.address,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      contactPerson: contactPerson ?? this.contactPerson,
      creditLimit: creditLimit ?? this.creditLimit,
      outstandingBalance: outstandingBalance ?? this.outstandingBalance,
      createdAt: createdAt,
      isActive: isActive ?? this.isActive,
    );
  }

  @override
  List<Object?> get props => [id, name, phone];
}
