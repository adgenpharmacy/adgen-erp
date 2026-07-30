'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import ReportPrintModal from '@/components/reports/ReportPrintModal';
import { TableSkeleton, Button, Card, PageHeader, useToast } from '@/components/ui';
import PageMain from '@/components/layout/PageMain';
import type {
  Sale, SaleItem, Purchase, PurchaseItem, InventoryItem, ReturnRecord, ReturnItem,
} from '@/types';

/** One row of the FEFO expiry-risk table. */
interface ExpiryRiskRow {
  productName: string;
  companyName: string;
  batchNumber: string;
  expiryDate: string;
  daysLeft: number;
  quantity: number;
  /** Per content unit, i.e. pack MRP divided by pack size. */
  mrp: number;
  totalValue: number;
}
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { 
  Download, 
  Printer, 
  AlertTriangle,
  Package,
  Receipt,
  Building2,
  Info
} from 'lucide-react';

function FormulaTooltip({ title, formula, note }: { title: string; formula: string; note?: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block ml-1.5 align-middle" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button type="button" className="p-0.5 text-fg-subtle hover:text-brand transition rounded-full focus:outline-none">
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-slate-900 text-white text-[11px] p-3 rounded-lg shadow-xl z-50 pointer-events-none leading-normal">
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

const METRIC_TONES = {
  fg: { bar: 'bg-fg-subtle', value: 'text-fg' },
  brand: { bar: 'bg-brand', value: 'text-brand' },
  accent: { bar: 'bg-accent', value: 'text-accent' },
  warn: { bar: 'bg-warn', value: 'text-warn' },
  danger: { bar: 'bg-danger', value: 'text-danger' },
} as const;

/** Reports KPI tile — same shape as the shared StatCard, plus a formula explainer. */
function MetricCard({
  label,
  value,
  sublabel,
  tone = 'fg',
  tooltip,
  sublabelTooltip,
}: {
  label: string;
  value: string;
  sublabel?: React.ReactNode;
  tone?: keyof typeof METRIC_TONES;
  tooltip?: { title: string; formula: string; note?: string };
  sublabelTooltip?: { title: string; formula: string; note?: string };
}) {
  const t = METRIC_TONES[tone];
  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
          {tooltip ? <FormulaTooltip {...tooltip} /> : null}
        </div>
        <div data-metric className={cn('mt-3 truncate font-mono text-2xl font-extrabold tracking-tight', t.value)}>
          {value}
        </div>
        {sublabel ? (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span className="truncate">{sublabel}</span>
            {sublabelTooltip ? <FormulaTooltip {...sublabelTooltip} /> : null}
          </div>
        ) : null}
      </div>
      <div className={cn('h-[3px]', t.bar)} aria-hidden />
    </div>
  );
}

/**
 * Last complete set of report data, kept for the browsing session.
 *
 * Module scope rather than state: it has to outlive the component so that leaving Reports and
 * coming back does not repeat five full-detail reads. Cleared by a page reload, which is the
 * point at which everything else is refetched anyway.
 */
let reportsCache: {
  sales: Sale[];
  purchases: Purchase[];
  inventory: InventoryItem[];
  salesReturns: ReturnRecord[];
  purchaseReturns: ReturnRecord[];
  at: number;
} | null = null;

export default function ReportsPage() {
  const toast = useToast();
  const { inventory: cachedInventory } = useErpData();

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES' | 'PURCHASES' | 'PL' | 'GST' | 'EXPIRY_RISK'>('OVERVIEW');
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('ALL_TIME');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [salesReturns, setSalesReturns] = useState<ReturnRecord[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  /*
   * A failed fetch used to leave the arrays empty, so a network error rendered as a confident
   * "Rs 0.00" across every card — indistinguishable from a day with no trade. Financial
   * figures must never present a failure as a real number.
   */
  const [loadFailed, setLoadFailed] = useState<string[]>([]);

  /*
   * Only inventory is seeded from the shared context.
   *
   * The context fetches sales and purchases with `?summary=1`, which omits the lines. Seeding
   * from it made every bill look like it had no items, so COGS computed as zero and the page
   * flashed an inflated net profit until this page's own full fetch replaced it. Reports must
   * wait for data that actually carries the lines.
   */
  useEffect(() => {
    if (cachedInventory?.length > 0) setInventory(cachedInventory);
  }, [cachedInventory]);

  /*
   * Reports needs five full-detail lists, which are the heaviest reads in the app. They are held
   * for the rest of the browsing session so coming back to this screen — or flipping between its
   * tabs and date presets — is instant instead of paying for all five again. The copy on screen
   * is refreshed in the background every visit, so it is never more than one visit out of date.
   *
   * It also used to call refreshData() afterwards, adding the shared context's eight requests on
   * top of its own five. Nothing here reads that data; the call is gone.
   */
  useEffect(() => {
    const cached = reportsCache;
    if (cached) {
      setSales(cached.sales);
      setPurchases(cached.purchases);
      setInventory(cached.inventory);
      setSalesReturns(cached.salesReturns);
      setPurchaseReturns(cached.purchaseReturns);
      setLoading(false);
    }

    const failures: string[] = [];
    Promise.all([
      api.get<Sale[]>('/sales').then((r) => r.data).catch(() => { failures.push('Sales'); return null; }),
      api.get<Purchase[]>('/purchases').then((r) => r.data).catch(() => { failures.push('Purchases'); return null; }),
      api.get<InventoryItem[]>('/inventory').then((r) => r.data).catch(() => { failures.push('Inventory'); return null; }),
      api.get<ReturnRecord[]>('/returns/sales').then((r) => r.data).catch(() => { failures.push('Sales returns'); return null; }),
      api.get<ReturnRecord[]>('/returns/purchases').then((r) => r.data).catch(() => { failures.push('Purchase returns'); return null; }),
    ]).then(([s, p, inv, sr, pr]) => {
      if (s) setSales(s);
      if (p) setPurchases(p);
      if (inv) setInventory(inv);
      if (sr) setSalesReturns(sr);
      if (pr) setPurchaseReturns(pr);
      setLoadFailed(failures);

      // Only cache a complete set — a half-loaded one would be served as fact on the next visit.
      if (s && p && inv && sr && pr) {
        reportsCache = { sales: s, purchases: p, inventory: inv, salesReturns: sr, purchaseReturns: pr, at: Date.now() };
      }
    }).finally(() => {
      setLoading(false);
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

  const filteredSales = useMemo(() => sales.filter((s) => { const d = new Date(s.createdAt); return d >= startDateObj && d <= endDateObj; }), [sales, startDateObj, endDateObj]);
  const filteredPurchases = useMemo(() => purchases.filter((p) => { const d = new Date(p.purchaseDate || p.createdAt); return d >= startDateObj && d <= endDateObj; }), [purchases, startDateObj, endDateObj]);
  const filteredSalesReturns = useMemo(() => salesReturns.filter((r) => { const d = new Date(r.createdAt); return d >= startDateObj && d <= endDateObj; }), [salesReturns, startDateObj, endDateObj]);
  const filteredPurchaseReturns = useMemo(() => purchaseReturns.filter((r) => { const d = new Date(r.createdAt); return d >= startDateObj && d <= endDateObj; }), [purchaseReturns, startDateObj, endDateObj]);

  // FEFO Expiry Risk Analytics
  const expiryRiskData = useMemo(() => {
    const now = new Date();
    const list: ExpiryRiskRow[] = [];
    let risk30Val = 0;
    let risk60Val = 0;
    let risk90Val = 0;

    inventory.forEach((inv) => {
      (inv.batches || []).forEach((b) => {
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
    const gstFromItems = (items: SaleItem[] | undefined, grossOf: (i: SaleItem) => number) =>
      (items || []).reduce((sum: number, i: SaleItem) => {
        const rate = (i.taxPercent || 0) / 100;
        if (rate <= 0) return sum;
        const gross = grossOf(i);
        return sum + (gross - gross / (1 + rate));
      }, 0);

    // A bill-level discount is money never collected, so no GST is due on it — the fallback
    // scales the lines down by the same ratio the bill's own total was reduced by.
    const grossOutputGst = filteredSales.reduce((sum, s) => {
      if ((s.taxTotal || 0) > 0) return sum + s.taxTotal;
      const lineSum = (s.items || []).reduce(
        (t: number, i: SaleItem) => t + (i.totalAmount || (i.quantity || 0) * (i.unitPrice || 0)),
        0
      );
      const discountRatio = lineSum > 0 ? Math.max(0, lineSum - (s.discount || 0)) / lineSum : 1;
      return sum + gstFromItems(s.items, (i) => i.totalAmount || (i.quantity || 0) * (i.unitPrice || 0)) * discountRatio;
    }, 0);

    /*
     * A credit note reverses the sale, including the tax charged on it. Revenue was already
     * reported net of returns while output GST was not, so the tax inside a returned item was
     * counted as a liability the shop no longer owes — and net revenue lost it twice.
     *
     * The rate comes from the line the goods were originally sold on, falling back to the
     * product's configured rate for a return with no matching sale line.
     */
    const saleRateByProduct = new Map<string, number>();
    filteredSales.forEach((s) => {
      (s.items || []).forEach((i: SaleItem) => {
        const rate = i.taxPercent ?? i.product?.gstPercent ?? 0;
        if (rate > 0) saleRateByProduct.set(i.productId, rate);
      });
    });

    const returnedGst = filteredSalesReturns.reduce((sum, r) => {
      return sum + (r.items || []).reduce((s2: number, i: ReturnItem) => {
        const rate = (saleRateByProduct.get(i.productId) || 0) / 100;
        if (rate <= 0) return s2;
        const gross = i.totalAmount || (i.quantity || 0) * (i.unitPrice || 0);
        return s2 + (gross - gross / (1 + rate));
      }, 0);
    }, 0);

    const totalOutputGst = Math.max(0, grossOutputGst - returnedGst);

    // Purchase rates are GST-exclusive, so input tax is added on top of the net line value.
    const totalInputGst = filteredPurchases.reduce((sum, p) => {
      if ((p.taxTotal || 0) > 0) return sum + p.taxTotal;
      return sum + (p.items || []).reduce((s2: number, i: PurchaseItem) => {
        const rate = (i.taxPercent || 0) / 100;
        if (rate <= 0) return s2;
        const net = (i.quantity || 0) * (i.purchaseRate || 0);
        const disc = net * ((i.discountPercent || 0) / 100);
        return s2 + (net - disc) * rate;
      }, 0);
    }, 0);
    const netGstPayable = Math.max(0, totalOutputGst - totalInputGst);
    // When input GST exceeds output GST the balance is credit carried forward, not simply zero.
    const inputTaxCreditCarried = Math.max(0, totalInputGst - totalOutputGst);

    const totalDiscounts = filteredSales.reduce((sum, s) => sum + (s.discount || 0), 0);
    // Split bills carry a real amount in each tender column, so bucketing purely by
    // paymentMethod dropped their cash/UPI/card portions and the mix never reconciled to revenue.
    const tenderTotal = (
      bill: Sale,
      field: 'cashAmount' | 'upiAmount' | 'cardAmount' | 'creditAmount',
      method: string
    ) => {
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

      const billCogs = s.items.reduce((itemSum: number, item: SaleItem) => {
        // SalesBillItem stores no purchase rate of its own; cost comes from the batch it was
        // sold from, falling back to the product's default pack rate.
        const packRate = item.batch?.purchaseRate ?? item.product?.purchaseRate ?? null;

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
    inventory.forEach((inv) => {
      const packSize = inv.packSize || 1;
      const rate = inv.purchaseRate || 0;
      if (rate > 0) costByProductId.set(inv.productId || inv.id, rate / (packSize > 0 ? packSize : 1));
    });

    const restockedCogs = filteredSalesReturns.reduce((sum, r) => {
      return sum + (r.items || []).reduce((s2: number, i: ReturnItem) => {
        if (i.condition && i.condition !== 'RESTOCK') return s2;
        const unitCost = costByProductId.get(i.productId) || 0;
        return s2 + (i.quantity || 0) * unitCost;
      }, 0);
    }, 0);
    const netCogs = Math.max(0, totalCogs - restockedCogs);
    const netSalesExclGst = Math.max(0, totalSalesRevenue - totalOutputGst);
    const netGrossProfit = netSalesExclGst - netCogs;
    /*
     * Margin is profit over the revenue the shop keeps, not over the amount that passed through
     * the till. Dividing by the GST-inclusive total mixed the government's money into the
     * denominator and printed a margin several points below the real trading margin.
     */
    const profitMarginPercent = netSalesExclGst > 0 ? (netGrossProfit / netSalesExclGst) * 100 : 0;

    // Inventory Valuation
    let inventoryMrpValue = 0;
    let inventoryCostValue = 0;
    inventory.forEach((inv) => {
      (inv.batches || []).forEach((b) => {
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
  ] as const;

  const presets = [
    { id: 'ALL_TIME', label: 'All Time' },
    { id: 'TODAY', label: 'Today' },
    { id: 'YESTERDAY', label: 'Yesterday' },
    { id: 'LAST_7_DAYS', label: '7 Days' },
    { id: 'LAST_30_DAYS', label: '30 Days' },
    { id: 'LAST_MONTH', label: 'Last Month' },
    { id: 'LAST_QUARTER', label: 'Quarter' },
    { id: 'CUSTOM', label: 'Custom' },
  ];

  return (
    <PageMain>
      <>
        {loadFailed.length > 0 ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-subtle px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div className="text-sm">
              <span className="font-bold text-danger">Some data could not be loaded</span>
              <p className="mt-0.5 text-fg-muted">
                {[...new Set(loadFailed)].join(', ')} failed to load, so the figures below are
                incomplete. Do not rely on them or file GST from this view until it loads cleanly.
              </p>
            </div>
          </div>
        ) : null}

        <PageHeader
          title="Reports & Financial Analytics"
          subtitle={`${rangeLabel} · ${filteredSales.length} sales invoices · ${filteredPurchases.length} purchase bills`}
          action={
            <>
              <Button variant="outline" onClick={() => setIsPrintModalOpen(true)}>
                <Printer className="h-4 w-4 text-brand" aria-hidden /> Print Report
              </Button>
              <Button
                title="Download complete JSON backup of all sales, purchases, catalog, and inventory"
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
                  } catch {
                    toast.error('Export failed', 'Check your network connection and login status.');
                  }
                }}
              >
                <Download className="h-4 w-4" aria-hidden /> Export Full Backup
              </Button>
            </>
          }
        />

        {/* Preset Timeline & Tabs */}
        <Card className="mb-5 space-y-3 p-3">
          <div className="flex items-center gap-1 overflow-x-auto rounded-md bg-sunken p-1">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => setTimePreset(p.id as TimeRangePreset)}
                aria-pressed={timePreset === p.id}
                className={cn(
                  'whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-bold transition-colors',
                  timePreset === p.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {timePreset === 'CUSTOM' && (
            <div className="flex items-center gap-3 pt-2 pb-1 border-t border-line-light text-xs font-bold text-fg-muted">
              <div className="flex items-center gap-1.5">
                <span className="text-fg-muted">From Date:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-raised border border-line-strong rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-fg focus:outline-none focus:border-brand shadow-2xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-fg-muted">To Date:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-raised border border-line-strong rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-fg focus:outline-none focus:border-brand shadow-2xs"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                  className="text-xs text-danger hover:underline font-extrabold ml-auto"
                >
                  Clear Custom Range
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-line-light pt-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                className={cn(
                  'whitespace-nowrap rounded-md px-4 py-2 text-xs font-bold transition-colors',
                  activeTab === tab.id
                    ? 'bg-brand text-brand-fg'
                    : 'text-fg-muted hover:bg-hover hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <div>
            {/* OVERVIEW TAB */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    label="Total Sales Revenue"
                    value={formatCurrency(metrics.totalSalesRevenue)}
                    sublabel={`${filteredSales.length} total bills`}
                    tooltip={{
                      title: 'Total Sales Revenue',
                      formula: '∑ (SalesBill.grandTotal)',
                      note: 'Sum of net total invoice amounts issued to customers within selected date range (including GST & after discounts).',
                    }}
                  />

                  <MetricCard
                    label="Purchases — Money Spent"
                    value={formatCurrency(metrics.totalPurchasesCost)}
                    sublabel={`${filteredPurchases.length} supplier bills in this period`}
                    tooltip={{
                      title: 'Purchases — Money Spent',
                      formula: '∑ (PurchaseBill.grandTotal)',
                      note:
                        'What you paid suppliers over the selected period. This is money going out over time, ' +
                        'NOT the value of stock on the shelf — see "Stock on Hand" below. Goods bought and ' +
                        'already sold still count here.',
                    }}
                  />

                  <MetricCard
                    label="Estimated Net Profit"
                    value={formatCurrency(metrics.netGrossProfit)}
                    tone={metrics.netGrossProfit >= 0 ? 'brand' : 'danger'}
                    sublabel={`${metrics.netGrossProfit >= 0 ? '+' : ''}${metrics.profitMarginPercent.toFixed(1)}% margin`}
                    tooltip={{
                      title: 'Estimated Net Profit (Gross Profit)',
                      formula: '(Sales − Returns − Output GST) − COGS',
                      note:
                        'Revenue the shop keeps — net of credit notes and of the GST it collects on the ' +
                        "government's behalf — minus the exact Cost of Goods Sold for medicines sold.",
                    }}
                    sublabelTooltip={{
                      title: 'Profit Margin Percentage',
                      formula: '(Net Profit ÷ Net Sales excl. GST) × 100',
                      note: 'Measured against revenue kept, not against the GST-inclusive amount taken at the till.',
                    }}
                  />

                  <MetricCard
                    label="Net GST Payable"
                    value={formatCurrency(metrics.netGstPayable)}
                    tone="accent"
                    sublabel={
                      metrics.inputTaxCreditCarried > 0
                        ? `${formatCurrency(metrics.inputTaxCreditCarried)} input credit carried forward`
                        : 'Output GST − Input ITC'
                    }
                    tooltip={{
                      title: 'Net GST Tax Liability (GSTR-3B)',
                      formula: 'Math.max(0, Output GST - Input ITC)',
                      note: 'Net cash GST liability payable to government after deducting Input Tax Credit (ITC) from Output GST collected.',
                    }}
                  />
                </div>

                {/* Stock on hand — a level, not a flow. Deliberately headed and worded to
                    contrast with the "Purchases — Money Spent" card above, because the two
                    were previously "Total Purchases Cost" and "Total Purchase Cost Value":
                    near-identical labels on near-identical figures that mean opposite things. */}
                <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                  <div className="flex items-center justify-between border-b border-line-light pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-brand" />
                      <div>
                        <h3 className="font-extrabold text-fg text-sm">Stock on Hand — Shelf Value Today</h3>
                        <p className="text-[11px] text-fg-muted mt-0.5">
                          What is physically in the store right now. Not affected by the date filter.
                        </p>
                      </div>
                    </div>
                    <FormulaTooltip
                      title="Stock on Hand"
                      formula="At cost: ∑(Qty × PurchaseRate ÷ PackSize) | At MRP: ∑(Qty × MRP ÷ PackSize)"
                      note="Live valuation of every batch still carrying quantity. A snapshot of this moment, so the date filter does not apply to it."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-3.5 bg-raised border border-line rounded-xl">
                      <span className="text-fg-subtle font-extrabold uppercase text-[10px]">Stock at Cost</span>
                      <div className="text-lg font-black font-mono text-accent mt-1">{formatCurrency(metrics.inventoryCostValue)}</div>
                      <span className="text-[10px] text-fg-subtle block mt-0.5">Capital tied up on the shelf</span>
                    </div>
                    <div className="p-3.5 bg-raised border border-line rounded-xl">
                      <span className="text-fg-subtle font-extrabold uppercase text-[10px]">Stock at MRP</span>
                      <div className="text-lg font-black font-mono text-fg mt-1">{formatCurrency(metrics.inventoryMrpValue)}</div>
                      <span className="text-[10px] text-fg-subtle block mt-0.5">Revenue if all of it sells</span>
                    </div>
                    <div className="p-3.5 bg-brand-subtle/70 border border-brand-line/80 rounded-xl">
                      <span className="text-brand-hover font-extrabold uppercase text-[10px]">Margin Held in Stock</span>
                      <div className="text-lg font-black font-mono text-brand-hover mt-1">{formatCurrency(metrics.potentialInventoryProfit)}</div>
                      <span className="text-[10px] text-brand-hover/80 block mt-0.5">Stock at MRP − Stock at Cost</span>
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] leading-relaxed text-fg-muted border-t border-line-light pt-3">
                    <span className="font-bold text-fg">Why doesn&apos;t Stock at Cost match Purchases?</span>{' '}
                    They measure different things, so they are not meant to agree.{' '}
                    <span className="font-semibold">Purchases</span> is money paid to suppliers over the selected
                    period and includes GST. <span className="font-semibold">Stock at Cost</span> is what sits on
                    the shelf right now, valued excluding GST, so it is lower by the tax you reclaim as input
                    credit. It is lower again by the cost of everything already sold, and higher by any trade
                    discount your supplier gave, because a batch is valued at the rate printed on the bill.
                    Neither number contains the other.
                  </p>
                </div>

                {/* Collection Method Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-brand-subtle/60 border border-brand-line/80 p-4 rounded-lg">
                    <span className="text-[11px] font-extrabold text-brand-hover uppercase block">Cash Collections</span>
                    <span className="text-xl font-mono font-black text-brand-hover mt-1 block">{formatCurrency(metrics.cashSales)}</span>
                  </div>
                  <div className="bg-sky-50/60 border border-sky-200/80 p-4 rounded-lg">
                    <span className="text-[11px] font-extrabold text-sky-800 uppercase block">UPI / Online</span>
                    <span className="text-xl font-mono font-black text-sky-900 mt-1 block">{formatCurrency(metrics.upiSales)}</span>
                  </div>
                  <div className="bg-accent-subtle/60 border border-accent-line/80 p-4 rounded-lg">
                    <span className="text-[11px] font-extrabold text-accent uppercase block">Card Payments</span>
                    <span className="text-xl font-mono font-black text-accent mt-1 block">{formatCurrency(metrics.cardSales)}</span>
                  </div>
                  <div className="bg-warn-subtle/60 border border-warn-line/80 p-4 rounded-lg">
                    <span className="text-[11px] font-extrabold text-warn uppercase block">Customer Credit</span>
                    <span className="text-xl font-mono font-black text-warn mt-1 block">{formatCurrency(metrics.creditSales)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SALES TAB */}
            {activeTab === 'SALES' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <span className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider">Total Sales Invoices</span>
                    <div className="text-2xl font-black font-mono text-fg mt-1">{filteredSales.length} Invoices</div>
                  </div>
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <span className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider">Gross Sales Revenue</span>
                    <div className="text-2xl font-black font-mono text-brand mt-1">{formatCurrency(metrics.totalSalesRevenue)}</div>
                  </div>
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <span className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider">Discounts Given</span>
                    <div className="text-2xl font-black font-mono text-danger mt-1">{formatCurrency(metrics.totalDiscounts)}</div>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-lg overflow-hidden shadow-xs">
                  <div className="p-4 bg-raised border-b border-line font-extrabold text-fg text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-brand" />
                    <span>Sales Invoices ({filteredSales.length})</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-raised border-b border-line text-[11px] font-extrabold text-fg-muted uppercase">
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Prescribed Doctor</th>
                        <th className="py-3 px-4 text-center">Payment Mode</th>
                        <th className="py-3 px-4 text-right">Items</th>
                        <th className="py-3 px-4 text-right">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-fg">
                      {filteredSales.map((s, idx) => (
                        <tr key={idx} className="hover:bg-raised">
                          <td className="py-3 px-4 font-mono font-bold text-fg">{s.invoiceNumber}</td>
                          <td className="py-3 px-4 font-mono text-fg-muted">{formatDate(s.createdAt)}</td>
                          <td className="py-3 px-4 font-bold text-fg">{s.customerName || 'Walk-in Retail'}</td>
                          <td className="py-3 px-4 text-fg-muted">{s.doctorName || 'N/A'}</td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span className="px-2.5 py-1 rounded-md text-[10px] bg-sunken text-fg uppercase font-mono">
                              {s.paymentMethod || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{s.items?.length || 1}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-brand-hover">₹{(s.grandTotal || 0).toFixed(2)}</td>
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
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <span className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider">Total Purchase Bills</span>
                    <div className="text-2xl font-black font-mono text-fg mt-1">{filteredPurchases.length} Invoices</div>
                  </div>
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <span className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider">Total Procurement Outflow</span>
                    <div className="text-2xl font-black font-mono text-accent mt-1">{formatCurrency(metrics.totalPurchasesCost)}</div>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-lg overflow-hidden shadow-xs">
                  <div className="p-4 bg-raised border-b border-line font-extrabold text-fg text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-accent" />
                    <span>Purchase Goods Receipt Bills ({filteredPurchases.length})</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-raised border-b border-line text-[11px] font-extrabold text-fg-muted uppercase">
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Purchase Date</th>
                        <th className="py-3 px-4">Supplier Party</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Items Count</th>
                        <th className="py-3 px-4 text-right">Bill Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-fg">
                      {filteredPurchases.map((p, idx) => (
                        <tr key={idx} className="hover:bg-raised">
                          <td className="py-3 px-4 font-mono font-bold text-fg">{p.invoiceNumber}</td>
                          <td className="py-3 px-4 font-mono text-fg-muted">{formatDate(p.purchaseDate || p.createdAt)}</td>
                          <td className="py-3 px-4 font-extrabold text-fg">{p.party?.name || 'Supplier Distributor'}</td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-mono ${p.isPaid ? 'bg-brand-subtle text-brand-hover' : 'bg-warn-subtle text-warn'}`}>
                              {p.isPaid ? 'PAID CASH' : 'CREDIT DUE'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{p.items?.length || 1}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-accent">₹{(p.grandTotal || 0).toFixed(2)}</td>
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
                  <div className="bg-danger-subtle border border-danger-line p-5 rounded-lg">
                    <div className="text-xs font-extrabold text-danger uppercase tracking-wider">Expiring &lt; 30 Days Risk</div>
                    <div className="text-2xl font-black font-mono text-danger mt-1">{formatCurrency(expiryRiskData.risk30Val)}</div>
                  </div>

                  <div className="bg-warn-subtle border border-warn-line p-5 rounded-lg">
                    <div className="text-xs font-extrabold text-warn uppercase tracking-wider">Expiring 30-60 Days Risk</div>
                    <div className="text-2xl font-black font-mono text-warn mt-1">{formatCurrency(expiryRiskData.risk60Val)}</div>
                  </div>

                  <div className="bg-brand-subtle border border-brand-line p-5 rounded-lg">
                    <div className="text-xs font-extrabold text-brand-hover uppercase tracking-wider">Total Expiry Capital at Risk</div>
                    <div className="text-2xl font-black font-mono text-brand-hover mt-1">{formatCurrency(expiryRiskData.totalRiskVal)}</div>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-lg overflow-hidden shadow-xs">
                  <div className="p-4 bg-raised border-b border-line font-extrabold text-fg text-sm flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-danger" />
                    <span>FEFO Expiry Risk Batch Breakdown ({expiryRiskData.list.length} Batches)</span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-raised border-b border-line text-[11px] font-extrabold text-fg-muted uppercase">
                        <th className="py-3 px-4">Medicine Brand Name</th>
                        <th className="py-3 px-4">Manufacturer</th>
                        <th className="py-3 px-4">Batch Number</th>
                        <th className="py-3 px-4">Expiry Date</th>
                        <th className="py-3 px-4 text-center">Days Remaining</th>
                        <th className="py-3 px-4 text-right">Available Stock</th>
                        <th className="py-3 px-4 text-right">Stock Valuation (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-fg">
                      {expiryRiskData.list.map((item, idx) => (
                        <tr key={idx} className="hover:bg-raised">
                          <td className="py-3 px-4 font-extrabold text-fg">{item.productName}</td>
                          <td className="py-3 px-4 text-fg-muted font-bold">{item.companyName}</td>
                          <td className="py-3 px-4 font-mono font-bold text-fg">{item.batchNumber}</td>
                          <td className="py-3 px-4 font-mono">{formatDate(item.expiryDate)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold ${
                              item.daysLeft <= 30 ? 'bg-danger-subtle text-danger' : 'bg-warn-subtle text-warn'
                            }`}>
                              {item.daysLeft <= 0 ? 'Expired' : `${item.daysLeft} days`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{item.quantity} Units</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-fg">₹{item.totalValue.toFixed(2)}</td>
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
                <div className="bg-surface border border-line rounded-lg p-6 shadow-xs space-y-6">
                  <div className="border-b border-line pb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black text-fg">Statement of Profit & Loss (P&L)</h2>
                      <p className="text-xs text-fg-muted font-medium mt-1">Financial performance statement for period {rangeLabel}</p>
                    </div>
                    <FormulaTooltip
                      title="Net Profit & Loss Formula"
                      formula="Net Profit = (Gross Sales − Returns − Output GST) − COGS"
                      note="COGS is computed strictly from actual batch purchase rates assigned during inward entry."
                    />
                  </div>

                  <table className="w-full text-left border-collapse text-sm">
                    <tbody className="divide-y divide-slate-200 font-medium">
                      <tr>
                        <td className="py-3 text-fg-muted font-bold flex items-center">
                          <span>Gross Sales Revenue (incl. GST)</span>
                          <FormulaTooltip
                            title="Gross Revenue"
                            formula="∑ (SalesBill.grandTotal)"
                            note="Total billed to customers in range, before credit notes. Retail MRP is GST-inclusive, so this is cash through the till — the GST inside it is removed two rows down, not added on top."
                          />
                        </td>
                        <td className="py-3 text-right font-mono font-extrabold text-fg">{formatCurrency(metrics.grossSalesRevenue)}</td>
                      </tr>
                      {metrics.totalSalesReturns > 0 && (
                        <tr>
                          <td className="py-3 text-fg-muted flex items-center">
                            <span>(-) Sales Returns / Credit Notes</span>
                            <FormulaTooltip title="Sales Returns" formula="∑ (SalesReturn.totalReturnAmount)" note="Goods returned by customers. Restocked items also reduce COGS below." />
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-danger">-{formatCurrency(metrics.totalSalesReturns)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-3 text-fg-muted flex items-center">
                          <span>(-) Output GST Tax Collected</span>
                          <FormulaTooltip
                            title="Output GST Liability"
                            formula="∑ (SalesBill.taxTotal) − GST inside returns"
                            note="Tax carved out of the GST-inclusive MRP at each line's own rate — the rate its stock was purchased at. Credit notes reverse the tax they carried."
                          />
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-danger">-{formatCurrency(metrics.totalOutputGst)}</td>
                      </tr>
                      <tr className="bg-raised font-bold">
                        <td className="py-3 px-3 text-fg flex items-center">
                          <span>Net Sales Revenue (excl. GST)</span>
                          <FormulaTooltip title="Net Revenue" formula="Gross Sales - Returns - Output GST" note="Real top-line sales income retained by store." />
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-brand-hover">{formatCurrency(metrics.netSalesExclGst)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-fg-muted flex items-center">
                          <span>(-) Real Cost of Goods Sold (COGS)</span>
                          <FormulaTooltip title="Cost of Goods Sold" formula="∑ (Quantity Sold × Batch Purchase Rate)" note="Exact procurement cost of sold medicine units." />
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-danger">-{formatCurrency(metrics.totalCogs)}</td>
                      </tr>
                      {metrics.cogsCoveragePercent < 99.5 && (
                        <tr>
                          <td colSpan={2} className="pb-3">
                            <div className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-subtle px-3 py-2 text-[11px] font-semibold text-warn">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
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
                      <tr className="border-t-2 border-fg font-black text-base">
                        <td className="py-4 text-fg flex items-center">
                          <span>ESTIMATED NET GROSS PROFIT</span>
                          <FormulaTooltip title="Net Gross Profit" formula="Net Sales Revenue (excl. GST) - COGS" />
                        </td>
                        <td className={`py-4 text-right font-mono ${metrics.netGrossProfit >= 0 ? 'text-brand-hover' : 'text-danger'}`}>
                          {formatCurrency(metrics.netGrossProfit)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 text-fg-muted font-bold flex items-center">
                          <span>Net Gross Margin Percentage</span>
                          <FormulaTooltip title="Margin %" formula="(Gross Profit ÷ Net Sales excl. GST) × 100" />
                        </td>
                        <td className="py-3 text-right font-mono font-black text-brand-hover">+{metrics.profitMarginPercent.toFixed(1)}%</td>
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
                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <div className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between">
                      <span>Output GST Liability</span>
                      <FormulaTooltip title="GSTR-1 Tax" formula="∑ (SalesBill.taxTotal)" note="Output tax collected from retail sales." />
                    </div>
                    <div className="text-2xl font-black font-mono text-danger mt-1">{formatCurrency(metrics.totalOutputGst)}</div>
                    <div className="text-xs text-fg-muted font-semibold mt-1">GSTR-1 Tax Collected</div>
                  </div>

                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <div className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between">
                      <span>Input Tax Credit (ITC)</span>
                      <FormulaTooltip title="GSTR-2B ITC" formula="∑ (PurchaseBill.taxTotal)" note="Input GST paid to suppliers." />
                    </div>
                    <div className="text-2xl font-black font-mono text-brand mt-1">{formatCurrency(metrics.totalInputGst)}</div>
                    <div className="text-xs text-fg-muted font-semibold mt-1">GSTR-2B Claimed</div>
                  </div>

                  <div className="bg-surface border border-line p-5 rounded-lg shadow-xs">
                    <div className="text-xs font-extrabold text-fg-subtle uppercase tracking-wider flex items-center justify-between">
                      <span>Net Cash GST Payable</span>
                      <FormulaTooltip title="GSTR-3B Liability" formula="Math.max(0, Output GST - Input ITC)" note="Net tax payable to government cash ledger." />
                    </div>
                    <div className="text-2xl font-black font-mono text-accent mt-1">{formatCurrency(metrics.netGstPayable)}</div>
                    <div className="text-xs text-fg-muted font-semibold mt-1">
                      {metrics.inputTaxCreditCarried > 0
                        ? `${formatCurrency(metrics.inputTaxCreditCarried)} input credit carried forward`
                        : 'Output GST − Input ITC'}
                    </div>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-lg p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-line-light pb-3">
                    <div>
                      <h3 className="font-extrabold text-fg text-sm">GSTR-1 & GSTR-3B Tax Liability Summary</h3>
                      <p className="text-xs text-fg-muted">Official GST Filing calculations for pharmacy retail sales and supplier procurement.</p>
                    </div>
                    <FormulaTooltip
                      title="CGST / SGST Tax Split"
                      formula="CGST = Output GST ÷ 2 | SGST = Output GST ÷ 2"
                      note="Intra-state sales split tax 50-50 between Central and State governments."
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 bg-raised border border-line rounded-xl space-y-2">
                      <div className="text-xs font-bold text-fg-muted flex items-center justify-between">
                        <span>CGST (Central GST) - 50%</span>
                        <FormulaTooltip title="CGST" formula="Output GST × 50%" />
                      </div>
                      <div className="text-lg font-black font-mono text-fg">{formatCurrency(metrics.totalOutputGst / 2)}</div>
                    </div>
                    <div className="p-4 bg-raised border border-line rounded-xl space-y-2">
                      <div className="text-xs font-bold text-fg-muted flex items-center justify-between">
                        <span>SGST (State GST) - 50%</span>
                        <FormulaTooltip title="SGST" formula="Output GST × 50%" />
                      </div>
                      <div className="text-lg font-black font-mono text-fg">{formatCurrency(metrics.totalOutputGst / 2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </>

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
    </PageMain>
  );
}
