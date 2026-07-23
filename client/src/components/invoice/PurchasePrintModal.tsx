'use client';

import { useState } from 'react';
import { Printer, X, Share2, Check } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface PurchasePrintModalProps {
  purchase: any;
  onClose: () => void;
}

export default function PurchasePrintModal({ purchase, onClose }: PurchasePrintModalProps) {
  const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'thermal'>('a4');
  const [copied, setCopied] = useState(false);

  if (!purchase) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const text = `*ADGEN PHARMACY - PURCHASE INVOICE MEMO*\n----------------------------\nInvoice #: ${purchase.invoiceNumber}\nDate: ${formatDate(purchase.purchaseDate || purchase.createdAt)}\nSupplier: ${purchase.party?.name || 'Distributor'}\nPhone: ${purchase.party?.phone || 'N/A'}\nDL No: ${purchase.party?.dlNumber || 'N/A'}\n----------------------------\n*Grand Total: ₹${purchase.grandTotal?.toFixed(2)}*\nPayment Status: ${purchase.isPaid ? 'PAID CASH' : 'UNPAID CREDIT'}\n----------------------------`;
    
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
            <span>Purchase Invoice {purchase.invoiceNumber}</span>
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
                  <p className="text-[10px] text-slate-600 print:text-black font-bold uppercase tracking-wider">GOODS RECEIPT & PURCHASE INVOICE</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-extrabold text-emerald-800 print:text-black">
                {purchase.invoiceNumber}
              </div>
              <div className="text-[11px] text-slate-600 print:text-black font-medium mt-1">
                Date: {formatDate(purchase.purchaseDate || purchase.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 print:text-black uppercase mt-1">
                Status: {purchase.isPaid ? 'PAID CASH' : 'UNPAID CREDIT'}
              </div>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl mb-4 print:bg-transparent print:border-none flex justify-between items-center text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Distributor / Supplier:</span>
              <span className="font-bold text-slate-900 print:text-black">{purchase.party?.name || 'Supplier Party'}</span>
              {purchase.party?.phone && (
                <span className="text-slate-600 print:text-black font-semibold ml-2">(📞 {purchase.party.phone})</span>
              )}
            </div>
            {purchase.party?.dlNumber && (
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Supplier DL No:</span>
                <span className="font-bold text-slate-800 print:text-black">{purchase.party.dlNumber}</span>
              </div>
            )}
          </div>

          {/* Table */}
          <table className="w-full text-left text-xs mb-4">
            <thead className="border-b border-slate-300 font-bold text-slate-700 print:text-black">
              <tr>
                <th className="py-1.5">Item Name</th>
                <th className="py-1.5">Batch</th>
                <th className="py-1.5 text-right">Packs</th>
                <th className="py-1.5 text-right">Free</th>
                <th className="py-1.5 text-right">Rate</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {purchase.items?.map((item: any, i: number) => (
                <tr key={i}>
                  <td className="py-2 font-bold text-slate-900 print:text-black">{item.productName || item.product?.name}</td>
                  <td className="py-2 font-mono text-emerald-800 print:text-black">{item.batchNumber || 'DEF'}</td>
                  <td className="py-2 text-right font-bold">{item.quantity}</td>
                  <td className="py-2 text-right font-bold text-emerald-700">{item.freeQuantity || 0}</td>
                  <td className="py-2 text-right">₹{(item.purchaseRate || item.unitPrice)?.toFixed(2)}</td>
                  <td className="py-2 text-right font-extrabold">₹{(item.quantity * (item.purchaseRate || item.unitPrice)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center text-sm font-extrabold">
            <span>Grand Total Payable</span>
            <span className="font-mono text-emerald-800 print:text-black text-lg">₹{purchase.grandTotal?.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
