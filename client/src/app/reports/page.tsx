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
  Percent,
  Info
} from 'lucide-react';

function FormulaTooltip({ title, formula, note }: { title: string; formula: string; note?: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block ml-1.5 align-middle" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button type="button" className="p-0.5 text-slate-400 hover:text-emerald-600 transition rounded-full focus:outline-none">
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-slate-900 text-white text-[11px] p-3 rounded-2xl shadow-xl z-50 pointer-events-none leading-normal">
          <div className="font-extrabold text-emerald-400 mb-1">{title}</div>
          <div className="font-mono text-[10px] text-slate-200 bg-slate-800 p-2 rounded-xl border border-slate-700/80 mb-1 font-semibold">
            {formula}
          </div>
          {note && <div className="text-[10px] text-slate-400 italic mt-1">{note}</div>}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

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
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
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
      api.get('/returns/sales').then((r) => setSalesReturns(r.data)).catch(() => null),
      api.get('/returns/purchases').then((r) => setPurchaseReturns(r.data)).catch(() => null),
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
  const filteredSalesReturns = useMemo(() => salesReturns.filter((r) => { const d = new Date(r.createdAt); return d >= startDateObj && d <= endDateObj; }), [salesReturns, startDateObj, endDateObj]);
  const filteredPurchaseReturns = useMemo(() => purchaseReturns.filter((r) => { const d = new Date(r.createdAt); return d >= startDateObj && d <= endDateObj; }), [purchaseReturns, startDateObj, endDateObj]);

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
            // batch.quantity is stored in content units (tablets) while MRP is per pack (strip),
            // so the pack size has to be divided out — otherwise risk value is inflated ~packSize times.
            const packSize = inv.packSize || 1;
            const batchVal = b.quantity * ((b.mrp || inv.mrp || 0) / packSize);
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
              mrp: (b.mrp || inv.mrp || 0) / packSize,
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
    // Credit notes reduce what the pharmacy actually earned, so revenue is reported net of them.
    // Previously returns were recorded but never subtracted anywhere, overstating both revenue and profit.
    const totalSalesReturns = filteredSalesReturns.reduce((sum, r) => sum + (r.totalReturnAmount || 0), 0);
    const totalPurchaseReturns = filteredPurchaseReturns.reduce((sum, r) => sum + (r.totalReturnAmount || 0), 0);

    const grossSalesRevenue = filteredSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);
    const totalSalesRevenue = grossSalesRevenue - totalSalesReturns;
    const totalPurchasesCost = filteredPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0) - totalPurchaseReturns;
    // Prefer the line items when deriving GST. Bills imported from the legacy system carry the
    // correct per-item tax rate but a zero header taxTotal, which silently reported ₹0 liability.
    // Retail prices are GST-inclusive, so tax = gross − gross / (1 + rate).
    const gstFromItems = (items: any[], grossOf: (i: any) => number) =>
      (items || []).reduce((sum: number, i: any) => {
        const rate = (parseFloat(i.taxPercent) || 0) / 100;
        if (rate <= 0) return sum;
        const gross = grossOf(i);
        return sum + (gross - gross / (1 + rate));
      }, 0);

    const totalOutputGst = filteredSales.reduce((sum, s) => {
      if ((s.taxTotal || 0) > 0) return sum + s.taxTotal;
      return sum + gstFromItems(s.items, (i) => i.totalAmount || (i.quantity || 0) * (i.unitPrice || 0));
    }, 0);

    // Purchase rates are GST-exclusive, so input tax is added on top of the net line value.
    const totalInputGst = filteredPurchases.reduce((sum, p) => {
      if ((p.taxTotal || 0) > 0) return sum + p.taxTotal;
      return sum + (p.items || []).reduce((s2: number, i: any) => {
        const rate = (parseFloat(i.taxPercent) || 0) / 100;
        if (rate <= 0) return s2;
        const net = (i.quantity || 0) * (i.purchaseRate || 0);
        const disc = net * ((parseFloat(i.discountPercent) || 0) / 100);
        return s2 + (net - disc) * rate;
      }, 0);
    }, 0);
    const netGstPayable = Math.max(0, totalOutputGst - totalInputGst);
    // When input GST exceeds output GST the balance is credit carried forward, not simply zero.
    const inputTaxCreditCarried = Math.max(0, totalInputGst - totalOutputGst);

    const totalDiscounts = filteredSales.reduce((sum, s) => sum + (s.discount || 0), 0);
    // Split bills carry a real amount in each tender column, so bucketing purely by
    // paymentMethod dropped their cash/UPI/card portions and the mix never reconciled to revenue.
    const tenderTotal = (bill: any, field: string, method: string) => {
      if (bill.paymentMethod === 'SPLIT') return bill[field] || 0;
      return bill.paymentMethod === method ? (bill.grandTotal || 0) : 0;
    };

    const cashSales = filteredSales.reduce((sum, s) => sum + tenderTotal(s, 'cashAmount', 'CASH'), 0);
    const upiSales = filteredSales.reduce((sum, s) => sum + tenderTotal(s, 'upiAmount', 'UPI'), 0);
    const cardSales = filteredSales.reduce((sum, s) => sum + tenderTotal(s, 'cardAmount', 'CARD'), 0);
    const creditSales = filteredSales.reduce((sum, s) => sum + tenderTotal(s, 'creditAmount', 'CREDIT'), 0);

    // COGS is only counted where a real purchase rate exists. Estimating a cost (e.g. assuming a
    // flat 25% margin) would make the P&L show a profit figure that was never actually measured.
    let cogsCoveredRevenue = 0;
    let cogsUnknownRevenue = 0;

    const totalCogs = filteredSales.reduce((sum, s) => {
      if (!s.items || s.items.length === 0) {
        cogsUnknownRevenue += s.grandTotal || 0;
        return sum;
      }

      const billCogs = s.items.reduce((itemSum: number, item: any) => {
        const packRate =
          item.batch?.purchaseRate ??
          item.product?.purchaseRate ??
          item.purchaseRate ??
          null;

        const lineRevenue = (item.quantity || 0) * (item.unitPrice || 0);

        if (packRate === null || packRate === undefined || packRate <= 0) {
          cogsUnknownRevenue += lineRevenue;
          return itemSum;
        }

        // purchaseRate is per pack (strip) while item.quantity is in content units (tablets),
        // so it must be converted to a per-unit cost — otherwise COGS is packSize times too big
        // and the P&L reports a large phantom loss.
        const packSize = item.product?.packSize || 1;
        const perUnitCost = packRate / (packSize > 0 ? packSize : 1);

        cogsCoveredRevenue += lineRevenue;
        return itemSum + ((item.quantity || 0) * perUnitCost);
      }, 0);

      return sum + billCogs;
    }, 0);

    const cogsCoveragePercent =
      cogsCoveredRevenue + cogsUnknownRevenue > 0
        ? (cogsCoveredRevenue / (cogsCoveredRevenue + cogsUnknownRevenue)) * 100
        : 100;

    // Goods returned in resalable condition go back into stock, so their cost must come back
    // out of COGS — otherwise netting returns off revenue alone would understate profit.
    const costByProductId = new Map<string, number>();
    inventory.forEach((inv: any) => {
      const packSize = inv.packSize || 1;
      const rate = inv.purchaseRate || 0;
      if (rate > 0) costByProductId.set(inv.productId || inv.id, rate / (packSize > 0 ? packSize : 1));
    });

    const restockedCogs = filteredSalesReturns.reduce((sum, r) => {
      return sum + (r.items || []).reduce((s2: number, i: any) => {
        if (i.condition && i.condition !== 'RESTOCK') return s2;
        const unitCost = costByProductId.get(i.productId) || 0;
        return s2 + (i.quantity || 0) * unitCost;
      }, 0);
    }, 0);
    const netCogs = Math.max(0, totalCogs - restockedCogs);
    const netSalesExclGst = Math.max(0, totalSalesRevenue - totalOutputGst);
    const netGrossProfit = netSalesExclGst - netCogs;
    const profitMarginPercent = totalSalesRevenue > 0 ? (netGrossProfit / totalSalesRevenue) * 100 : 0;

    // Inventory Valuation
    let inventoryMrpValue = 0;
    let inventoryCostValue = 0;
    inventory.forEach((inv) => {
      (inv.batches || []).forEach((b: any) => {
        if (b.quantity > 0) {
          const packSize = inv.packSize || 1;
          inventoryMrpValue += b.quantity * ((b.mrp || inv.mrp || 0) / packSize);
          inventoryCostValue += b.quantity * ((b.purchaseRate || inv.purchaseRate || 0) / packSize);
        }
      });
    });

    return {
      totalDiscounts,
      totalSalesRevenue,
      totalPurchasesCost,
      totalOutputGst,
      totalInputGst,
      netGstPayable,
      inputTaxCreditCarried,
      grossSalesRevenue,
      totalSalesReturns,
      totalPurchaseReturns,
      totalCogs: netCogs,
      cogsCoveragePercent,
      cogsUnknownRevenue,
      netSalesExclGst,
      netGrossProfit,
      profitMarginPercent,
      cashSales,
      upiSales,
      cardSales,
      creditSales,
      inventoryMrpValue,
      inventoryCostValue,
      potentialInventoryProfit: Math.max(0, inventoryMrpValue - inventoryCostValue),
    };
  }, [filteredSales, filteredPurchases, filteredSalesReturns, filteredPurchaseReturns, inventory]);

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

          {timePreset === 'CUSTOM' && (
            <div className="flex items-center gap-3 pt-2 pb-1 border-t border-slate-100 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">From Date:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">To Date:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                  className="text-xs text-rose-600 hover:underline font-extrabold ml-auto"
                >
                  Clear Custom Range
                </button>
              )}
            </div>
          )}

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
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Total Sales Revenue</span>
                      <FormulaTooltip
                        title="Total Sales Revenue"
                        formula="∑ (SalesBill.grandTotal)"
                        note="Sum of net total invoice amounts issued to customers within selected date range (including GST & after discounts)."
                      />
                    </div>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{formatCurrency(metrics.totalSalesRevenue)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">{filteredSales.length} total bills</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Total Purchases Cost</span>
                      <FormulaTooltip
                        title="Total Procurement Cost"
                        formula="∑ (PurchaseBill.grandTotal)"
                        note="Sum of all supplier invoice bill amounts received within selected date range."
                      />
                    </div>
                    <div className="text-2xl font-black font-mono text-slate-900 mt-1">{formatCurrency(metrics.totalPurchasesCost)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">{filteredPurchases.length} purchase invoices</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Estimated Net Profit</span>
                      <FormulaTooltip
                        title="Estimated Net Profit (Gross Profit)"
                        formula="(Total Sales - Output GST) - COGS"
                        note="Net revenue (excluding Output GST collected) minus exact Cost of Goods Sold (COGS) for medicines sold."
                      />
                    </div>
                    <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(metrics.netGrossProfit)}</div>
                    <div className="text-xs text-emerald-700 font-extrabold mt-1 flex items-center justify-between">
                      <span>+{metrics.profitMarginPercent.toFixed(1)}% margin</span>
                      <FormulaTooltip
                        title="Profit Margin Percentage"
                        formula="(Net Profit ÷ Total Sales Revenue) × 100"
                      />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Net GST Payable</span>
                      <FormulaTooltip
                        title="Net GST Tax Liability (GSTR-3B)"
                        formula="Math.max(0, Output GST - Input ITC)"
                        note="Net cash GST liability payable to government after deducting Input Tax Credit (ITC) from Output GST collected."
                      />
                    </div>
                    <div className="text-2xl font-black font-mono text-indigo-600 mt-1">{formatCurrency(metrics.netGstPayable)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">
                      {metrics.inputTaxCreditCarried > 0
                        ? `${formatCurrency(metrics.inputTaxCreditCarried)} input credit carried forward`
                        : 'Output GST − Input ITC'}
                    </div>
                  </div>
                </div>

                {/* Inventory Stock Valuation Card */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-emerald-600" />
                      <h3 className="font-extrabold text-slate-900 text-sm">Store Inventory Capital Valuation</h3>
                    </div>
                    <FormulaTooltip
                      title="Store Inventory Valuation"
                      formula="Valuation at MRP: ∑(Qty × MRP) | Valuation at Cost: ∑(Qty × Purchase Rate)"
                      note="Total capital tied up in active pharmacy medicine batches sitting in stock."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-slate-400 font-extrabold uppercase text-[10px]">Total MRP Stock Value</span>
                      <div className="text-lg font-black font-mono text-slate-900 mt-1">{formatCurrency(metrics.inventoryMrpValue)}</div>
                    </div>
                    <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-slate-400 font-extrabold uppercase text-[10px]">Total Purchase Cost Value</span>
                      <div className="text-lg font-black font-mono text-indigo-700 mt-1">{formatCurrency(metrics.inventoryCostValue)}</div>
                    </div>
                    <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                      <span className="text-emerald-800 font-extrabold uppercase text-[10px]">Potential Profit in Stock</span>
                      <div className="text-lg font-black font-mono text-emerald-800 mt-1">{formatCurrency(metrics.potentialInventoryProfit)}</div>
                    </div>
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
                  <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black text-slate-900">Statement of Profit & Loss (P&L)</h2>
                      <p className="text-xs text-slate-500 font-medium mt-1">Financial performance statement for period {rangeLabel}</p>
                    </div>
                    <FormulaTooltip
                      title="Net Profit & Loss Formula"
                      formula="Net Profit = (Gross Sales - Output GST) - COGS"
                      note="COGS is computed strictly from actual batch purchase rates assigned during inward entry."
                    />
                  </div>

                  <table className="w-full text-left border-collapse text-sm">
                    <tbody className="divide-y divide-slate-200 font-medium">
                      <tr>
                        <td className="py-3 text-slate-700 font-bold flex items-center">
                          <span>Gross Sales Revenue</span>
                          <FormulaTooltip title="Gross Revenue" formula="∑ (SalesBill.grandTotal)" note="All customer sales bills within range, before credit notes." />
                        </td>
                        <td className="py-3 text-right font-mono font-extrabold text-slate-900">{formatCurrency(metrics.grossSalesRevenue)}</td>
                      </tr>
                      {metrics.totalSalesReturns > 0 && (
                        <tr>
                          <td className="py-3 text-slate-600 flex items-center">
                            <span>(-) Sales Returns / Credit Notes</span>
                            <FormulaTooltip title="Sales Returns" formula="∑ (SalesReturn.totalReturnAmount)" note="Goods returned by customers. Restocked items also reduce COGS below." />
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-rose-600">-{formatCurrency(metrics.totalSalesReturns)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-3 text-slate-600 flex items-center">
                          <span>(-) Output GST Tax Collected</span>
                          <FormulaTooltip title="Output GST Liability" formula="∑ (SalesBill.taxTotal)" note="Output tax collected on behalf of govt." />
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-rose-600">-{formatCurrency(metrics.totalOutputGst)}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-3 px-3 text-slate-900 flex items-center">
                          <span>Net Sales Revenue (excl. GST)</span>
                          <FormulaTooltip title="Net Revenue" formula="Gross Sales - Returns - Output GST" note="Real top-line sales income retained by store." />
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800">{formatCurrency(metrics.netSalesExclGst)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-600 flex items-center">
                          <span>(-) Real Cost of Goods Sold (COGS)</span>
                          <FormulaTooltip title="Cost of Goods Sold" formula="∑ (Quantity Sold × Batch Purchase Rate)" note="Exact procurement cost of sold medicine units." />
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-rose-600">-{formatCurrency(metrics.totalCogs)}</td>
                      </tr>
                      {metrics.cogsCoveragePercent < 99.5 && (
                        <tr>
                          <td colSpan={2} className="pb-3">
                            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                              <span>
                                Cost data covers {metrics.cogsCoveragePercent.toFixed(1)}% of sales in this period.{' '}
                                {formatCurrency(metrics.cogsUnknownRevenue)} of revenue has no recorded purchase
                                rate, so profit below is overstated for those items. Add purchase rates to
                                affected products for an exact figure.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-slate-900 font-black text-base">
                        <td className="py-4 text-slate-900 flex items-center">
                          <span>ESTIMATED NET GROSS PROFIT</span>
                          <FormulaTooltip title="Net Gross Profit" formula="Net Sales Revenue (excl. GST) - COGS" />
                        </td>
                        <td className={`py-4 text-right font-mono ${metrics.netGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {formatCurrency(metrics.netGrossProfit)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-600 font-bold flex items-center">
                          <span>Net Gross Margin Percentage</span>
                          <FormulaTooltip title="Margin %" formula="(Gross Profit ÷ Gross Sales) × 100" />
                        </td>
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
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Output GST Liability</span>
                      <FormulaTooltip title="GSTR-1 Tax" formula="∑ (SalesBill.taxTotal)" note="Output tax collected from retail sales." />
                    </div>
                    <div className="text-2xl font-black font-mono text-rose-600 mt-1">{formatCurrency(metrics.totalOutputGst)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">GSTR-1 Tax Collected</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Input Tax Credit (ITC)</span>
                      <FormulaTooltip title="GSTR-2B ITC" formula="∑ (PurchaseBill.taxTotal)" note="Input GST paid to suppliers." />
                    </div>
                    <div className="text-2xl font-black font-mono text-emerald-600 mt-1">{formatCurrency(metrics.totalInputGst)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">GSTR-2B Claimed</div>
                  </div>

                  <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Net Cash GST Payable</span>
                      <FormulaTooltip title="GSTR-3B Liability" formula="Math.max(0, Output GST - Input ITC)" note="Net tax payable to government cash ledger." />
                    </div>
                    <div className="text-2xl font-black font-mono text-indigo-600 mt-1">{formatCurrency(metrics.netGstPayable)}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">
                      {metrics.inputTaxCreditCarried > 0
                        ? `${formatCurrency(metrics.inputTaxCreditCarried)} input credit carried forward`
                        : 'Output GST − Input ITC'}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">GSTR-1 & GSTR-3B Tax Liability Summary</h3>
                      <p className="text-xs text-slate-500">Official GST Filing calculations for pharmacy retail sales and supplier procurement.</p>
                    </div>
                    <FormulaTooltip
                      title="CGST / SGST Tax Split"
                      formula="CGST = Output GST ÷ 2 | SGST = Output GST ÷ 2"
                      note="Intra-state sales split tax 50-50 between Central and State governments."
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>CGST (Central GST) - 50%</span>
                        <FormulaTooltip title="CGST" formula="Output GST × 50%" />
                      </div>
                      <div className="text-lg font-black font-mono text-slate-900">{formatCurrency(metrics.totalOutputGst / 2)}</div>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>SGST (State GST) - 50%</span>
                        <FormulaTooltip title="SGST" formula="Output GST × 50%" />
                      </div>
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
