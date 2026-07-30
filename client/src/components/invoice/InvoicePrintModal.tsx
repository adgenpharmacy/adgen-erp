'use client';

import { useState, useEffect } from 'react';
import { Printer, X, Share2, Check } from 'lucide-react';
import { formatDate, numberToWords, formatQuantity } from '@/lib/utils';
import type { Sale, SaleDetail } from '@/types';
import Portal from '@/components/ui/Portal';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import { formatPharmacyAddress } from '@/types';

interface InvoicePrintModalProps {
  invoice?: SaleDetail | Sale;
  bill?: SaleDetail | Sale;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, bill, onClose }: InvoicePrintModalProps) {
  const [copied, setCopied] = useState(false);
  // Pharmacy identity is owner-configurable in Admin; it was hardcoded here,
  // which meant a placeholder GSTIN printed on real tax invoices.
  const { profile } = useErpData();

  const source = bill || invoice;

  /*
   * The sales list is fetched without its lines, so a bill handed straight from a list row has
   * no items and printed "TOTAL ITEMS: 0 MEDICINES" over a correct grand total. The modal
   * fetches its own detail rather than trusting whatever the caller happened to hold.
   */
  const [detail, setDetail] = useState<SaleDetail | Sale | null>(null);
  const needsDetail = !!source && !(source.items && source.items.length > 0);

  useEffect(() => {
    if (!source || !needsDetail) return;
    let cancelled = false;
    api
      .get<SaleDetail>(`/sales/${source.id}`)
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
  const activeInvoice = detail ?? source;
  if (!activeInvoice) return null;

  const handlePrint = () => {
    const originalTitle = document.title;
    const invNum = activeInvoice.invoiceNumber || activeInvoice.id || 'Draft';
    const patientName = (activeInvoice.customerName || activeInvoice.customer?.name || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '_');
    const shopSlug = (profile?.name || 'AdGen Pharma').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `${gstRegistered ? 'Tax_Invoice' : 'Bill'}_${invNum}_${patientName}_${shopSlug}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleShare = async () => {
    // Shop name comes from the profile rather than a literal, so a rename in Admin reaches the
    // shared message too instead of leaving "ADGEN PHARMACY" behind on every WhatsApp bill.
    const patient = activeInvoice.customerName || activeInvoice.customer?.name || 'Patient';
    const shopName = (profile?.name || 'AdGen Pharma') + (profile?.tagline ? ` - ${profile.tagline}` : '');
    const text = `*${shopName.toUpperCase()}*\n----------------------------\nBill #: ${activeInvoice.invoiceNumber}\nDate: ${formatDate(activeInvoice.createdAt)}\nPatient: ${patient}\nContact: ${activeInvoice.customerPhone || activeInvoice.customer?.phone || '-'}\nDr. Name: ${activeInvoice.doctorName || '-'}\n----------------------------\n*Net Amount: ₹${activeInvoice.grandTotal?.toFixed(2)}*\nPayment: ${activeInvoice.paymentMethod || 'CASH'}\n----------------------------\nWell wishing, ${shopName}`;
    
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
    const gstRate = Number(i.taxPercent ?? i.product?.gstPercent ?? 0);
    const itemTax = itemTotal * (gstRate / (100 + gstRate));
    return acc + itemTax;
  }, 0) * discountRatio;

  const taxableSubtotalVal = Math.max(0, netBilledVal - totalGstIncluded);

  /*
   * A shop with no GSTIN is not registered, and an unregistered dealer may not issue a tax
   * invoice or show GST as a separate charge — it collects none. Printing a tax breakup it does
   * not remit is a compliance problem, and it is also what made the owner believe tax was being
   * deducted somewhere it should not be.
   *
   * Driven by the GSTIN on the profile, the same fact the reports switch on, so the printed bill
   * and the P&L can never tell different stories. Entering a GSTIN in Admin restores the full
   * tax invoice everywhere at once.
   */
  const gstRegistered = Boolean((profile?.gstNumber || '').trim());

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
            {/* No "INV-" literal here: the stored number already carries its own series
                prefix, so prepending one printed "INV-INV-000008" on the tax invoice. */}
            <span>{gstRegistered ? 'Retail Tax Invoice' : 'Retail Bill'} {activeInvoice.invoiceNumber || activeInvoice.id}</span>
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-wait text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
            >
              <Printer className="w-4 h-4" />
              {/* Disabled until the lines land: printing early produced a memo reading
                  "TOTAL ITEMS: 0 MEDICINES" under a correct total. */}
              <span>{loadingLines ? 'Loading items…' : 'Print Cash Memo'}</span>
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
                  {profile?.tagline || 'RETAIL PHARMACY & CLINICAL SUPPLIES'}
                </p>
                <div className="text-[10px] text-slate-600 font-medium mt-1 leading-tight">
                  {formatPharmacyAddress(profile) || '—'}<br />
                  <strong>DL No:</strong> {profile?.dlNumber || '—'}
                  {gstRegistered ? <> | <strong>GSTIN:</strong> {profile?.gstNumber}</> : null}<br />
                  <strong>Phone:</strong> {profile?.phone || '—'} | <strong>Email:</strong> {profile?.email || '—'}
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-extrabold text-[11px] rounded-lg uppercase tracking-wider mb-2 print:bg-slate-200 print:text-black">
                {gstRegistered ? 'RETAIL TAX INVOICE' : 'RETAIL BILL'}
              </span>
              <div className="text-xs font-mono font-extrabold text-slate-900">
                {activeInvoice.invoiceNumber || activeInvoice.id}
              </div>
              <div className="text-[11px] text-slate-600 font-medium mt-1">
                Date: {formatDate(activeInvoice.createdAt)}
              </div>
              <div className="text-[11px] font-bold text-slate-800 uppercase mt-1">
                Payment: {activeInvoice.paymentMethod || 'CASH'}
              </div>
            </div>
          </div>

          {/*
            Patient details.

            Every field is printed whether or not it was filled in — a pharmacy bill is a record
            someone may have to complete by hand afterwards, and a row that disappears when empty
            leaves no space to write in. Blank fields print a rule instead of vanishing.
          */}
          <div className="bg-slate-50 border border-slate-200/90 p-3 rounded-xl mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs print:bg-transparent print:border-slate-300">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">Patient:</span>
              <span className="font-extrabold text-slate-900 text-sm">
                {activeInvoice.customerName || activeInvoice.customer?.name || 'Walk-in Patient'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">Contact:</span>
              <span className="font-semibold text-slate-900 font-mono">
                {activeInvoice.customerPhone || activeInvoice.customer?.phone || <span className="inline-block w-32 border-b border-slate-300" />}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">Dr. Name:</span>
              <span className="font-semibold text-slate-900">
                {activeInvoice.doctorName || <span className="inline-block w-32 border-b border-slate-300" />}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0">Address:</span>
              <span className="font-semibold text-slate-900">
                {activeInvoice.notes || activeInvoice.customer?.address || <span className="inline-block w-40 border-b border-slate-300" />}
              </span>
            </div>
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
                <th className="py-2 px-2 text-center">Pack / Strip</th>
                <th className="py-2 px-2 text-center">Loose / Tab</th>
                <th className="py-2 px-2 text-right">MRP (₹)</th>
                {gstRegistered ? <th className="py-2 px-2 text-right">GST %</th> : null}
                <th className="py-2 px-2 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {items.map((item, idx) => {
                const itemGst = Number(item.taxPercent ?? item.product?.gstPercent ?? 0);
                const unitPrice = Number(item.unitPrice || 0);
                const qty = Number(item.quantity) || 0;
                
                // Line total = exact Qty x Unit MRP, less any per-item discount.
                // A stored zero is treated as missing, not as a genuine free line: the original
                // Firebase import never wrote totalAmount, so 81 legacy rows hold 0 and printed
                // "Rs 0.00" against real quantities while the bill total read correctly.
                const stored = Number(item.totalAmount);
                const discountPercent = Number(item.discountPercent) || 0;
                const lineTotal =
                  Number.isFinite(stored) && stored > 0
                    ? stored
                    : qty * unitPrice * (1 - discountPercent / 100);

                /*
                 * Quantity is stored in content units (tablets). The counter dispenses in whole
                 * packs plus loose units, so the bill shows it the way it was handed over.
                 *
                 * MRP stays the price of a full pack — that is the figure printed on the box and
                 * the one a patient checks against. The amount is what varies with how much was
                 * actually dispensed, so a customer buying 4 loose tablets from a strip of 10
                 * sees the strip's MRP and pays four tenths of it.
                 */
                const packSize = Number(item.product?.packSize) || 1;
                const packs = Math.floor(qty / packSize);
                const loose = qty - packs * packSize;
                const packMrp = Number(item.batch?.mrp) || unitPrice * packSize;

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
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900 font-mono">
                      {packs > 0 ? formatQuantity(packs) : '—'}
                    </td>
                    <td className="py-2 px-2 text-center font-extrabold text-slate-900 font-mono">
                      {loose > 0 ? formatQuantity(loose) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">₹{packMrp.toFixed(2)}</td>
                    {gstRegistered ? <td className="py-2 px-2 text-right font-mono">{itemGst}%</td> : null}
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
                {/* Spans the pack and loose columns; the total is in dispensed units either way. */}
                <td colSpan={2} className="py-2 px-2 text-center font-mono">{formatQuantity(totalQtyCount)}</td>
                <td colSpan={gstRegistered ? 2 : 1} className="py-2 px-2 text-right uppercase text-[11px]">
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
                <p>3. Schedule H &amp; H1 medicines sold against Doctor&apos;s prescription only.</p>
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

              {gstRegistered ? (
                <>
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
                </>
              ) : null}

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

              {/*
                Sign-off sits directly under the net amount, where the eye already is. The
                authorised-signatory rule that used to close the bill has been dropped: nobody
                signs a counter memo, so it printed an empty line on every bill.
              */}
              <div className="pt-2 text-center text-[11px] font-bold text-slate-700">
                Well wishing, {profile?.name || 'AdGen Pharma'}
                {profile?.tagline ? ` - ${profile.tagline}` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
