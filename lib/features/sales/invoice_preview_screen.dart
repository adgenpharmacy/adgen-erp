import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/sales_provider.dart';
import '../../core/utils/constants.dart';
import '../../shared/models/sales_bill_model.dart';
import '../../shared/widgets/app_button.dart';
import '../../core/utils/pdf_generator.dart';

class InvoicePreviewScreen extends ConsumerStatefulWidget {
  final String billId;

  const InvoicePreviewScreen({super.key, required this.billId});

  @override
  ConsumerState<InvoicePreviewScreen> createState() => _InvoicePreviewScreenState();
}

class _InvoicePreviewScreenState extends ConsumerState<InvoicePreviewScreen> {
  String _printSize = AppConstants.defaultPrintSize;

  Future<pw.Document> _buildPdf(SalesBillModel bill) async {
    return await PdfGenerator.generateSalesInvoice(bill, paperSize: _printSize);
  }

  Future<void> _print(SalesBillModel bill) async {
    final pdf = await _buildPdf(bill);
    await Printing.layoutPdf(
      onLayout: (_) async => pdf.save(),
      name: 'Invoice_${bill.invoiceNumber}',
    );
  }


  @override
  Widget build(BuildContext context) {
    final salesAsync = ref.watch(salesBillsProvider);
    final bill = salesAsync.value?.firstWhere(
      (b) => b.id == widget.billId,
      orElse: () => throw Exception('Bill not found'),
    );

    if (bill == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Text('Invoice — ${bill.invoiceNumber}'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        actions: [
          // Print size selector
          DropdownButton<String>(
            value: _printSize,
            dropdownColor: AppColors.surface2,
            style: AppTypography.label,
            underline: const SizedBox(),
            items: AppConstants.printSizes
                .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                .toList(),
            onChanged: (v) => setState(() => _printSize = v!),
          ),
          const SizedBox(width: AppSpacing.md),
          AppButton(
            label: 'Print',
            icon: Icons.print_rounded,
            onPressed: () => _print(bill),
            small: true,
          ),
          const SizedBox(width: AppSpacing.lg),
        ],
      ),
      body: FutureBuilder<pw.Document>(
        future: _buildPdf(bill),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator(color: AppColors.primary));
          }
          return PdfPreview(
            build: (_) async => snapshot.data!.save(),
            allowPrinting: true,
            allowSharing: true,
            canChangePageFormat: false,
            canChangeOrientation: false,
            initialPageFormat: PdfPageFormat.a5,
          );
        },
      ),
    );
  }
}
