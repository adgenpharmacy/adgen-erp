'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ReportPrintModal from '@/components/reports/ReportPrintModal';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatDate, formatCurrency } from '@/lib/utils';
import { 
  Download, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieIcon, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  FileText,
  AlertTriangle,
  Clock,
  Package,
  Receipt,
  Building2,
  Percent
} from 'lucide-react';

export type TimeRangePreset = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_3_DAYS' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_MONTH' | 'LAST_QUARTER' | 'LAST_YEAR' | 'CUSTOM';

export default function ReportsPage() {
  const { sales: cachedSales, purchases: cachedPurchases, inventory: cachedInventory, refreshData } = useErpData();

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES' | 'PURCHASES' | 'PL' | 'GST' | 'EXPIRY_RISK'>('OVERVIEW');
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('ALL_TIME');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    if (cachedSales?.length > 0) setSales(cachedSales);
    if (cachedPurchases?.length > 0) setPurchases(cachedPurchases);
    if (cachedInventory?.length > 0) setInventory(cachedInventory);
  }, [cachedSales, cachedPurchases, cachedInventory]);

  useEffect(() => {
    Promise.all([
      api.get('/sales').then((r) => setSales(r.data)).catch(() => null),
      api.get('/purchases').then((r) => setPurchases(r.data)).catch(() => null),
      api.get('/inventory').then((r) => setInventory(r.data)).catch(() => null),
    ]).finally(() => {
      setLoading(false);
      refreshData();
    });
  }, []);

  const { startDateObj, endDateObj, rangeLabel } = useMemo(() => {
    const now = new Date();
    let start = new Date(2000, 0, 1);
    let end = new Date(2099, 11, 31);
    let label = 'All Historical Data';
    switch (timePreset) {
      case 'ALL_TIME':
        start = new Date(2000, 0, 1);
        end = new Date(2099, 11, 31);
        label = 'All Time';
        break;
      case 'TODAY': start = new Date(); start.setHours(0, 0, 0, 0); end = new Date(); end.setHours(23, 59, 59, 999); label = 'Today'; break;
      case 'YESTERDAY': start = new Date(); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0); end = new Date(); end.setDate(now.getDate() - 1); end.setHours(23, 59, 59, 999); label = 'Yesterday'; break;
      case 'LAST_3_DAYS': start = new Date(); start.setDate(now.getDate() - 3); start.setHours(0, 0, 0, 0); label = 'Last 3 Days'; break;
      case 'LAST_7_DAYS': start = new Date(); start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); label = 'Last 7 Days'; break;
      case 'LAST_30_DAYS': start = new Date(); start.setDate(now.getDate() - 30); start.setHours(0, 0, 0, 0); label = 'Last 30 Days'; break;
      case 'LAST_MONTH': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); label = 'Last Month'; break;
      case 'LAST_QUARTER': start = new Date(); start.setMonth(now.getMonth() - 3); start.setHours(0, 0, 0, 0); label = 'Last Quarter'; break;
      case 'LAST_YEAR': start = new Date(); start.setFullYear(now.getFullYear() - 1); start.setHours(0, 0, 0, 0); label = 'Last Year'; break;
      case 'CUSTOM':
        if (customStartDate) start = new Date(customStartDate); else start = new Date(2000, 0, 1);
        if (customEndDate) { end = new Date(customEndDate); end.setHours(23, 59, 59, 999); }
        label = 'Custom Range'; break;
    }
    return { startDateObj: start, endDateObj: end, rangeLabel: label };
  }, [timePreset, customStartDate, customEndDate]);

  const filteredSales = useMemo(() => sales.filter((s) => { const d = new Date(s.saleDate || s.createdAt); return d >= startDateObj && d <= endDateObj; }), [sales, startDateObj, endDateObj]);
  const filteredPurchases = useMemo(() => purchases.filter((p) => { const d = new Date(p.purchaseDate || p.createdAt); return d >= startDateObj && d <= endDateObj; }), [purchases, startDateObj, endDateObj]);

  // FEFO Expiry Risk Analytics
  const expiryRiskData = useMemo(() => {
    const now = new Date();
    const list: any[] = [];
    let risk30Val = 0;
    let risk60Val = 0;
    let risk90Val = 0;

    inventory.forEach((inv) => {
      (inv.batches || []).forEach((b: any) => {
        if (b.expiryDate && b.quantity > 0) {
          const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (daysLeft <= 90) {
            const batchVal = b.quantity * (b.mrp || inv.mrp || 0);
            if (daysLeft <= 30) risk30Val += batchVal;
            else if (daysLeft <= 60) risk60Val += batchVal;
            else risk90Val += batchVal;

            list.push({
              productName: inv.productName || inv.name,
              companyName: inv.companyName || 'Generic',
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              daysLeft,
              quantity: b.quantity,
              mrp: b.mrp || inv.mrp || 0,
              totalValue: batchVal,
            });
          }
        }
      });
    });

    list.sort((a, b) => a.daysLeft - b.daysLeft);
    return { list, risk30Val, risk60Val, risk90Val, totalRiskVal: risk30Val + risk60Val + risk90Val };
  }, [inventory]);

  const metrics = useMemo(() => {
    const totalSalesRevenue = filteredSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const totalPurchasesCost = filteredPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const totalOutputGst = filteredSales.reduce((sum, s) => sum + (s.taxTotal || 0), 0);
    const totalInputGst = filteredPurchases.reduce((sum, p) => sum + (p.taxTotal || 0), 0);
    const netGstPayable = Math.max(0, totalOutputGst - totalInputGst);

    const totalDiscounts = filteredSales.reduce((sum, s) => sum + (s.discount || 0), 0);
    const cashSales = filteredSales.filter((s) => s.paymentMethod === 'CASH').reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const upiSales = filteredSales.filter((s) => s.paymentMethod === 'UPI').reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const cardSales = filteredSales.filter((s) => s.paymentMethod === 'CARD').reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const creditSales = filteredSales.filter((s) => s.paymentMethod === 'CREDIT' || s.paymentMethod === 'SPLIT').reduce((sum, s) => sum + (s.creditAmount || s.grandTotal || 0), 0);

    const totalCogs = filteredSales.reduce((sum, s) => {
      if (s.items && s.items.length > 0) {
        const billCogs = s.items.reduce((itemSum: number, item: any) => {
          const pRate = item.batch?.purchaseRate || item.product?.purchaseRate || item.purchaseRate || (item.unitPrice ? item.unitPrice * 0.75 : 0);
          return itemSum + ((item.quantity || 0) * pRate);
        }, 0);
        return sum + billCogs;
      }
      return sum + ((s.grandTotal || 0) * 0.75);
    }, 0);
    const netSalesExclGst = Math.max(0, totalSalesRevenue - totalOutputGst);
    const netGrossProfit = netSalesExclGst - totalCogs;
    const profitMarginPercent = totalSalesRevenue > 0 ? (netGrossProfit / totalSalesRevenue) * 100 : 0;

    return {
      totalDiscounts,
      totalSalesRevenue,
      totalPurchasesCost,
      totalOutputGst,
      totalInputGst,
      netGstPayable,
      totalCogs,
      netSalesExclGst,
      netGrossProfit,
      profitMarginPercent,
      cashSales,
      upiSales,
      cardSales,
      creditSales,
    };
  }, [filteredSales, filteredPurchases]);

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview' },
    { id: 'SALES', label: 'Sales Reports' },
    { id: 'PURCHASES', label: 'Purchase Invoices' },
    { id: 'EXPIRY_RISK', label: 'FEFO Expiry Risk' },
    { id: 'PL', label: 'P&L Statement' },
    { id: 'GST', label: 'GST Tax Filings' },
  ];

  const presets = [
    { id: 'ALL_TIME', label: 'All Time' },
    { id: 'TODAY', label: 'Today' },
    { id: 'LAST_7_DAYS', label: '7 Days' },
    { id: 'LAST_30_DAYS', label: '30 Days' },
    { id: 'LAST_MONTH', label: 'Last Month' },
    { id: 'LAST_QUARTER', label: 'Quarter' },
    { id: 'CUSTOM', label: 'Custom' },
  ];

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reports & Financial Analytics</h1>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {rangeLabel} · {filteredSales.length} sales invoices · {filteredPurchases.length} purchase bills
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs transition"
            >
              <Printer className="w-4 h-4 text-emerald-600" /> Print Report
            </button>
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('adgen_token');
                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
                  const response = await fetch(`${baseUrl}/system/export-data`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (!response.ok) throw new Error('Export failed');
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `AdGen_Pharmacy_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                } catch (err) {
                  alert('Export failed. Please check network/login status.');
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition"
              title="Download complete JSON backup of all sales, purchases, catalog, and inventory"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Export Full Backup
            </button>
          </div>
        </div>

        {/* Preset Timeline & Tabs */}
        <div className="bg-white border border-slate-200/90 p-3 rounded-2xl shadow-xs mb-6 space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => setTimePreset(p.id as TimeRangePreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  timePreset === p.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton type="table" rows={6} />
        ) : (
          <div>
            {/* OVERVIEW TAB */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Sales Revenue</div>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{formatCurrency(metrics.totalSalesRevenue)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">{filteredSales.length} total bills</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Purchases Cost</div>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{formatCurrency(metrics.totalPurchasesCost)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">{filteredPurchases.length} purchase invoices</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Estimated Net Profit</div>
                    <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(metrics.netGrossProfit)}</div>
                    <div className="text-xs text-emerald-700 font-extrabold mt-1">+{metrics.profitMarginPercent.toFixed(1)}% margin</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Net GST Payable</div>
                    <div className="text-2xl font-black font-mono text-indigo-600 mt-1">{formatCurrency(metrics.netGstPayable)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">Output GST − Input ITC</div>
                  </div>
                </div>

                {/* Collection Method Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-emerald-50/60 border border-emerald-200/80 p-4 rounded-2xl">
                    <span className="text-[11px] font-extrabold text-emerald-800 uppercase block">Cash Collections</span>
                    <span className="text-xl font-mono font-black text-emerald-900 mt-1 block">{formatCurrency(metrics.cashSales)}</span>
                  </div>
                  <div className="bg-sky-50/60 border border-sky-200/80 p-4 rounded-2xl">
                    <span className="text-[11px] font-extrabold text-sky-800 uppercase block">UPI / Online</span>
                    <span className="text-xl font-mono font-black text-sky-900 mt-1 block">{formatCurrency(metrics.upiSales)}</span>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-200/80 p-4 rounded-2xl">
                    <span className="text-[11px] font-extrabold text-indigo-800 uppercase block">Card Payments</span>
                    <span className="text-xl font-mono font-black text-indigo-900 mt-1 block">{formatCurrency(metrics.cardSales)}</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200/80 p-4 rounded-2xl">
                    <span className="text-[11px] font-extrabold text-amber-800 uppercase block">Customer Credit</span>
                    <span className="text-xl font-mono font-black text-amber-900 mt-1 block">{formatCurrency(metrics.creditSales)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SALES TAB */}
            {activeTab === 'SALES' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Sales Invoices</span>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{filteredSales.length} Invoices</div>
                  </div>
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Gross Sales Revenue</span>
                    <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(metrics.totalSalesRevenue)}</div>
                  </div>
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Discounts Given</span>
                    <div className="text-2xl font-black font-mono text-rose-600 mt-1">{formatCurrency(metrics.totalDiscounts)}</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span>Sales Invoices ({filteredSales.length})</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Prescribed Doctor</th>
                        <th className="py-3 px-4 text-center">Payment Mode</th>
                        <th className="py-3 px-4 text-right">Items</th>
                        <th className="py-3 px-4 text-right">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {filteredSales.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.invoiceNumber}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{formatDate(s.saleDate || s.createdAt)}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{s.customerName || 'Walk-in Retail'}</td>
                          <td className="py-3 px-4 text-slate-500">{s.doctorName || 'N/A'}</td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span className="px-2.5 py-1 rounded-md text-[10px] bg-slate-100 text-slate-800 uppercase font-mono">
                              {s.paymentMethod || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{s.items?.length || 1}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700">₹{(s.grandTotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PURCHASES TAB */}
            {activeTab === 'PURCHASES' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Purchase Bills</span>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{filteredPurchases.length} Invoices</div>
                  </div>
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Procurement Outflow</span>
                    <div className="text-2xl font-black font-mono text-indigo-600 mt-1">{formatCurrency(metrics.totalPurchasesCost)}</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Purchase Goods Receipt Bills ({filteredPurchases.length})</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Purchase Date</th>
                        <th className="py-3 px-4">Supplier Party</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Items Count</th>
                        <th className="py-3 px-4 text-right">Bill Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {filteredPurchases.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.invoiceNumber}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{formatDate(p.purchaseDate || p.createdAt)}</td>
                          <td className="py-3 px-4 font-extrabold text-slate-900">{p.party?.name || 'Supplier Distributor'}</td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-mono ${p.isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {p.isPaid ? 'PAID CASH' : 'CREDIT DUE'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{p.items?.length || 1}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-indigo-700">₹{(p.grandTotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FEFO EXPIRY RISK TAB */}
            {activeTab === 'EXPIRY_RISK' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl">
                    <div className="text-xs font-extrabold text-rose-700 uppercase tracking-wider">Expiring &lt; 30 Days Risk</div>
                    <div className="text-2xl font-black font-mono text-rose-900 mt-1">{formatCurrency(expiryRiskData.risk30Val)}</div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
                    <div className="text-xs font-extrabold text-amber-700 uppercase tracking-wider">Expiring 30-60 Days Risk</div>
                    <div className="text-2xl font-black font-mono text-amber-900 mt-1">{formatCurrency(expiryRiskData.risk60Val)}</div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl">
                    <div className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider">Total Expiry Capital at Risk</div>
                    <div className="text-2xl font-black font-mono text-emerald-900 mt-1">{formatCurrency(expiryRiskData.totalRiskVal)}</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span>FEFO Expiry Risk Batch Breakdown ({expiryRiskData.list.length} Batches)</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                        <th className="py-3 px-4">Medicine Brand Name</th>
                        <th className="py-3 px-4">Manufacturer</th>
                        <th className="py-3 px-4">Batch Number</th>
                        <th className="py-3 px-4">Expiry Date</th>
                        <th className="py-3 px-4 text-center">Days Remaining</th>
                        <th className="py-3 px-4 text-right">Available Stock</th>
                        <th className="py-3 px-4 text-right">Stock Valuation (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {expiryRiskData.list.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-extrabold text-slate-900">{item.productName}</td>
                          <td className="py-3 px-4 text-slate-500 font-bold">{item.companyName}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{item.batchNumber}</td>
                          <td className="py-3 px-4 font-mono">{formatDate(item.expiryDate)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold ${
                              item.daysLeft <= 30 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {item.daysLeft <= 0 ? 'Expired' : `${item.daysLeft} days`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{item.quantity} Units</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">₹{item.totalValue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* P&L STATEMENT TAB */}
            {activeTab === 'PL' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-6">
                  <div className="border-b border-slate-200 pb-4">
                    <h2 className="text-lg font-black text-slate-900">Statement of Profit & Loss (P&L)</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">Financial performance statement for period {rangeLabel}</p>
                  </div>

                  <table className="w-full text-left border-collapse text-sm">
                    <tbody className="divide-y divide-slate-200 font-medium">
                      <tr>
                        <td className="py-3 text-slate-700 font-bold">Gross Sales Revenue</td>
                        <td className="py-3 text-right font-mono font-extrabold text-slate-900">{formatCurrency(metrics.totalSalesRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-600">(-) Output GST Tax Collected</td>
                        <td className="py-3 text-right font-mono font-bold text-rose-600">-{formatCurrency(metrics.totalOutputGst)}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-3 px-3 text-slate-900">Net Sales Revenue (excl. GST)</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800">{formatCurrency(metrics.netSalesExclGst)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-600">(-) Real Cost of Goods Sold (COGS)</td>
                        <td className="py-3 text-right font-mono font-bold text-rose-600">-{formatCurrency(metrics.totalCogs)}</td>
                      </tr>
                      <tr className="border-t-2 border-slate-900 font-black text-base">
                        <td className="py-4 text-slate-900">ESTIMATED NET GROSS PROFIT</td>
                        <td className={`py-4 text-right font-mono ${metrics.netGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {formatCurrency(metrics.netGrossProfit)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-600 font-bold">Net Gross Margin Percentage</td>
                        <td className="py-3 text-right font-mono font-black text-emerald-700">+{metrics.profitMarginPercent.toFixed(1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* GST TAX FILINGS TAB */}
            {activeTab === 'GST' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Output GST Liability</span>
                    <div className="text-2xl font-black font-mono text-rose-600 mt-1">{formatCurrency(metrics.totalOutputGst)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">GSTR-1 Tax Collected</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Input Tax Credit (ITC)</span>
                    <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(metrics.totalInputGst)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">GSTR-2B Claimed</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Net Cash GST Payable</span>
                    <div className="text-2xl font-black font-mono text-indigo-600 mt-1">{formatCurrency(metrics.netGstPayable)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">GSTR-3B Tax Liability</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                  <h3 className="font-extrabold text-slate-900 text-sm">GSTR-1 & GSTR-3B Tax Liability Summary</h3>
                  <p className="text-xs text-slate-500">Official GST Filing calculations for pharmacy retail sales and supplier procurement.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-700">CGST (Central GST) - 50%</div>
                      <div className="text-lg font-black font-mono text-slate-900">{formatCurrency(metrics.totalOutputGst / 2)}</div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-700">SGST (State GST) - 50%</div>
                      <div className="text-lg font-black font-mono text-slate-900">{formatCurrency(metrics.totalOutputGst / 2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <BottomNav />

      {isPrintModalOpen && (
        <ReportPrintModal
          dateRangeLabel={rangeLabel}
          startDate={startDateObj.toLocaleDateString('en-IN')}
          endDate={endDateObj.toLocaleDateString('en-IN')}
          sales={filteredSales}
          purchases={filteredPurchases}
          metrics={{
            ...metrics,
            inventoryMrpValue: 0,
            inventoryCostValue: 0,
          }}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
}
