'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ReportPrintModal from '@/components/reports/ReportPrintModal';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Download, Printer, TrendingUp, TrendingDown, DollarSign, PieChart as PieIcon, ShieldAlert, ArrowUpRight, ArrowDownRight, Layers, FileText } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

export type TimeRangePreset = 'TODAY' | 'YESTERDAY' | 'LAST_3_DAYS' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_MONTH' | 'LAST_QUARTER' | 'LAST_YEAR' | 'CUSTOM';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES' | 'PURCHASES' | 'PL' | 'GST'>('OVERVIEW');
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('LAST_30_DAYS');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/reports/dashboard').then((r) => setDashboardMetrics(r.data)),
      api.get('/sales').then((r) => setSales(r.data)),
      api.get('/purchases').then((r) => setPurchases(r.data)),
      api.get('/inventory').then((r) => setInventory(r.data)),
    ]).catch(console.error).finally(() => setLoading(false));
  }, []);

  const { startDateObj, endDateObj, rangeLabel } = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = 'Last 30 Days';
    switch (timePreset) {
      case 'TODAY': start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); label = 'Today'; break;
      case 'YESTERDAY': start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0); end.setDate(now.getDate() - 1); end.setHours(23, 59, 59, 999); label = 'Yesterday'; break;
      case 'LAST_3_DAYS': start.setDate(now.getDate() - 3); start.setHours(0, 0, 0, 0); label = 'Last 3 Days'; break;
      case 'LAST_7_DAYS': start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); label = 'Last 7 Days'; break;
      case 'LAST_30_DAYS': start.setDate(now.getDate() - 30); start.setHours(0, 0, 0, 0); label = 'Last 30 Days'; break;
      case 'LAST_MONTH': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); label = 'Last Month'; break;
      case 'LAST_QUARTER': start.setMonth(now.getMonth() - 3); start.setHours(0, 0, 0, 0); label = 'Last Quarter'; break;
      case 'LAST_YEAR': start.setFullYear(now.getFullYear() - 1); start.setHours(0, 0, 0, 0); label = 'Last Year'; break;
      case 'CUSTOM':
        if (customStartDate) start = new Date(customStartDate); else start.setDate(now.getDate() - 30);
        if (customEndDate) { end = new Date(customEndDate); end.setHours(23, 59, 59, 999); }
        label = 'Custom Range'; break;
    }
    return { startDateObj: start, endDateObj: end, rangeLabel: label };
  }, [timePreset, customStartDate, customEndDate]);

  const filteredSales = useMemo(() => sales.filter((s) => { const d = new Date(s.saleDate || s.createdAt); return d >= startDateObj && d <= endDateObj; }), [sales, startDateObj, endDateObj]);
  const filteredPurchases = useMemo(() => purchases.filter((p) => { const d = new Date(p.purchaseDate || p.createdAt); return d >= startDateObj && d <= endDateObj; }), [purchases, startDateObj, endDateObj]);

  // Comprehensive Detailed Financial Metrics & Profit Calculations
  const metrics = useMemo(() => {
    const totalSalesRevenue = filteredSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const totalPurchasesCost = filteredPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const totalOutputGst = filteredSales.reduce((sum, s) => sum + (s.taxTotal || 0), 0);
    const totalInputGst = filteredPurchases.reduce((sum, p) => sum + (p.taxTotal || 0), 0);
    const netGstPayable = Math.max(0, totalOutputGst - totalInputGst);

    // Total Discounts Given (Item-level discounts + Bill level discounts)
    const totalDiscounts = filteredSales.reduce((sum, s) => {
      const itemDiscounts = s.items?.reduce((idSum: number, item: any) => {
        const packSize = item.product?.packSize || 1;
        const gross = item.quantity * (item.unitPrice || (item.mrp ? item.mrp / packSize : 0));
        const disc = gross * ((item.discountPercent || 0) / 100);
        return idSum + disc;
      }, 0) || 0;
      return sum + (s.discount || 0) + itemDiscounts;
    }, 0);

    const cashSales = filteredSales.filter((s) => s.paymentMethod === 'CASH').reduce((sum, s) => sum + s.grandTotal, 0);
    const upiSales = filteredSales.filter((s) => s.paymentMethod === 'UPI').reduce((sum, s) => sum + s.grandTotal, 0);
    const cardSales = filteredSales.filter((s) => s.paymentMethod === 'CARD').reduce((sum, s) => sum + s.grandTotal, 0);
    const creditSales = filteredSales.filter((s) => s.paymentMethod === 'CREDIT').reduce((sum, s) => sum + s.grandTotal, 0);

    // Detailed COGS Calculation via Batch Purchase Rates
    let exactCogsCount = 0;
    let estimatedCogsCount = 0;

    const totalCogs = filteredSales.reduce((sum, s) => {
      const billCogs = s.items?.reduce((itemSum: number, item: any) => {
        const packSize = item.product?.packSize || 1;
        if (item.batch?.purchaseRate) {
          exactCogsCount++;
          const unitCost = item.batch.purchaseRate / packSize;
          return itemSum + (item.quantity * unitCost);
        } else {
          estimatedCogsCount++;
          const unitCost = item.unitPrice ? (item.unitPrice * 0.7) : 0;
          return itemSum + (item.quantity * unitCost);
        }
      }, 0) || (s.grandTotal * 0.7);
      return sum + billCogs;
    }, 0);

    const grossBilledSales = totalSalesRevenue + totalDiscounts;
    const netSalesExclGst = Math.max(0, totalSalesRevenue - totalOutputGst);
    const netGrossProfit = netSalesExclGst - totalCogs;
    const profitMarginPercent = totalSalesRevenue > 0 ? (netGrossProfit / totalSalesRevenue) * 100 : 0;

    return {
      grossBilledSales,
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
      exactCogsCount,
      estimatedCogsCount,
      cashSales,
      upiSales,
      cardSales,
      creditSales,
      inventoryMrpValue: dashboardMetrics?.inventoryMrpValue || 0,
      inventoryCostValue: dashboardMetrics?.inventoryCostValue || 0,
      potentialStockMargin: Math.max(0, (dashboardMetrics?.inventoryMrpValue || 0) - (dashboardMetrics?.inventoryCostValue || 0)),
    };
  }, [filteredSales, filteredPurchases, dashboardMetrics]);

  // Invoice-level Profitability Analysis Data
  const invoiceProfitabilityData = useMemo(() => {
    return filteredSales.map((s) => {
      const invRevenue = s.grandTotal || 0;
      const invGst = s.taxTotal || 0;
      const invRevenueExclGst = Math.max(0, invRevenue - invGst);

      const invCogs = s.items?.reduce((itemSum: number, item: any) => {
        const packSize = item.product?.packSize || 1;
        const unitCost = item.batch?.purchaseRate ? (item.batch.purchaseRate / packSize) : (item.unitPrice * 0.7);
        return itemSum + (item.quantity * unitCost);
      }, 0) || (invRevenue * 0.7);

      const invProfit = invRevenueExclGst - invCogs;
      const invMarginPercent = invRevenue > 0 ? (invProfit / invRevenue) * 100 : 0;

      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName || s.customer?.name || 'Walk-in',
        date: s.saleDate || s.createdAt,
        paymentMethod: s.paymentMethod,
        revenue: invRevenue,
        gst: invGst,
        netRevenue: invRevenueExclGst,
        cogs: invCogs,
        profit: invProfit,
        marginPercent: invMarginPercent,
      };
    });
  }, [filteredSales]);

  const chartTrendData = useMemo(() => {
    const dailyMap: { [dateStr: string]: { date: string; Sales: number; Purchases: number; Profit: number } } = {};
    const current = new Date(startDateObj);
    while (current <= endDateObj) { const dateKey = current.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); dailyMap[dateKey] = { date: dateKey, Sales: 0, Purchases: 0, Profit: 0 }; current.setDate(current.getDate() + 1); }
    filteredSales.forEach((s) => {
      const dKey = new Date(s.saleDate || s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (dailyMap[dKey]) {
        const rev = s.grandTotal || 0;
        const gst = s.taxTotal || 0;
        const cogs = s.items?.reduce((sum: number, i: any) => sum + (i.quantity * (i.batch?.purchaseRate ? i.batch.purchaseRate / (i.product?.packSize || 1) : i.unitPrice * 0.7)), 0) || (rev * 0.7);
        dailyMap[dKey].Sales += rev;
        dailyMap[dKey].Profit += (rev - gst - cogs);
      }
    });
    filteredPurchases.forEach((p) => { const dKey = new Date(p.purchaseDate || p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); if (dailyMap[dKey]) { dailyMap[dKey].Purchases += p.grandTotal || 0; } });
    return Object.values(dailyMap);
  }, [filteredSales, filteredPurchases, startDateObj, endDateObj]);

  const paymentChartData = useMemo(() => [
    { name: 'Cash', value: metrics.cashSales, color: '#10B981' },
    { name: 'UPI', value: metrics.upiSales, color: '#6B7280' },
    { name: 'Card', value: metrics.cardSales, color: '#374151' },
    { name: 'Credit', value: metrics.creditSales, color: '#D97706' },
  ], [metrics]);

  const exportReportsCSV = () => {
    const csvRows = [
      ['ADGEN PHARMACY ERP - DETAILED PROFIT & COST REPORT'], ['Period', rangeLabel],
      ['Range', `${startDateObj.toLocaleDateString('en-IN')} to ${endDateObj.toLocaleDateString('en-IN')}`],
      ['Export Date', new Date().toLocaleString('en-IN')], [''],
      ['Metric', 'Amount (INR)'],
      ['Gross Billed Sales', metrics.grossBilledSales.toFixed(2)],
      ['Discounts Allowed', metrics.totalDiscounts.toFixed(2)],
      ['Net Sales Revenue (Incl GST)', metrics.totalSalesRevenue.toFixed(2)],
      ['Output GST Collected', metrics.totalOutputGst.toFixed(2)],
      ['Net Sales Revenue (Excl GST)', metrics.netSalesExclGst.toFixed(2)],
      ['Cost of Goods Sold (COGS Batch Cost)', metrics.totalCogs.toFixed(2)],
      ['Net Gross Profit', metrics.netGrossProfit.toFixed(2)],
      ['Gross Profit Margin %', `${metrics.profitMarginPercent.toFixed(2)}%`],
      ['Total Stock Cost Value', metrics.inventoryCostValue.toFixed(2)],
      ['Total Stock MRP Value', metrics.inventoryMrpValue.toFixed(2)],
      ['Unrealized Inventory Profit', metrics.potentialStockMargin.toFixed(2)],
      [''], ['Payment Method Breakdown', 'Amount (INR)'],
      ['Cash Sales', metrics.cashSales.toFixed(2)], ['UPI Sales', metrics.upiSales.toFixed(2)],
      ['Card Sales', metrics.cardSales.toFixed(2)], ['Credit Sales', metrics.creditSales.toFixed(2)],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Report_Profit_${timePreset}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview' }, { id: 'SALES', label: 'Sales' },
    { id: 'PURCHASES', label: 'Purchases' }, { id: 'PL', label: 'P&L & Detailed Costing' }, { id: 'GST', label: 'GST' },
  ];

  const presets = [
    { id: 'TODAY', label: 'Today' }, { id: 'YESTERDAY', label: 'Yesterday' },
    { id: 'LAST_3_DAYS', label: '3 Days' }, { id: 'LAST_7_DAYS', label: '7 Days' },
    { id: 'LAST_30_DAYS', label: '30 Days' }, { id: 'LAST_MONTH', label: 'Last Month' },
    { id: 'LAST_QUARTER', label: 'Quarter' }, { id: 'LAST_YEAR', label: 'Year' },
    { id: 'CUSTOM', label: 'Custom' },
  ];

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Reports & Profit Analytics</h1>
              <p className="text-xs text-gray-500 mt-0.5">{rangeLabel} · {filteredSales.length} sales · {filteredPurchases.length} purchases</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsPrintModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button onClick={exportReportsCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Timeline + Tabs */}
          <div className="px-6 pb-3 space-y-2">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {presets.map((p) => (
                <button key={p.id} onClick={() => setTimePreset(p.id as TimeRangePreset)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${timePreset === p.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {timePreset === 'CUSTOM' && (
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">From:</span>
                  <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">To:</span>
                  <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 border-t border-gray-100 pt-2">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${activeTab === tab.id ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {/* OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* KPI Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {[
                  { label: 'Sales Revenue', value: formatCurrency(metrics.totalSalesRevenue), sub: `${filteredSales.length} invoices` },
                  { label: 'Purchases', value: formatCurrency(metrics.totalPurchasesCost), sub: `${filteredPurchases.length} bills` },
                  { label: 'Net Profit', value: formatCurrency(metrics.netGrossProfit), sub: `${metrics.profitMarginPercent.toFixed(1)}% margin`, color: metrics.netGrossProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
                  { label: 'GST Payable', value: formatCurrency(metrics.netGstPayable), sub: 'Output - Input ITC' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white p-4">
                    <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{kpi.label}</div>
                    <div className={`text-xl font-bold font-mono mt-1 ${kpi.color || 'text-gray-900'}`}>{kpi.value}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 border border-gray-200 rounded-lg p-5 bg-white">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Revenue & Profit Trend</h3>
                  <p className="text-[11px] text-gray-400 mb-4">{rangeLabel}</p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                        <Tooltip formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                          contentStyle={{ backgroundColor: '#111827', borderRadius: '6px', color: '#fff', fontSize: '11px', border: 'none' }} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Area type="monotone" dataKey="Sales" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                        <Area type="monotone" dataKey="Profit" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-5 bg-white flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Collection Split</h3>
                    <p className="text-[11px] text-gray-400 mb-3">Payment method breakdown</p>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentChartData.filter((d) => d.value > 0)} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                            {paymentChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                          </Pie>
                          <Tooltip formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Total']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs mt-3">
                    {paymentChartData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-600">{item.name}</span>
                        </div>
                        <span className="font-mono font-medium text-gray-900">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SALES TAB */}
          {activeTab === 'SALES' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {[
                  { label: 'Cash', value: formatCurrency(metrics.cashSales) },
                  { label: 'UPI', value: formatCurrency(metrics.upiSales) },
                  { label: 'Card', value: formatCurrency(metrics.cardSales) },
                  { label: 'Credit', value: formatCurrency(metrics.creditSales) },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white p-4">
                    <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{kpi.label}</div>
                    <div className="text-lg font-bold font-mono text-gray-900 mt-1">{kpi.value}</div>
                  </div>
                ))}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">Sales Register ({filteredSales.length})</div>
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase hidden sm:table-cell">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase hidden md:table-cell">Payment</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">GST</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSales.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">#{s.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{s.customerName || s.customer?.name || 'Walk-in'}</td>
                        <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{formatDate(s.saleDate || s.createdAt)}</td>
                        <td className="px-4 py-2.5 hidden md:table-cell"><span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{s.paymentMethod}</span></td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-500">{formatCurrency(s.taxTotal)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(s.grandTotal)}</td>
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
              <div className="border border-gray-200 rounded-lg p-5 bg-white">
                <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Total Procurement</div>
                <div className="text-2xl font-bold font-mono text-gray-900 mt-1">{formatCurrency(metrics.totalPurchasesCost)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{filteredPurchases.length} invoices · {rangeLabel}</div>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-left text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Supplier</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase hidden sm:table-cell">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase hidden md:table-cell">Status</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">GST</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">{p.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{p.party?.name || 'Supplier'}</td>
                        <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{formatDate(p.purchaseDate || p.createdAt)}</td>
                        <td className="px-4 py-2.5 hidden md:table-cell"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${p.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{p.isPaid ? 'Paid' : 'Credit'}</span></td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-500">{formatCurrency(p.taxTotal)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{formatCurrency(p.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PROFIT & LOSS & DETAILED COSTING TAB */}
          {activeTab === 'PL' && (
            <div className="space-y-6">
              {/* Top Highlights Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                <div className="bg-white p-4">
                  <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Gross Billed Sales</div>
                  <div className="text-xl font-bold font-mono text-gray-900 mt-1">{formatCurrency(metrics.grossBilledSales)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Pre-discount total</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Discounts Given</div>
                  <div className="text-xl font-bold font-mono text-amber-600 mt-1">−{formatCurrency(metrics.totalDiscounts)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Item & scheme discounts</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Total COGS Cost</div>
                  <div className="text-xl font-bold font-mono text-red-600 mt-1">−{formatCurrency(metrics.totalCogs)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Batch purchase cost</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Net Profit</div>
                  <div className={`text-xl font-bold font-mono mt-1 ${metrics.netGrossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(metrics.netGrossProfit)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium mt-0.5">{metrics.profitMarginPercent.toFixed(1)}% margin</div>
                </div>
              </div>

              {/* Detailed Calculation Walkthrough Table */}
              <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Profit & Loss Calculation Walkthrough</h2>
                  <p className="text-[11px] text-gray-400">Step-by-step formula breakdown for {rangeLabel}</p>
                </div>

                <div className="border border-gray-200 rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase">Calculation Step</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase">Formula / Explanation</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="px-4 py-3 font-medium text-gray-900">1. Gross Billed Sales (MRP / List Price)</td>
                        <td className="px-4 py-3 text-gray-500">Total value before any discounts</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">{formatCurrency(metrics.grossBilledSales)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-gray-900">2. Less: Discounts Allowed</td>
                        <td className="px-4 py-3 text-gray-500">Item-level discounts + Overall invoice discounts</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-amber-600">−{formatCurrency(metrics.totalDiscounts)}</td>
                      </tr>
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-4 py-3 text-gray-900">3. Realized Sales Revenue (Incl. GST)</td>
                        <td className="px-4 py-3 text-gray-500">Actual amount collected from customers</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900 font-semibold">{formatCurrency(metrics.totalSalesRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-gray-900">4. Less: Output GST Liability</td>
                        <td className="px-4 py-3 text-gray-500">GST tax collected (Pass-through to Tax Dept)</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-red-600">−{formatCurrency(metrics.totalOutputGst)}</td>
                      </tr>
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-4 py-3 text-gray-900">5. Net Operating Revenue (Excl. Tax)</td>
                        <td className="px-4 py-3 text-gray-500">Net revenue retained by pharmacy</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900 font-semibold">{formatCurrency(metrics.netSalesExclGst)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-gray-900">6. Less: Cost of Goods Sold (COGS)</td>
                        <td className="px-4 py-3 text-gray-500">
                          Exact batch purchase cost of sold medicine items
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-red-600">−{formatCurrency(metrics.totalCogs)}</td>
                      </tr>
                      <tr className="border-t-2 border-gray-900 bg-gray-50 font-bold">
                        <td className="px-4 py-3.5 text-gray-900 text-sm">7. NET OPERATING PROFIT</td>
                        <td className="px-4 py-3.5 text-gray-600 text-xs">Net Operating Revenue − COGS</td>
                        <td className={`px-4 py-3.5 text-right font-mono text-base ${metrics.netGrossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(metrics.netGrossProfit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-md text-xs font-mono">
                  <span className="text-gray-600">Net Profit Margin % = (Net Operating Profit / Realized Revenue) × 100</span>
                  <span className="font-bold text-gray-900 text-sm">{metrics.profitMarginPercent.toFixed(2)}%</span>
                </div>
              </div>

              {/* Stock Inventory Asset Valuation */}
              <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Active Inventory Asset Valuation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <span className="text-[11px] text-gray-400 font-sans block">Stock MRP Value</span>
                    <span className="text-base font-semibold text-gray-900 block mt-1">{formatCurrency(metrics.inventoryMrpValue)}</span>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <span className="text-[11px] text-gray-400 font-sans block">Stock Purchase Cost Value</span>
                    <span className="text-base font-semibold text-gray-900 block mt-1">{formatCurrency(metrics.inventoryCostValue)}</span>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <span className="text-[11px] text-gray-400 font-sans block">Unrealized Stock Margin</span>
                    <span className="text-base font-semibold text-emerald-600 block mt-1">{formatCurrency(metrics.potentialStockMargin)}</span>
                  </div>
                </div>
              </div>

              {/* Invoice-by-Invoice Profitability Audit Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                  Invoice-by-Invoice Profitability Audit ({invoiceProfitabilityData.length} Invoices)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase">Invoice</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">GST</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">COGS</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">Profit</th>
                        <th className="px-4 py-2.5 font-semibold text-gray-500 uppercase text-right">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoiceProfitabilityData.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">No invoices in this period</td></tr>
                      ) : (
                        invoiceProfitabilityData.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">#{inv.invoiceNumber}</td>
                            <td className="px-4 py-2.5 text-gray-900 font-medium">{inv.customerName}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-900">{formatCurrency(inv.revenue)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-500">{formatCurrency(inv.gst)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-red-600">{formatCurrency(inv.cogs)}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${inv.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(inv.profit)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-700">
                              {inv.marginPercent.toFixed(1)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* GST TAB */}
          {activeTab === 'GST' && (
            <div className="border border-gray-200 rounded-lg p-6 bg-white space-y-6">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">GST Filing Summary</h2>
                <p className="text-[11px] text-gray-400">GSTR-1 & GSTR-3B · {rangeLabel}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {[
                  { label: 'Output GST (Sales)', value: formatCurrency(metrics.totalOutputGst), sub: 'Tax collected on sales' },
                  { label: 'Input ITC (Purchases)', value: formatCurrency(metrics.totalInputGst), sub: 'Tax paid on purchases', color: 'text-emerald-600' },
                  { label: 'Net GST Payable', value: formatCurrency(metrics.netGstPayable), sub: 'Payable to govt', color: 'text-red-600' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white p-5">
                    <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{kpi.label}</div>
                    <div className={`text-xl font-bold font-mono mt-1.5 ${kpi.color || 'text-gray-900'}`}>{kpi.value}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {isPrintModalOpen && (
          <ReportPrintModal dateRangeLabel={rangeLabel} startDate={startDateObj.toLocaleDateString('en-IN')} endDate={endDateObj.toLocaleDateString('en-IN')}
            sales={filteredSales} purchases={filteredPurchases} metrics={metrics} onClose={() => setIsPrintModalOpen(false)} />
        )}
      </main>
      <BottomNav />
    </div>
  );
}
