import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum LedgerEntryType { debit, credit }

class LedgerModel extends Equatable {
  final String? id;
  final String partyId;
  final String partyName;
  final LedgerEntryType type;
  final double amount;
  final String description;
  final String? billId;
  final String? billNumber;
  final DateTime date;
  final String createdByUid;
  final String createdByName;
  final double runningBalance;
  final bool isSettled;
  final DateTime? settledAt;

  const LedgerModel({
    this.id,
    required this.partyId,
    required this.partyName,
    required this.type,
    required this.amount,
    required this.description,
    this.billId,
    this.billNumber,
    required this.date,
    required this.createdByUid,
    required this.createdByName,
    this.runningBalance = 0,
    this.isSettled = false,
    this.settledAt,
  });

  factory LedgerModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return LedgerModel(
      id: doc.id,
      partyId: data['partyId'] ?? '',
      partyName: data['partyName'] ?? '',
      type: data['type'] == 'debit' ? LedgerEntryType.debit : LedgerEntryType.credit,
      amount: (data['amount'] ?? 0).toDouble(),
      description: data['description'] ?? '',
      billId: data['billId'],
      billNumber: data['billNumber'],
      date: (data['date'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdByUid: data['createdByUid'] ?? '',
      createdByName: data['createdByName'] ?? '',
      runningBalance: (data['runningBalance'] ?? 0).toDouble(),
      isSettled: data['isSettled'] ?? false,
      settledAt: (data['settledAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toFirestore() => {
        'partyId': partyId,
        'partyName': partyName,
        'type': type.name,
        'amount': amount,
        'description': description,
        'billId': billId,
        'billNumber': billNumber,
        'date': Timestamp.fromDate(date),
        'createdByUid': createdByUid,
        'createdByName': createdByName,
        'runningBalance': runningBalance,
        'isSettled': isSettled,
        'settledAt': settledAt != null ? Timestamp.fromDate(settledAt!) : null,
      };

  @override
  List<Object?> get props => [id, partyId, amount, date];
}
