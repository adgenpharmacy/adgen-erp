import 'package:flutter_test/flutter_test.dart';
import 'package:adgen_pharmacy_erp/shared/models/product_model.dart';
import 'package:adgen_pharmacy_erp/shared/models/purchase_bill_model.dart';
import 'package:adgen_pharmacy_erp/shared/models/sales_bill_model.dart';

import 'package:adgen_pharmacy_erp/shared/models/inventory_batch_model.dart';
import 'package:adgen_pharmacy_erp/shared/models/user_model.dart';
import 'package:adgen_pharmacy_erp/core/utils/formatters.dart';

void main() {
  group('ProductModel Tests', () {
    test('Should parse product correctly with pack configuration', () {
      final product = ProductModel(
        id: 'p1',
        name: 'Dolo 650',
        hsnCode: '300490',
        gstPercent: 12.0,
        productType: ProductType.tablet,
        division: ProductDivision.general,
        packSize: 15, // 15 tablets in a strip
        packUnit: 'Strip',
        contentUnit: 'Tablet',
        createdAt: DateTime.now(),
      );

      // Verify pack configuration (MRP is per-purchase, not on product)
      expect(product.packSize, equals(15));
      expect(product.packUnit, equals('Strip'));
      expect(product.contentUnit, equals('Tablet'));
      expect(product.gstPercent, equals(12.0));
      expect(product.productType.hasPack, isTrue);
    });
  });

  group('Inventory & Batch Tests', () {
    test('FEFO (First Expiry First Out) Selection Logic', () {
      final today = DateTime.now();
      final batchA = InventoryBatch(
        batchNumber: 'BATCH-A',
        expiryDate: today.add(const Duration(days: 200)), // Expiring in 200 days
        quantity: 10,
        mrp: 100,
        purchaseRate: 80,
        purchaseDate: today,
      );
      final batchB = InventoryBatch(
        batchNumber: 'BATCH-B',
        expiryDate: today.add(const Duration(days: 50)), // Expiring in 50 days (earliest)
        quantity: 5,
        mrp: 100,
        purchaseRate: 80,
        purchaseDate: today,
      );
      final batchC = InventoryBatch(
        batchNumber: 'BATCH-C',
        expiryDate: today.subtract(const Duration(days: 10)), // Already expired
        quantity: 15,
        mrp: 100,
        purchaseRate: 80,
        purchaseDate: today,
      );

      final inventory = InventoryModel(
        productId: 'prod1',
        productName: 'Test Product',
        batches: [batchA, batchB, batchC],
        systemStock: 30,
        physicalStock: 30,
        lowStockThreshold: 10,
        lastUpdated: today,
      );

      // Expired batches should not be returned for dispensing
      expect(inventory.expiredBatches.length, equals(1));
      expect(inventory.expiredBatches.first.batchNumber, equals('BATCH-C'));

      // Expiring soon batches check (batchB is within 90 days)
      expect(inventory.expiringSoonBatches.length, equals(1));
      expect(inventory.expiringSoonBatches.first.batchNumber, equals('BATCH-B'));

      // nextToDispense must pick BATCH-B because it expires earliest among non-expired batches
      final nextDispense = inventory.nextToDispense;
      expect(nextDispense, isNotNull);
      expect(nextDispense!.batchNumber, equals('BATCH-B'));
    });

    test('Inventory Low Stock & Out of Stock Logic', () {
      final today = DateTime.now();
      
      final emptyInventory = InventoryModel(
        productId: 'prod2',
        productName: 'Empty product',
        batches: const [],
        systemStock: 0,
        physicalStock: 0,
        lowStockThreshold: 10,
        lastUpdated: today,
      );
      expect(emptyInventory.isOutOfStock, isTrue);
      expect(emptyInventory.isLowStock, isFalse);

      final lowStockInventory = InventoryModel(
        productId: 'prod3',
        productName: 'Low stock product',
        batches: const [],
        systemStock: 5,
        physicalStock: 5,
        lowStockThreshold: 10,
        lastUpdated: today,
      );
      expect(lowStockInventory.isOutOfStock, isFalse);
      expect(lowStockInventory.isLowStock, isTrue);

      final normalInventory = InventoryModel(
        productId: 'prod4',
        productName: 'Good stock product',
        batches: const [],
        systemStock: 25,
        physicalStock: 25,
        lowStockThreshold: 10,
        lastUpdated: today,
      );
      expect(normalInventory.isOutOfStock, isFalse);
      expect(normalInventory.isLowStock, isFalse);
    });
  });

  group('Purchase Bills Calculations', () {
    test('Conversion from pack quantity to tablet units', () {
      final item = PurchaseItem(
        productId: 'p_calpol',
        productName: 'Calpol 500',
        hsnCode: '3004',
        batchNumber: 'B-CP1',
        expiryDate: DateTime.now().add(const Duration(days: 300)),
        quantity: 8, // 8 strips purchased
        freeQuantity: 2, // 2 free strips
        packSize: 10, // 10 tablets per strip
        rate: 60.0, // ₹60 per strip
        mrp: 75.0, // ₹75 per strip
        gstPercent: 12.0,
      );

      // (8 purchased + 2 free) * 10 = 100 tablets total
      expect(item.totalContentQty, equals(100.0));
      // Taxable amount should only apply to paid items: 8 * ₹60 = ₹480
      expect(item.taxableAmount, equals(480.0));
      // GST: ₹480 * 12% = ₹57.6
      expect(item.gstAmount, equals(57.6));
      // Line Total: ₹480 + ₹57.6 = ₹537.6
      expect(item.lineTotal, equals(537.6));
    });

    test('Purchase Bill aggregations', () {
      final today = DateTime.now();
      final item1 = PurchaseItem(
        productId: 'p1',
        productName: 'Item 1',
        hsnCode: '3004',
        batchNumber: 'B1',
        expiryDate: today.add(const Duration(days: 100)),
        quantity: 5,
        rate: 100.0, // ₹500 taxable
        mrp: 120.0,
        gstPercent: 18.0, // ₹90 GST
      );
      final item2 = PurchaseItem(
        productId: 'p2',
        productName: 'Item 2',
        hsnCode: '3004',
        batchNumber: 'B2',
        expiryDate: today.add(const Duration(days: 100)),
        quantity: 2,
        rate: 50.0, // ₹100 taxable
        mrp: 60.0,
        gstPercent: 12.0, // ₹12 GST
      );

      final bill = PurchaseBillModel(
        id: 'bill1',
        invoiceNumber: 'PUR/2026/001',
        invoiceDate: today,
        partyId: 'party1',
        partyName: 'ABC Pharma',
        items: [item1, item2],
        subtotal: 600.0, // ₹500 + ₹100
        totalDiscount: 0.0,
        totalGst: 102.0, // ₹90 + ₹12
        grandTotal: 702.0,
        ledgerType: LedgerType.cash,
        createdAt: today,
        createdByUid: 'user1',
        createdByName: 'Staff 1',
      );

      expect(bill.items.length, equals(2));
      expect(bill.grandTotal, equals(702.0));
      expect(bill.subtotal, equals(600.0));
      expect(bill.totalGst, equals(102.0));
    });
  });

  group('Sales Bills Calculations', () {
    test('Sales Item discount and tax calculations', () {
      final item = SalesItem(
        productId: 'p1',
        productName: 'Product 1',
        batchNumber: 'B1',
        expiryDate: DateTime.now().add(const Duration(days: 100)),
        mrp: 15.0,
        rate: 10.0,
        gstPercent: 5.0,
        quantity: 20, // 20 units sold
        packQuantity: 2,
        packSize: 10,
        discountPercent: 10.0, // 10% discount on ₹200 rate = ₹20
      );

      expect(item.discountAmount, equals(20.0));
      expect(item.taxableAmount, equals(180.0)); // ₹200 - ₹20
      expect(item.gstAmount, equals(9.0)); // ₹180 * 5%
      expect(item.lineTotal, equals(189.0));
    });

    test('Outstanding credit calculation', () {
      final today = DateTime.now();
      final bill = SalesBillModel(
        id: 'sb1',
        invoiceNumber: 'INV/2026/001',
        customerName: 'Astitva',
        saleDate: today,
        createdAt: today,
        createdByUid: 'user1',
        createdByName: 'Staff 1',
        paymentMethod: PaymentMethod.credit,
        items: const [],
        subtotal: 100.0,
        totalDiscount: 0.0,
        totalGst: 18.0,
        grandTotal: 118.0,
        isCreditPaid: false,
      );

      // If credit has not been paid yet
      expect(bill.hasOutstandingCredit, isTrue);

      final paidBill = SalesBillModel(
        id: 'sb2',
        invoiceNumber: 'INV/2026/002',
        customerName: 'Astitva',
        saleDate: today,
        createdAt: today,
        createdByUid: 'user1',
        createdByName: 'Staff 1',
        paymentMethod: PaymentMethod.credit,
        items: const [],
        subtotal: 100.0,
        totalDiscount: 0.0,
        totalGst: 18.0,
        grandTotal: 118.0,
        isCreditPaid: true,
      );

      // If marked paid, outstanding credit should be false
      expect(paidBill.hasOutstandingCredit, isFalse);
    });
  });

  group('UserModel Permissions', () {
    test('Owner permissions mapping', () {
      final owner = UserModel(
        uid: 'owner1',
        name: 'Admin Owner',
        email: 'owner@erp.com',
        role: UserRole.owner,
        status: UserStatus.active,
        createdAt: DateTime.now(),
      );

      expect(owner.isOwner, isTrue);
      expect(owner.canDeleteRecords, isTrue);
      expect(owner.canCorrectStock, isTrue);
      expect(owner.canManageUsers, isTrue);
    });

    test('Employee permissions mapping', () {
      final employee = UserModel(
        uid: 'emp1',
        name: 'Staff Employee',
        email: 'emp@erp.com',
        role: UserRole.employee,
        status: UserStatus.active,
        createdAt: DateTime.now(),
      );

      expect(employee.isOwner, isFalse);
      expect(employee.isEmployee, isTrue);
      expect(employee.canDeleteRecords, isFalse);
      expect(employee.canCorrectStock, isFalse);
      expect(employee.canManageUsers, isFalse);
    });
  });

  group('AppFormatters Utility Tests', () {
    test('Generate Invoice Numbers sequentially', () {
      final invoice = AppFormatters.generateInvoiceNumber('ADG', 5);
      final year = DateTime.now().year.toString().substring(2);
      final month = DateTime.now().month.toString().padLeft(2, '0');
      
      expect(invoice, equals('ADG/$year$month/0005'));
    });

    test('Indian Phone Number formatting', () {
      expect(AppFormatters.formatPhone('9876543210'), equals('+91 98765 43210'));
      expect(AppFormatters.formatPhone('+919876543210'), equals('+919876543210'));
    });

    test('Expiry duration status string calculation', () {
      final today = DateTime.now();
      
      final expired = today.subtract(const Duration(days: 5));
      expect(AppFormatters.expiryStatus(expired), equals('Expired'));

      final expiresToday = today;
      expect(AppFormatters.expiryStatus(expiresToday), equals('Expires Today'));

      final expiring15Days = today.add(const Duration(days: 15));
      expect(AppFormatters.expiryStatus(expiring15Days), contains('Exp. in'));
    });
  });
}
