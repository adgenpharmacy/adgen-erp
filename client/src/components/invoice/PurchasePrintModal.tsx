'use client';

import { useState } from 'react';
import { Printer, X, Share2, Check, FileText } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface PurchasePrintModalProps {
  purchase: any;
  onClose: () => void;
}

export default function PurchasePrintModal({ purchase, onClose }: PurchasePrintModalProps) {
  const [copied, setCopied] = useState(false);

  if (!purchase) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const text = `*ADGEN PHARMACY - PURCHASE INVOICE MEMO*\n----------------------------\nInvoice #: ${purchase.invoiceNumber}\nDate: ${formatDate(purchase.purchaseDate || purchase.createdAt)}\nSupplier: ${purchase.party?.name || 'Distributor'}\nPhone: ${purchase.party?.phone || 'N/A'}\n----------------------------\n*Grand Total: ₹${purchase.grandTotal?.toFixed(2)}*\nPayment: ${purchase.paymentMethod || (purchase.isPaid ? 'CASH' : 'CREDIT')}\n----------------------------`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Purchase Invoice ${purchase.invoiceNumber}`,
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

  const items = purchase.items || [];
  const subtotal = items.reduce((acc: number, i: any) => acc + ((i.quantity || 1) * (i.purchaseRate || i.unitPrice || 0)), 0);

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
            <span>Purchase Goods Receipt: {purchase.invoiceNumber}</span>
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
              <span>Print Purchase Bill</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Bill Container */}
        <div className="print-area p-8 text-slate-900 text-xs font-sans print:p-0 print:text-black flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-start gap-3">
              <img src="/logo.png" alt="AdGen Pharmacy" className="h-12 w-auto object-contain shrink-0" />
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">ADGEN PHARMACY</h1>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                  GOODS INWARD RECEIPT & PURCHASE INVOICE
                </p>
                <div className="text-[10px] text-slate-500 font-medium mt-1 leading-tight">
                  Shop No. 12, Main Market Road, Chembur, Mumbai - 400071<br />
                  <strong>DL No:</strong> 20B/MH-MUM-182736 | <strong>GSTIN:</strong> 27AACCA1234F1Z9
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-900 font-extrabold text-[11px] rounded-lg uppercase tracking-wider mb-2 print:bg-slate-200 print:text-black">
                PURCHASE GRN MEMO
              </span>
              <div className="text-xs font-mono font-extrabold text-slate-900">
                {purchase.invoiceNumber}
              </div>
              <div className="text-[11px] text-slate-600 font-medium mt-1">
                Date: {formatDate(purchase.purchaseDate || purchase.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 uppercase mt-1">
                Payment: {purchase.paymentMethod || (purchase.isPaid ? 'CASH' : 'CREDIT')}
              </div>
            </div>
          </div>

          {/* Supplier Party Details */}
          <div className="bg-slate-50 border border-slate-200/90 p-3.5 rounded-xl mb-4 flex justify-between items-center text-xs print:bg-transparent print:border-slate-300">
            <div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Supplier Party / Distributor:</span>
              <span className="font-extrabold text-slate-900 text-sm">{purchase.party?.name || 'Distributor Party'}</span>
              {purchase.party?.phone && (
                <span className="text-slate-600 font-medium ml-2">(📞 {purchase.party.phone})</span>
              )}
            </div>

            <div className="text-right text-[11px]">
              {purchase.party?.gstin && (
                <div><span className="font-bold text-slate-500">GSTIN:</span> {purchase.party.gstin}</div>
              )}
              {purchase.party?.dlNumber && (
                <div><span className="font-bold text-slate-500">DL No:</span> {purchase.party.dlNumber}</div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs mb-4 border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-extrabold text-slate-700 text-[10px] uppercase print:bg-slate-200">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Item Name & Form</th>
                <th className="py-2 px-2">Batch #</th>
                <th className="py-2 px-2">Expiry</th>
                <th className="py-2 px-2 text-center">Billed Qty</th>
                <th className="py-2 px-2 text-center">Free Qty</th>
                <th className="py-2 px-2 text-right">P.Rate (₹)</th>
                <th className="py-2 px-2 text-right">MRP (₹)</th>
                <th className="py-2 px-2 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {items.map((item: any, idx: number) => {
                const pRate = item.purchaseRate || item.unitPrice || 0;
                const qty = item.quantity || 1;
                const lineTotal = item.totalAmount || (qty * pRate);

                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">
                      {item.productName || item.product?.name || 'Purchased Medicine'}
                    </td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{item.batchNumber || 'DEF'}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono">
                      {item.expiryDate ? formatDate(item.expiryDate) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900">{qty}</td>
                    <td className="py-2 px-2 text-center font-bold text-emerald-700">{item.freeQuantity || 0}</td>
                    <td className="py-2 px-2 text-right font-mono">₹{pRate.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-600">₹{(item.mrp || 0).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono font-extrabold text-slate-900">₹{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Grand Total Bar */}
          <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center text-sm font-black text-slate-900">
            <span>TOTAL PURCHASE VALUE INWARD</span>
            <span className="font-mono text-lg text-emerald-800 print:text-black">
              ₹{(purchase.grandTotal || subtotal).toFixed(2)}
            </span>
          </div>

          {/* Footer Signature */}
          <div className="mt-8 pt-4 flex justify-between items-end border-t border-slate-200">
            <div className="text-[10px] text-slate-500">
              Goods Inward Verification Complete. Stock quantities added to FEFO inventory.
            </div>
            <div className="text-center font-bold text-xs text-slate-800">
              <div className="h-10"></div>
              <div className="border-t border-slate-400 px-4 pt-1">
                Verified By (Store In-Charge / Owner)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
