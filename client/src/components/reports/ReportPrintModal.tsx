'use client';

import { Printer, X, Share2, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Sale, Purchase } from '@/types';
import { useState } from 'react';
import Portal from '@/components/ui/Portal';

interface ReportPrintModalProps {
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  sales: Sale[];
  purchases: Purchase[];
  metrics: {
    totalSalesRevenue: number;
    totalPurchasesCost: number;
    totalOutputGst: number;
    totalInputGst: number;
    netGstPayable: number;
    totalCogs: number;
    netGrossProfit: number;
    profitMarginPercent: number;
    cashSales: number;
    upiSales: number;
    cardSales: number;
    creditSales: number;
    inventoryMrpValue: number;
    inventoryCostValue: number;
  };
  onClose: () => void;
}

export default function ReportPrintModal({
  dateRangeLabel,
  startDate,
  endDate,
  sales,
  purchases,
  metrics,
  onClose,
}: ReportPrintModalProps) {
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const summary = `*ADGEN PHARMACY - OFFICIAL BUSINESS REPORT*\n----------------------------\nPeriod: ${dateRangeLabel} (${startDate} to ${endDate})\n----------------------------\nSales Revenue: ${formatCurrency(metrics.totalSalesRevenue)} (${sales.length} Bills)\nProcurement Cost: ${formatCurrency(metrics.totalPurchasesCost)} (${purchases.length} Invoices)\nGross Profit: ${formatCurrency(metrics.netGrossProfit)} (Margin: ${metrics.profitMarginPercent.toFixed(1)}%)\nNet GST Liability: ${formatCurrency(metrics.netGstPayable)}\n----------------------------\nReport Generated: ${new Date().toLocaleString('en-IN')}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `AdGen ERP Report - ${dateRangeLabel}`,
          text: summary,
          url: window.location.href,
        });
      } catch (e) {
        console.error(e);
      }
    } else {
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Portal>
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col transition-all"
      >
        {/* Top Controls Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Printer className="w-4 h-4 text-emerald-600" />
            <span>Print Official Business Financial Report</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-600" />}
              <span>{copied ? 'Copied Summary' : 'Share WhatsApp'}</span>
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

        {/* Printable Report Content */}
        <div className="print-area p-8 text-slate-900 text-xs font-sans print:p-0 print:text-black flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img src="/logo.png" alt="AdGen Pharmacy" className="h-10 w-auto object-contain" />
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 print:text-black">ADGEN PHARMACY</h1>
                  <p className="text-[10px] text-slate-600 print:text-black font-bold uppercase tracking-wider">OFFICIAL EXECUTIVE BUSINESS FINANCIAL REPORT</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 print:text-black font-medium leading-snug">
                27-A CHANDRA NAGAR, BARFANI DHAM MR-9, INDORE (M.P)<br />
                <strong>DL NO:</strong> 20B/5441/12/2024, 21B/5442/12/2024 | <strong>GSTIN:</strong> 23AAPFA1234F1Z5
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-xs font-extrabold text-emerald-800 print:text-black uppercase">REPORT PERIOD</div>
              <div className="text-sm font-bold text-slate-900 print:text-black mt-0.5">{dateRangeLabel}</div>
              <div className="text-[11px] text-slate-500 print:text-black mt-1">From: {startDate} To: {endDate}</div>
              <div className="text-[10px] text-slate-400 print:text-black mt-1">Generated: {new Date().toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {/* Key KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] text-slate-400 font-bold block uppercase mb-1">TOTAL SALES REVENUE</span>
              <span className="text-base font-extrabold text-slate-900 block">{formatCurrency(metrics.totalSalesRevenue)}</span>
              <span className="text-[10px] text-slate-500 font-sans block mt-0.5">{sales.length} Customer Bills</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] text-slate-400 font-bold block uppercase mb-1">PROCUREMENT COST</span>
              <span className="text-base font-extrabold text-slate-900 block">{formatCurrency(metrics.totalPurchasesCost)}</span>
              <span className="text-[10px] text-slate-500 font-sans block mt-0.5">{purchases.length} Supplier Bills</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] text-slate-400 font-bold block uppercase mb-1">NET GROSS PROFIT</span>
              <span className={`text-base font-extrabold block ${metrics.netGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {formatCurrency(metrics.netGrossProfit)}
              </span>
              <span className="text-[10px] font-sans font-bold text-emerald-700 block mt-0.5">{metrics.profitMarginPercent.toFixed(1)}% Gross Margin</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] text-slate-400 font-bold block uppercase mb-1">NET GST LIABILITY</span>
              <span className="text-base font-extrabold text-rose-600 block">{formatCurrency(metrics.netGstPayable)}</span>
              <span className="text-[10px] font-sans text-slate-500 block mt-0.5">Output - Input ITC</span>
            </div>
          </div>

          {/* Profit & Loss Section */}
          <div className="mb-6">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 pb-1 border-b border-slate-300">
              STATEMENT OF PROFIT & LOSS (P&L)
            </h3>
            <table className="w-full text-left text-xs font-mono">
              <tbody className="divide-y divide-slate-100 font-medium">
                <tr>
                  <td className="py-2 text-slate-700">Gross Sales Revenue</td>
                  <td className="py-2 text-right font-bold text-slate-900">{formatCurrency(metrics.totalSalesRevenue)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">(-) Output GST Liability Collected</td>
                  <td className="py-2 text-right font-bold text-rose-600">-{formatCurrency(metrics.totalOutputGst)}</td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="py-2 px-2 text-slate-900">Net Sales Revenue (excl. GST)</td>
                  <td className="py-2 px-2 text-right text-emerald-800">{formatCurrency(metrics.totalSalesRevenue - metrics.totalOutputGst)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">(-) Real Cost of Goods Sold (COGS)</td>
                  <td className="py-2 text-right font-bold text-rose-600">-{formatCurrency(metrics.totalCogs)}</td>
                </tr>
                <tr className="border-t-2 border-slate-900 font-extrabold text-sm">
                  <td className="py-2.5 text-slate-900">NET GROSS PROFIT</td>
                  <td className={`py-2.5 text-right ${metrics.netGrossProfit >= 0 ? 'text-emerald-800' : 'text-rose-600'}`}>
                    {formatCurrency(metrics.netGrossProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* GST Tax Filing Section */}
          <div className="mb-6">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 pb-1 border-b border-slate-300">
              GST TAX FILING BREAKDOWN (GSTR-1 / GSTR-3B)
            </h3>
            <div className="grid grid-cols-3 gap-3 font-mono text-xs text-center">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold block uppercase">OUTPUT GST LIABILITY</span>
                <span className="font-extrabold text-slate-900 mt-1 block">{formatCurrency(metrics.totalOutputGst)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold block uppercase">INPUT TAX CREDIT (ITC)</span>
                <span className="font-extrabold text-emerald-700 mt-1 block">{formatCurrency(metrics.totalInputGst)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold block uppercase">NET CASH GST PAYABLE</span>
                <span className="font-extrabold text-rose-600 mt-1 block">{formatCurrency(metrics.netGstPayable)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="mb-8">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 pb-1 border-b border-slate-300">
              COLLECTION & PAYMENT METHOD BREAKDOWN
            </h3>
            <div className="grid grid-cols-4 gap-2 font-mono text-xs text-center">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">CASH</span>
                <span className="font-bold text-slate-900 block mt-0.5">{formatCurrency(metrics.cashSales)}</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">UPI / ONLINE</span>
                <span className="font-bold text-sky-700 block mt-0.5">{formatCurrency(metrics.upiSales)}</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">CARD</span>
                <span className="font-bold text-indigo-700 block mt-0.5">{formatCurrency(metrics.cardSales)}</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">CREDIT LEDGER</span>
                <span className="font-bold text-amber-700 block mt-0.5">{formatCurrency(metrics.creditSales)}</span>
              </div>
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="mt-12 pt-8 border-t border-slate-300 flex justify-between items-end text-xs font-medium">
            <div>
              <p className="text-slate-500">Prepared By: Certified Pharmacist / System Admin</p>
              <p className="text-[10px] text-slate-400 mt-0.5">AdGen Pharmacy ERP Management System</p>
            </div>
            <div className="text-right">
              <div className="h-10 w-36 border-b border-slate-400 mb-1"></div>
              <p className="font-bold text-slate-900">Authorized Signature & Stamp</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
