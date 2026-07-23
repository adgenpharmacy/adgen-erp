'use client';

import { useState } from 'react';
import { Printer, X, Share2, FileText, Check, Phone, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface InvoicePrintModalProps {
  invoice?: any;
  bill?: any;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, bill, onClose }: InvoicePrintModalProps) {
  const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'thermal'>('a4');
  const [copied, setCopied] = useState(false);

  const activeInvoice = bill || invoice;
  if (!activeInvoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const customer = activeInvoice.customerName || activeInvoice.customer?.name || 'Customer';
    const text = `*ADGEN PHARMACY - RETAIL CASH MEMO*\n----------------------------\nInvoice #: ${activeInvoice.invoiceNumber}\nDate: ${formatDate(activeInvoice.saleDate || activeInvoice.createdAt)}\nCustomer: ${customer}\nDoctor: ${activeInvoice.doctorName || 'N/A'}\n----------------------------\n*Grand Total: ₹${activeInvoice.grandTotal?.toFixed(2)}*\nPayment: ${activeInvoice.paymentMethod}\n----------------------------\nThank you for choosing AdGen Pharmacy!`;
    
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

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">Print / Share Invoice</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Preview */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3 font-mono text-xs text-slate-700">
          <div className="flex justify-between border-b border-slate-200 pb-2">
            <span className="font-bold text-slate-900 font-sans">ADGEN PHARMACY</span>
            <span className="text-emerald-600 font-bold">INV-{activeInvoice.invoiceNumber || 'NEW'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span>Customer: {activeInvoice.customerName || 'Walk-in Customer'}</span>
            <span>Date: {new Date(activeInvoice.createdAt || Date.now()).toLocaleDateString('en-IN')}</span>
          </div>
          <div className="border-t border-b border-slate-200 py-2 space-y-1">
            {(activeInvoice.items || []).map((i: any, idx: number) => (
              <div key={idx} className="flex justify-between text-[11px]">
                <span className="truncate max-w-[240px] font-sans">{i.product?.name || i.productName || 'Medicine'}</span>
                <span>x{i.quantity}</span>
                <span className="font-bold text-slate-900">₹{(i.totalAmount || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 font-sans">
            <span>Grand Total:</span>
            <span className="text-emerald-600 font-mono">₹{(activeInvoice.grandTotal || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? 'Copied Link!' : 'Share WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>Print Cash Memo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
