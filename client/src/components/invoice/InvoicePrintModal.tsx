'use client';

import { useState } from 'react';
import { Printer, X, Share2, Check, FileText } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface InvoicePrintModalProps {
  invoice?: any;
  bill?: any;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, bill, onClose }: InvoicePrintModalProps) {
  const [copied, setCopied] = useState(false);

  const activeInvoice = bill || invoice;
  if (!activeInvoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const customer = activeInvoice.customerName || activeInvoice.customer?.name || 'Customer';
    const text = `*ADGEN PHARMACY - RETAIL CASH MEMO*\n----------------------------\nInvoice #: ${activeInvoice.invoiceNumber}\nDate: ${formatDate(activeInvoice.saleDate || activeInvoice.createdAt)}\nCustomer: ${customer}\nDoctor: ${activeInvoice.doctorName || 'N/A'}\n----------------------------\n*Grand Total: ₹${activeInvoice.grandTotal?.toFixed(2)}*\nPayment: ${activeInvoice.paymentMethod || 'CASH'}\n----------------------------\nThank you for choosing AdGen Pharmacy!`;
    
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
  const subtotal = items.reduce((acc: number, i: any) => acc + ((i.quantity || 1) * (i.unitPrice || i.price || 0)), 0);
  const taxAmount = activeInvoice.taxAmount || items.reduce((acc: number, i: any) => {
    const itemTotal = (i.quantity || 1) * (i.unitPrice || i.price || 0);
    const gstRate = i.gstPercent || i.product?.gstPercent || 12;
    return acc + (itemTotal * (gstRate / (100 + gstRate)));
  }, 0);
  const discountAmount = activeInvoice.discountAmount || 0;
  const grandTotal = activeInvoice.grandTotal || (subtotal - discountAmount);

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col transition-all"
      >
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
              <img src="/logo.png" alt="AdGen Pharmacy" className="h-12 w-auto object-contain shrink-0" />
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">ADGEN PHARMACY</h1>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                  RETAIL PHARMACY & CLINICAL SUPPLIES
                </p>
                <div className="text-[10px] text-slate-500 font-medium mt-1 leading-tight">
                  Shop No. 12, Main Market Road, Chembur, Mumbai - 400071<br />
                  <strong>DL No:</strong> 20B/MH-MUM-182736, 21B/MH-MUM-182737 | <strong>GSTIN:</strong> 27AACCA1234F1Z9<br />
                  <strong>Phone:</strong> +91 98765 43210 | <strong>Email:</strong> billing@adgenpharmacy.com
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
                Date: {formatDate(activeInvoice.saleDate || activeInvoice.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 uppercase mt-1">
                Mode: {activeInvoice.paymentMethod || 'CASH'}
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
                <span className="text-slate-600 font-medium ml-2">
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
                <th className="py-2 px-2 text-center">Unit</th>
                <th className="py-2 px-2 text-center">Qty</th>
                <th className="py-2 px-2 text-right">MRP (₹)</th>
                <th className="py-2 px-2 text-right">Rate (₹)</th>
                <th className="py-2 px-2 text-right">GST %</th>
                <th className="py-2 px-2 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {items.map((item: any, idx: number) => {
                const itemGst = item.gstPercent || item.product?.gstPercent || 12;
                const unitPrice = item.unitPrice || item.price || 0;
                const qty = item.quantity || 1;
                const lineTotal = item.totalAmount || (qty * unitPrice);

                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">
                      <div>{item.product?.name || item.productName || 'Medicine Item'}</div>
                      {item.product?.genericName && (
                        <div className="text-[9px] text-slate-500 font-normal">{item.product.genericName}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-slate-600">{item.product?.hsnCode || '3004'}</td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{item.batchNumber || item.batch?.batchNumber || 'DEF'}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono">
                      {item.expiryDate || item.batch?.expiryDate ? formatDate(item.expiryDate || item.batch?.expiryDate) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center font-bold">{item.unitType || 'STRIP'}</td>
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900">{qty}</td>
                    <td className="py-2 px-2 text-right font-mono">₹{(item.mrp || item.batch?.mrp || unitPrice).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono">₹{unitPrice.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono">{itemGst}%</td>
                    <td className="py-2 px-2 text-right font-mono font-extrabold text-slate-900">₹{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Financial Breakdown & Summary */}
          <div className="border-t-2 border-slate-900 pt-3 flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Terms & Conditions */}
            <div className="text-[9px] text-slate-500 space-y-0.5 max-w-sm">
              <p className="font-bold text-slate-700 uppercase">Terms & Conditions:</p>
              <p>1. Goods once sold will not be taken back without original cash memo.</p>
              <p>2. Schedule H & H1 drugs sold against Doctor's prescription only.</p>
              <p>3. Check expiry date and seal before leaving the counter.</p>
            </div>

            {/* Price Breakdown Box */}
            <div className="w-full sm:w-64 space-y-1.5 text-xs font-medium">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">₹{(subtotal - taxAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST ({((items[0]?.gstPercent || 12) / 2).toFixed(1)}%):</span>
                <span className="font-mono text-slate-800">₹{(taxAmount / 2).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST ({((items[0]?.gstPercent || 12) / 2).toFixed(1)}%):</span>
                <span className="font-mono text-slate-800">₹{(taxAmount / 2).toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Special Discount:</span>
                  <span className="font-mono">- ₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t-2 border-slate-900 pt-1.5 flex justify-between items-center text-sm font-black text-slate-900">
                <span>NET PAYABLE:</span>
                <span className="font-mono text-base text-emerald-700 print:text-black">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Authorized Signature Line */}
          <div className="mt-8 pt-4 flex justify-between items-end border-t border-slate-200">
            <div className="text-[10px] text-slate-500">
              Thank you for trusting <strong>ADGEN PHARMACY</strong>! Wish you good health.
            </div>
            <div className="text-center font-bold text-xs text-slate-800">
              <div className="h-10"></div>
              <div className="border-t border-slate-400 px-4 pt-1">
                For ADGEN PHARMACY (Authorised Signatory)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
