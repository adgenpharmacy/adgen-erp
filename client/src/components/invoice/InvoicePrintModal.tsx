'use client';

import { useState } from 'react';
import { Printer, X, Share2, FileText, Check, Phone, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface InvoicePrintModalProps {
  invoice: any;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, onClose }: InvoicePrintModalProps) {
  const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'thermal'>('a4');
  const [copied, setCopied] = useState(false);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const customer = invoice.customerName || invoice.customer?.name || 'Customer';
    const text = `*ADGEN PHARMACY - RETAIL CASH MEMO*\n----------------------------\nInvoice #: ${invoice.invoiceNumber}\nDate: ${formatDate(invoice.saleDate || invoice.createdAt)}\nCustomer: ${customer}\nDoctor: ${invoice.doctorName || 'N/A'}\n----------------------------\n*Grand Total: ₹${invoice.grandTotal?.toFixed(2)}*\nPayment: ${invoice.paymentMethod}\n----------------------------\nThank you for choosing AdGen Pharmacy!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice #${invoice.invoiceNumber}`,
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

  const subtotal = invoice.items?.reduce((sum: number, i: any) => sum + (i.quantity * i.unitPrice), 0) || invoice.grandTotal;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border border-slate-200 rounded-2xl w-full shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col transition-all ${
          printFormat === 'thermal' ? 'max-w-sm' : printFormat === 'a5' ? 'max-w-md' : 'max-w-3xl'
        }`}
      >
        {/* Top Control Bar (Hidden on print) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Printer className="w-4 h-4 text-emerald-600" />
            <span>Sales Invoice #{invoice.invoiceNumber}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Selection Pills */}
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-2.5 py-1 rounded-lg transition ${printFormat === 'a4' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
              >
                A4 Full
              </button>
              <button
                onClick={() => setPrintFormat('a5')}
                className={`px-2.5 py-1 rounded-lg transition ${printFormat === 'a5' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
              >
                A5
              </button>
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-2.5 py-1 rounded-lg transition ${printFormat === 'thermal' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
              >
                3" Thermal
              </button>
            </div>

            <button
              onClick={handleShare}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-600" />}
              <span>{copied ? 'Copied!' : 'Share WhatsApp'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Window</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Bill Container */}
        <div className={`print-area p-8 text-slate-900 text-xs font-sans print:p-0 print:text-black flex-1 overflow-y-auto ${
          printFormat === 'thermal' ? 'max-w-[80mm] font-mono text-[10px] mx-auto p-4' : ''
        }`}>
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img src="/logo.png" alt="AdGen Pharmacy" className="h-10 w-auto object-contain" />
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 print:text-black">ADGEN PHARMACY</h1>
                  <p className="text-[10px] text-slate-600 print:text-black font-bold uppercase tracking-wider">OFFICIAL RETAIL CASH MEMO / GST TAX INVOICE</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 print:text-black leading-snug font-medium">
                27-A CHANDRA NAGAR, BARFANI DHAM MR-9, INDORE (M.P)<br />
                <strong>Phone:</strong> 8839640968, 8462984313 | <strong>Email:</strong> adgenpharmacy2024@gmail.com<br />
                <strong>DL NO:</strong> 20B/5441/12/2024, 21B/5442/12/2024 | <strong>GSTIN:</strong> 23AAPFA1234F1Z5
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-extrabold text-emerald-800 print:text-black">
                INV #{invoice.invoiceNumber}
              </div>
              <div className="text-[11px] text-slate-600 print:text-black font-medium mt-1">
                Date: {formatDate(invoice.saleDate || invoice.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 print:text-black uppercase mt-1">
                Payment: {invoice.paymentMethod}
              </div>
            </div>
          </div>

          {/* Customer & Doctor Info */}
          <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl mb-4 print:bg-transparent print:border-none flex justify-between items-center text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Billed To Customer:</span>
              <span className="font-bold text-slate-900 print:text-black">
                {invoice.customerName || invoice.customer?.name || 'Walk-in Retail Customer'}
              </span>
              {(invoice.customerPhone || invoice.customer?.phone) && (
                <span className="text-slate-600 print:text-black font-semibold ml-2">
                  (📞 {invoice.customerPhone || invoice.customer?.phone})
                </span>
              )}
            </div>
            {invoice.doctorName && (
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Prescribing Doctor:</span>
                <span className="font-bold text-emerald-800 print:text-black">Dr. {invoice.doctorName}</span>
              </div>
            )}
          </div>

          {/* Table */}
          <table className="w-full text-left text-xs mb-4">
            <thead className="border-b border-slate-300 font-bold text-slate-700 print:text-black">
              <tr>
                <th className="py-1.5">Item Name</th>
                <th className="py-1.5">Batch</th>
                <th className="py-1.5 text-right">Qty</th>
                <th className="py-1.5 text-right">MRP Rate</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {invoice.items?.map((item: any, i: number) => {
                const packSize = item.product?.packSize || 1;
                const strips = Math.floor(item.quantity / packSize);
                const loose = item.quantity % packSize;
                const qtyStr = packSize > 1 
                  ? `${strips > 0 ? `${strips} S` : ''} ${loose > 0 ? `${loose} T` : ''}`.trim() || `${item.quantity} U`
                  : `${item.quantity} U`;

                return (
                  <tr key={i}>
                    <td className="py-2 font-bold text-slate-900 print:text-black">{item.productName || item.product?.name}</td>
                    <td className="py-2 font-mono text-emerald-800 print:text-black">{item.batch?.batchNumber || item.batchNumber || 'DEF'}</td>
                    <td className="py-2 text-right font-bold">{qtyStr}</td>
                    <td className="py-2 text-right">₹{item.unitPrice?.toFixed(2)}</td>
                    <td className="py-2 text-right font-extrabold">₹{(item.quantity * item.unitPrice).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals Summary */}
          <div className="border-t-2 border-slate-900 pt-3 space-y-1.5 text-right text-xs">
            <div className="flex justify-between text-slate-600 print:text-black">
              <span>Subtotal</span>
              <span className="font-mono font-bold">₹{subtotal.toFixed(2)}</span>
            </div>
            {invoice.roundOffAmount !== undefined && (
              <div className="flex justify-between text-slate-600 print:text-black">
                <span>Round Off</span>
                <span className="font-mono font-bold">₹{invoice.roundOffAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm font-extrabold pt-2 border-t border-slate-200">
              <span>Grand Total</span>
              <span className="font-mono text-emerald-800 print:text-black text-lg">₹{invoice.grandTotal?.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
