'use client';

import { useState, useEffect } from 'react';
import { Printer, X, Share2, Check } from 'lucide-react';
import { formatDate, numberToWords, formatQuantity } from '@/lib/utils';
import type { Purchase, PurchaseDetail } from '@/types';
import Portal from '@/components/ui/Portal';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import { formatPharmacyAddress } from '@/types';

interface PurchasePrintModalProps {
  purchase: PurchaseDetail | Purchase;
  onClose: () => void;
}

export default function PurchasePrintModal({ purchase: source, onClose }: PurchasePrintModalProps) {
  const [copied, setCopied] = useState(false);
  // Pharmacy identity is owner-configurable in Admin; it was hardcoded here,
  // which meant a placeholder GSTIN printed on real tax invoices.
  const { profile } = useErpData();

  /*
   * The purchases list is fetched without its lines, so a bill passed straight from a list row
   * printed "TOTAL ITEMS: 0 MEDICINES" above a correct total. Fetch the detail here rather
   * than depending on what the caller happened to be holding.
   */
  const [detail, setDetail] = useState<PurchaseDetail | Purchase | null>(null);
  const needsDetail = !!source && !(source.items && source.items.length > 0);

  useEffect(() => {
    if (!source || !needsDetail) return;
    let cancelled = false;
    api
      .get<PurchaseDetail>(`/purchases/${source.id}`)
      .then((r) => {
        if (!cancelled) setDetail(r.data);
      })
      .catch(() => {
        /* header figures still print correctly without the lines */
      });
    return () => {
      cancelled = true;
    };
  }, [source?.id, needsDetail]);

  const loadingLines = needsDetail && !detail;
  const purchase = detail ?? source;
  if (!purchase) return null;

  const handlePrint = () => {
    const originalTitle = document.title;
    const invNum = purchase.invoiceNumber || purchase.id || 'Draft';
    const partyName = (purchase.party?.name || 'Supplier').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `Purchase_Invoice_${invNum}_${partyName}_AdGen_Pharma`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleShare = async () => {
    const text = `*ADGEN PHARMACY - PURCHASE INVOICE MEMO*\n----------------------------\nInvoice #: ${purchase.invoiceNumber}\nDate: ${formatDate(purchase.purchaseDate || purchase.createdAt)}\nSupplier: ${purchase.party?.name || 'Distributor'}\nPhone: ${purchase.party?.phone || 'N/A'}\n----------------------------\n*Grand Total: ₹${purchase.grandTotal?.toFixed(2)}*\nPayment: ${purchase.isPaid ? 'PAID' : 'CREDIT'}\n----------------------------`;
    
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
  const totalBilledQty = items.reduce((acc: number, i) => acc + (Number(i.quantity) || 0), 0);
  const totalFreeQty = items.reduce((acc: number, i) => acc + (Number(i.freeQuantity) || 0), 0);

  // Line item gross pre-discount subtotal & item discounts
  const grossSubtotal = items.reduce((acc: number, i) => {
    const qty = Number(i.quantity) || 0;
    const pRate = Number(i.purchaseRate || 0);
    return acc + (qty * pRate);
  }, 0);

  const itemDiscountsSum = items.reduce((acc: number, i) => {
    const qty = Number(i.quantity) || 0;
    const pRate = Number(i.purchaseRate || 0);
    const discPercent = Number(i.discountPercent || 0);
    return acc + ((qty * pRate) * (discPercent / 100));
  }, 0);

  const billSchemeDiscount = Number(purchase.discount || 0);
  const totalDiscountVal = itemDiscountsSum + billSchemeDiscount;

  const taxableSubtotalVal = purchase.subtotal !== undefined
    ? Number(purchase.subtotal)
    : Math.max(0, grossSubtotal - totalDiscountVal);

  const taxTotal = Number(purchase.taxTotal || 0);
  const roundOffVal = Number(purchase.roundOffAmount || 0);
  const totalOutflow = Number(purchase.grandTotal || (taxableSubtotalVal + taxTotal + roundOffVal));

  return (
    <Portal>
    <div 
      onClick={onClose}
      className="print-root fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:block print:p-0 print:overflow-visible print:bg-transparent"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col transition-all print:block print:max-h-none print:m-0 print:w-full print:max-w-full print:border-0 print:shadow-none print:rounded-none print:overflow-visible"
      >
        {/* Print rules live in globals.css. A local @page block here used to re-declare a
            0.8cm margin, which is the gutter browsers draw their own header and footer into. */}
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
              disabled={loadingLines}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
            >
              <Printer className="w-4 h-4" />
              <span>{loadingLines ? 'Loading items…' : 'Print Purchase Bill'}</span>
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
        <div className="print-area p-8 text-slate-900 text-xs font-sans print:p-0 print:text-black flex-1 overflow-y-auto print:flex-none print:overflow-visible print:max-h-none">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-start gap-3">
              <img src="/logo.png" alt="AdGen Pharma" className="h-12 w-auto object-contain shrink-0" />
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
                  {profile?.name || 'ADGEN PHARMA'}
                </h1>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-1">
                  {profile?.tagline || 'GOODS INWARD RECEIPT & PURCHASE INVOICE'}
                </p>
                <div className="text-[10px] text-slate-600 font-medium mt-1 leading-tight">
                  {formatPharmacyAddress(profile) || '—'}<br />
                  <strong>DL No:</strong> {profile?.dlNumber || '—'} | <strong>GSTIN:</strong> {profile?.gstNumber || '—'}<br />
                  <strong>Phone:</strong> {profile?.phone || '—'} | <strong>Email:</strong> {profile?.email || '—'}
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-900 font-extrabold text-[11px] rounded-lg uppercase tracking-wider mb-2 print:bg-slate-200 print:text-black">
                PURCHASE GRN MEMO
              </span>
              <div className="text-xs font-mono font-extrabold text-slate-900">
                {purchase.invoiceNumber}
              </div>
              <div className="text-[11px] text-slate-600 font-medium mt-1">
                Date: {formatDate(purchase.purchaseDate || purchase.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 uppercase mt-1">
                Payment: {purchase.isPaid ? 'PAID' : 'CREDIT'}
              </div>
            </div>
          </div>

          {/* Supplier Party Details */}
          <div className="bg-slate-50 border border-slate-200/90 p-3.5 rounded-xl mb-4 flex justify-between items-center text-xs print:bg-transparent print:border-slate-300">
            <div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Supplier Party / Distributor:</span>
              <span className="font-extrabold text-slate-900 text-sm">{purchase.party?.name || 'Distributor Party'}</span>
              {purchase.party?.phone && (
                <span className="text-slate-600 font-medium ml-2 font-mono">(📞 {purchase.party.phone})</span>
              )}
            </div>

            <div className="text-right text-[11px]">
              {purchase.party?.gstNumber && (
                <div><span className="font-bold text-slate-500">GSTIN:</span> <span className="font-mono font-bold">{purchase.party.gstNumber}</span></div>
              )}
              {purchase.party?.dlNumber && (
                <div><span className="font-bold text-slate-500">DL No:</span> <span className="font-mono font-bold">{purchase.party.dlNumber}</span></div>
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
              {items.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const freeQty = Number(item.freeQuantity) || 0;
                const pRate = Number(item.purchaseRate || 0);
                const discPercent = Number(item.discountPercent || 0);
                
                // Line total = exact Qty x Rate minus discount
                const grossLine = qty * pRate;
                const lineDisc = grossLine * (discPercent / 100);
                const lineTotal = item.totalAmount !== undefined ? Number(item.totalAmount) : (grossLine - lineDisc);

                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">
                      <div>{item.product?.name || 'Purchased Medicine'}</div>
                      {discPercent > 0 && (
                        <div className="text-[9px] text-emerald-700 font-semibold">({discPercent}% Disc Applied)</div>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{item.batchNumber || 'DEF'}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono">
                      {item.expiryDate ? formatDate(item.expiryDate) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900 font-mono">{formatQuantity(qty)}</td>
                    <td className="py-2 px-2 text-center font-bold text-emerald-700 font-mono">
                      {freeQty > 0 ? `+${formatQuantity(freeQty)}` : '0'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">₹{pRate.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-600">₹{Number(item.mrp || 0).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono font-extrabold text-slate-900">₹{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>

            {/* TABLE FOOTER WITH TOTALS */}
            <tfoot className="bg-slate-100 border-t-2 border-b border-slate-900 font-extrabold text-slate-900 text-xs">
              <tr>
                <td colSpan={4} className="py-2 px-2 text-left uppercase">
                  Total Items: {items.length} Medicines
                </td>
                <td className="py-2 px-2 text-center font-mono">{formatQuantity(totalBilledQty)}</td>
                <td className="py-2 px-2 text-center font-mono text-emerald-800">
                  {totalFreeQty > 0 ? `+${formatQuantity(totalFreeQty)} Free` : '0 Free'}
                </td>
                <td colSpan={2} className="py-2 px-2 text-right uppercase text-[11px]">
                  Inward Subtotal:
                </td>
                <td className="py-2 px-2 text-right font-mono text-sm text-slate-900">
                  ₹{grossSubtotal.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Financial Breakdown & Summary Flow */}
          <div className="border-t-2 border-slate-900 pt-3 flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Left Column: Words & ITC Declaration */}
            <div className="space-y-3 max-w-md w-full">
              {/* Amount in Words Box */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Amount in Words:
                </span>
                <span className="font-extrabold text-slate-900 text-xs mt-0.5 block italic">
                  {numberToWords(totalOutflow)}
                </span>
              </div>

              <div className="text-[9px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700 uppercase">Input Tax Credit (ITC) Declaration:</p>
                <p>1. Input Tax Credit claimed under Section 16 of CGST Act, 2017.</p>
                <p>2. Stock received & verified against supplier delivery challan.</p>
              </div>
            </div>

            {/* Right Column: Arithmetic Flow Summary Box */}
            <div className="w-full sm:w-80 space-y-1.5 text-xs font-medium">
              <div className="flex justify-between text-slate-600">
                <span>Inward Gross Subtotal:</span>
                <span className="font-mono font-bold text-slate-900">₹{grossSubtotal.toFixed(2)}</span>
              </div>

              {itemDiscountsSum > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>(-) Item Trade Discount:</span>
                  <span className="font-mono">- ₹{itemDiscountsSum.toFixed(2)}</span>
                </div>
              )}

              {billSchemeDiscount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>(-) Bill Scheme Discount:</span>
                  <span className="font-mono">- ₹{billSchemeDiscount.toFixed(2)}</span>
                </div>
              )}


              <div className="flex justify-between text-slate-800 font-bold pt-1 border-t border-dashed border-slate-300">
                <span>(=) Net Taxable Subtotal:</span>
                <span className="font-mono">₹{taxableSubtotalVal.toFixed(2)}</span>
              </div>

              {taxTotal > 0 && (
                <>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>(+) Input CGST Credit (50%):</span>
                    <span className="font-mono">₹{(taxTotal / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>(+) Input SGST Credit (50%):</span>
                    <span className="font-mono">₹{(taxTotal / 2).toFixed(2)}</span>
                  </div>
                </>
              )}

              {roundOffVal !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Round Off:</span>
                  <span className="font-mono">
                    {roundOffVal > 0 ? `+ ₹${roundOffVal.toFixed(2)}` : `- ₹${Math.abs(roundOffVal).toFixed(2)}`}
                  </span>
                </div>
              )}

              {/* PROMINENT PROCUREMENT OUTFLOW BANNER */}
              <div className="p-3 bg-indigo-900 text-white rounded-2xl flex justify-between items-center shadow-lg print:bg-slate-900 print:text-white mt-2">
                <div>
                  <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest block print:text-slate-300">
                    TOTAL PROCUREMENT OUTFLOW
                  </span>
                  <span className="text-xs font-bold text-indigo-100 print:text-slate-200">Net Purchase Bill</span>
                </div>
                <span className="font-mono text-xl font-black text-white">
                  ₹{totalOutflow.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Signature */}
          <div className="mt-8 pt-4 flex justify-between items-end border-t border-slate-200">
            <div className="text-[10px] text-slate-500">
              Goods Inward Verification Complete. Stock quantities added to FEFO inventory.
            </div>
            <div className="text-center font-bold text-xs text-slate-800">
              <div className="h-8"></div>
              <div className="border-t border-slate-400 px-4 pt-1 text-[11px]">
                Verified By (Store In-Charge / Owner)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
