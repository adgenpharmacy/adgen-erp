'use client';

import { useState } from 'react';
import { Printer, X, Share2, Check } from 'lucide-react';
import { formatDate, numberToWords, formatQuantity } from '@/lib/utils';
import type { Sale, SaleDetail } from '@/types';
import Portal from '@/components/ui/Portal';

interface InvoicePrintModalProps {
  invoice?: SaleDetail | Sale;
  bill?: SaleDetail | Sale;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, bill, onClose }: InvoicePrintModalProps) {
  const [copied, setCopied] = useState(false);

  const activeInvoice = bill || invoice;
  if (!activeInvoice) return null;

  const handlePrint = () => {
    const originalTitle = document.title;
    const invNum = activeInvoice.invoiceNumber || activeInvoice.id || 'Draft';
    const custName = (activeInvoice.customerName || activeInvoice.customer?.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `Tax_Invoice_${invNum}_${custName}_AdGen_Pharma`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleShare = async () => {
    const customer = activeInvoice.customerName || activeInvoice.customer?.name || 'Customer';
    const text = `*ADGEN PHARMACY - RETAIL CASH MEMO*\n----------------------------\nInvoice #: ${activeInvoice.invoiceNumber}\nDate: ${formatDate(activeInvoice.createdAt)}\nCustomer: ${customer}\nDoctor: ${activeInvoice.doctorName || 'N/A'}\n----------------------------\n*Grand Total: ₹${activeInvoice.grandTotal?.toFixed(2)}*\nPayment: ${activeInvoice.paymentMethod || 'CASH'}\n----------------------------\nThank you for choosing AdGen Pharmacy!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice #${activeInvoice.invoiceNumber}`,
          text: text,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const items = activeInvoice.items || [];
  const totalQtyCount = items.reduce((acc: number, i) => acc + (Number(i.quantity) || 0), 0);
  // Gross at full MRP, before any discount.
  const grossSubtotal = items.reduce((acc: number, i) => {
    const qty = Number(i.quantity) || 0;
    const unitPrice = Number(i.unitPrice || 0);
    return acc + (qty * unitPrice);
  }, 0);

  // Per-item discounts, shown separately from the bill-level discount so the customer can
  // reconcile the invoice line by line.
  const itemDiscountsSum = items.reduce((acc: number, i) => {
    const qty = Number(i.quantity) || 0;
    const unitPrice = Number(i.unitPrice || 0);
    return acc + (qty * unitPrice) * ((Number(i.discountPercent) || 0) / 100);
  }, 0);

  const discountVal = Number(activeInvoice.discount || 0);
  const netBilledVal = Math.max(0, grossSubtotal - itemDiscountsSum - discountVal);
  const netPayableVal = Number(activeInvoice.grandTotal || netBilledVal);
  const roundOffVal = Number(activeInvoice.roundOffAmount || 0);

  // Exact per-item GST tax extraction
  const discountRatio = grossSubtotal > 0 ? (netBilledVal / grossSubtotal) : 1;
  const totalGstIncluded = items.reduce((acc: number, i) => {
    const itemTotal = (Number(i.quantity) || 0) * (Number(i.unitPrice || 0));
    const gstRate = Number(i.taxPercent ?? i.product?.gstPercent ?? 12);
    const itemTax = itemTotal * (gstRate / (100 + gstRate));
    return acc + itemTax;
  }, 0) * discountRatio;

  const taxableSubtotalVal = Math.max(0, netBilledVal - totalGstIncluded);

  return (
    <Portal>
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col transition-all"
      >
        <style>{`
          @media print {
            @page { margin: 0.8cm; size: auto; }
            html, body { margin: 0; padding: 0; background: #ffffff; }
          }
        `}</style>
        {/* Top Control Bar (Hidden on print) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 font-extrabold text-slate-900 text-sm">
            <Printer className="w-4 h-4 text-emerald-600" />
            <span>Retail Tax Invoice INV-{activeInvoice.invoiceNumber || activeInvoice.id}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Share WhatsApp'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Cash Memo</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="print-area p-8 text-slate-900 text-xs font-sans print:p-0 print:text-black flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-start gap-3">
              <img src="/logo.png" alt="AdGen Pharma" className="h-12 w-auto object-contain shrink-0" />
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">ADGEN PHARMA</h1>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                  RETAIL PHARMACY & CLINICAL SUPPLIES
                </p>
                <div className="text-[10px] text-slate-600 font-medium mt-1 leading-tight">
                  27-A Chandra Nagar, Barfani Dham, MR-9, Indore (M.P) 452001<br />
                  <strong>DL No:</strong> 20B/5441/12/2024 | <strong>GSTIN:</strong> 27ABCDE1234F1Z5<br />
                  <strong>Phone:</strong> +91 88396 40968 | <strong>Email:</strong> adgenpharmacy2024@gmail.com
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-extrabold text-[11px] rounded-lg uppercase tracking-wider mb-2 print:bg-slate-200 print:text-black">
                RETAIL TAX INVOICE
              </span>
              <div className="text-xs font-mono font-extrabold text-slate-900">
                INV-{activeInvoice.invoiceNumber || activeInvoice.id}
              </div>
              <div className="text-[11px] text-slate-600 font-medium mt-1">
                Date: {formatDate(activeInvoice.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 uppercase mt-1">
                Payment: {activeInvoice.paymentMethod || 'CASH'}
              </div>
            </div>
          </div>

          {/* Customer & Doctor Info */}
          <div className="bg-slate-50 border border-slate-200/90 p-3 rounded-xl mb-4 flex justify-between items-center text-xs print:bg-transparent print:border-slate-300">
            <div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Customer / Patient:</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {activeInvoice.customerName || activeInvoice.customer?.name || 'Walk-in Customer'}
              </span>
              {(activeInvoice.customerPhone || activeInvoice.customer?.phone) && (
                <span className="text-slate-600 font-medium ml-2 font-mono">
                  (📞 {activeInvoice.customerPhone || activeInvoice.customer?.phone})
                </span>
              )}
            </div>

            {activeInvoice.doctorName && (
              <div className="text-right">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Prescribed By:</span>
                <span className="font-bold text-slate-900">Dr. {activeInvoice.doctorName}</span>
              </div>
            )}
          </div>

          {/* Itemized Table */}
          <table className="w-full text-left text-xs mb-4 border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-extrabold text-slate-700 text-[10px] uppercase print:bg-slate-200">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Medicine Product Name</th>
                <th className="py-2 px-2">HSN</th>
                <th className="py-2 px-2">Batch</th>
                <th className="py-2 px-2">Exp</th>
                <th className="py-2 px-2 text-center">Qty</th>
                <th className="py-2 px-2 text-right">MRP (₹)</th>
                <th className="py-2 px-2 text-right">GST %</th>
                <th className="py-2 px-2 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {items.map((item, idx) => {
                const itemGst = Number(item.taxPercent ?? item.product?.gstPercent ?? 12);
                const unitPrice = Number(item.unitPrice || 0);
                const qty = Number(item.quantity) || 0;
                
                // Line total = exact Qty x Unit MRP
                const lineTotal = item.totalAmount !== undefined ? Number(item.totalAmount) : (qty * unitPrice);

                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">
                      <div>{item.product?.name || 'Medicine Item'}</div>
                      {item.product?.genericName && (
                        <div className="text-[9px] text-slate-500 font-normal">{item.product.genericName}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-600">{item.product?.hsnCode || '3004'}</td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{item.batch?.batchNumber || 'DEF'}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono">
                      {item.batch?.expiryDate ? formatDate(item.batch.expiryDate) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900 font-mono">{formatQuantity(qty)}</td>
                    <td className="py-2 px-2 text-right font-mono">₹{unitPrice.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono">{itemGst}%</td>
                    <td className="py-2 px-2 text-right font-mono font-extrabold text-slate-900">₹{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>

            {/* TABLE FOOTER WITH TOTALS */}
            <tfoot className="bg-slate-100 border-t-2 border-b border-slate-900 font-extrabold text-slate-900 text-xs">
              <tr>
                <td colSpan={5} className="py-2 px-2 text-left uppercase">
                  Total Items: {items.length} Medicines
                </td>
                <td className="py-2 px-2 text-center font-mono">{formatQuantity(totalQtyCount)}</td>
                <td colSpan={2} className="py-2 px-2 text-right uppercase text-[11px]">
                  Subtotal MRP:
                </td>
                <td className="py-2 px-2 text-right font-mono text-sm text-slate-900">
                  ₹{grossSubtotal.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Financial Breakdown & Summary Flow */}
          <div className="border-t-2 border-slate-900 pt-3 flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Left Column: Words, Payment Details & Notes */}
            <div className="space-y-3 max-w-md w-full">
              {/* Amount in Words Box */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Amount in Words:
                </span>
                <span className="font-extrabold text-slate-900 text-xs mt-0.5 block italic">
                  {numberToWords(netPayableVal)}
                </span>
              </div>

              {/* Payment Mode Details */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Payment Mode & Settlement:
                </span>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Method: {activeInvoice.paymentMethod || 'CASH'}</span>
                  <span>Status: {activeInvoice.isSettled ? 'FULLY PAID' : 'PARTIAL / CREDIT'}</span>
                </div>
              </div>

              {/* Terms & Statutory Declarations */}
              <div className="text-[9px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700 uppercase">Notes & Statutory Declarations:</p>
                <p>1. Rates are GST-Inclusive as per Drugs (Prices Control) Order.</p>
                <p>2. Goods once sold cannot be returned without original cash memo.</p>
                <p>3. Schedule H & H1 medicines sold against Doctor's prescription only.</p>
              </div>
            </div>

            {/* Right Column: Arithmetic Flow Summary Box */}
            <div className="w-full sm:w-80 space-y-1.5 text-xs font-medium">
              <div className="flex justify-between text-slate-600">
                <span>Gross Total (MRP):</span>
                <span className="font-mono font-bold text-slate-900">₹{grossSubtotal.toFixed(2)}</span>
              </div>

              {itemDiscountsSum > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>(-) Item Discount:</span>
                  <span className="font-mono">- ₹{itemDiscountsSum.toFixed(2)}</span>
                </div>
              )}

              {discountVal > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>(-) Special Discount Allowed:</span>
                  <span className="font-mono">- ₹{discountVal.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-800 font-bold pt-1 border-t border-dashed border-slate-300">
                <span>(=) Net Billed Amount:</span>
                <span className="font-mono">₹{netBilledVal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-dashed border-slate-200">
                <span>Taxable Value (Excl. Tax):</span>
                <span className="font-mono">₹{taxableSubtotalVal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>(+) CGST (Central Tax Included):</span>
                <span className="font-mono">₹{(totalGstIncluded / 2).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>(+) SGST (State Tax Included):</span>
                <span className="font-mono">₹{(totalGstIncluded / 2).toFixed(2)}</span>
              </div>

              {roundOffVal !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Round Off:</span>
                  <span className="font-mono">{roundOffVal > 0 ? `+₹${roundOffVal.toFixed(2)}` : `-₹${Math.abs(roundOffVal).toFixed(2)}`}</span>
                </div>
              )}

              {/* NET AMOUNT PAYABLE PROMINENT BANNER */}
              <div className="p-3 bg-emerald-900 text-white rounded-2xl flex justify-between items-center shadow-lg print:bg-slate-900 print:text-white mt-2">
                <div>
                  <span className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-widest block print:text-slate-300">
                    NET AMOUNT PAYABLE
                  </span>
                  <span className="text-xs font-bold text-emerald-100 print:text-slate-200">Total Bill Amount</span>
                </div>
                <span className="font-mono text-xl font-black text-white">
                  ₹{netPayableVal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Authorized Signature Line */}
          <div className="mt-8 pt-4 flex justify-between items-end border-t border-slate-200">
            <div className="text-[10px] text-slate-500">
              Thank you for trusting <strong>ADGEN PHARMA</strong>! Wish you good health.
            </div>
            <div className="text-center font-bold text-xs text-slate-800">
              <div className="h-8"></div>
              <div className="border-t border-slate-400 px-4 pt-1 text-[11px]">
                For ADGEN PHARMA (Authorised Signatory)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
