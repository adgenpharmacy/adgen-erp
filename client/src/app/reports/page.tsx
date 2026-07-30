'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import ReportPrintModal from '@/components/reports/ReportPrintModal';
import ReportTable, { type Column } from '@/components/reports/ReportTable';
import { TableSkeleton, Button, PageHeader, useToast } from '@/components/ui';
import PageMain from '@/components/layout/PageMain';
import type { Sale, Purchase, InventoryItem, ReturnRecord } from '@/types';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import {
  Download,
  Printer,
  AlertTriangle,
  Receipt,
  Building2,
  Info,
  Pill,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import {
  explodeSale,
  explodePurchase,
  explodeReturns,
  buildLandedCostIndex,
  referenceRates,
  summarise,
  aggregateByDay,
  aggregateByProduct,
  salesByGstSlab,
  purchasesByGstSlab,
  type ExplodedSale,
  type ExplodedPurchase,
  type SaleLine,
  type PurchaseLine,
  type DayRow,
  type ProductRow,
  type GstMode,
} from '@/lib/report-math';

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

export type TimeRangePreset =
  | 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS'
  | 'LAST_MONTH' | 'LAST_QUARTER' | 'LAST_YEAR' | 'CUSTOM';

/**
 * Last complete set of report data, kept for the browsing session.
 *
 * Module scope rather than state: it has to outlive the component so that leaving Reports and
 * coming back does not repeat five full-detail reads.
 */
let reportsCache: {
  sales: Sale[];
  purchases: Purchase[];
  inventory: InventoryItem[];
  salesReturns: ReturnRecord[];
  purchaseReturns: ReturnRecord[];
} | null = null;

const pct = (n: number) => `${n.toFixed(1)}%`;

function Explain({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative ml-1.5 inline-block align-middle" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button type="button" className="rounded-full p-0.5 text-fg-subtle transition hover:text-brand focus:outline-none" aria-label="How this is calculated">
        <Info className="h-3.5 w-3.5" />
      </button>
      {show ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 block w-72 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl">
          {children}
        </span>
      ) : null}
    </span>
  );
}

function Tile({
  label, value, sub, tone = 'plain', explain,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'plain' | 'good' | 'bad' | 'accent';
  explain?: React.ReactNode;
}) {
  const bar =
    tone === 'good' ? 'bg-brand' : tone === 'bad' ? 'bg-danger' : tone === 'accent' ? 'bg-accent' : 'bg-line';
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      <div className="p-4">
        <div className="flex items-start justify-between gap-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">{label}</span>
          {explain ? <Explain>{explain}</Explain> : null}
        </div>
        <div className="mt-1 font-mono text-xl font-black text-fg">{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-fg-muted">{sub}</div> : null}
      </div>
      <div className={cn('h-0.75', bar)} aria-hidden />
    </div>
  );
}

/** A single line of a statement: label, optional workings, amount. */
function Line({
  label, amount, workings, strong, negative, top,
}: {
  label: string;
  amount: number;
  workings?: string;
  strong?: boolean;
  negative?: boolean;
  top?: boolean;
}) {
  return (
    <tr className={cn(top && 'border-t-2 border-fg', strong && 'bg-raised font-black')}>
      <td className="px-3 py-2.5">
        <span className={cn('text-fg', strong ? 'font-black' : 'font-semibold')}>{label}</span>
        {workings ? <div className="mt-0.5 text-[11px] font-normal text-fg-subtle">{workings}</div> : null}
      </td>
      <td className={cn('px-3 py-2.5 text-right font-mono font-bold', negative ? 'text-danger' : 'text-fg')}>
        {negative ? '−' : ''}{formatCurrency(Math.abs(amount))}
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const { inventory: cachedInventory, profile } = useErpData();

  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'DAYS' | 'SALES' | 'PURCHASES' | 'MEDICINES' | 'GST' | 'PL' | 'EXPIRY'
  >('OVERVIEW');
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('ALL_TIME');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  /*
   * Seeded straight from the session cache rather than set inside an effect, so returning to
   * this screen paints the previous figures on the first render instead of flashing skeletons.
   */
  const [sales, setSales] = useState<Sale[]>(() => reportsCache?.sales ?? []);
  const [purchases, setPurchases] = useState<Purchase[]>(() => reportsCache?.purchases ?? []);
  const [fetchedInventory, setFetchedInventory] = useState<InventoryItem[]>(() => reportsCache?.inventory ?? []);
  const [salesReturns, setSalesReturns] = useState<ReturnRecord[]>(() => reportsCache?.salesReturns ?? []);
  const [purchaseReturns, setPurchaseReturns] = useState<ReturnRecord[]>(() => reportsCache?.purchaseReturns ?? []);
  const [loading, setLoading] = useState(() => !reportsCache);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  /*
   * A failed fetch used to leave the arrays empty, so a network error rendered as a confident
   * "Rs 0.00" across every card — indistinguishable from a day with no trade.
   */
  const [loadFailed, setLoadFailed] = useState<string[]>([]);

  /*
   * Whether the shop is inside the GST system, taken from the GSTIN on the pharmacy profile.
   *
   * Everything downstream turns on this, so it is derived from a fact already on file rather
   * than a separate switch someone can forget to flip: a shop with no GSTIN neither charges GST
   * nor reclaims it. Entering a GSTIN in Admin moves the whole report onto the registered basis.
   */
  const gstMode: GstMode = (profile?.gstNumber || '').trim() ? 'REGISTERED' : 'UNREGISTERED';
  const registered = gstMode === 'REGISTERED';

  /*
   * Derived, not stored: this screen's own fetch carries every batch, but until it lands the
   * shared context's copy is good enough to value stock with. Choosing between them here avoids
   * copying one into state just to read it back.
   */
  const inventory = fetchedInventory.length > 0 ? fetchedInventory : cachedInventory;

  // Always revalidate on entry: the cache above is a first paint, not the answer.
  useEffect(() => {
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
      if (inv) setFetchedInventory(inv);
      if (sr) setSalesReturns(sr);
      if (pr) setPurchaseReturns(pr);
      setLoadFailed(failures);
      if (s && p && inv && sr && pr) {
        reportsCache = { sales: s, purchases: p, inventory: inv, salesReturns: sr, purchaseReturns: pr };
      }
    }).finally(() => setLoading(false));
  }, []);

  const { startDateObj, endDateObj, rangeLabel } = useMemo(() => {
    const now = new Date();
    let start = new Date(2000, 0, 1);
    let end = new Date(2099, 11, 31);
    let label = 'All time';

    const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOf = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    switch (timePreset) {
      case 'TODAY': start = startOf(now); end = endOf(now); label = 'Today'; break;
      case 'YESTERDAY': {
        const y = new Date(now); y.setDate(now.getDate() - 1);
        start = startOf(y); end = endOf(y); label = 'Yesterday'; break;
      }
      case 'LAST_7_DAYS': { const d = new Date(now); d.setDate(now.getDate() - 6); start = startOf(d); end = endOf(now); label = 'Last 7 days'; break; }
      case 'LAST_30_DAYS': { const d = new Date(now); d.setDate(now.getDate() - 29); start = startOf(d); end = endOf(now); label = 'Last 30 days'; break; }
      case 'LAST_MONTH': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); label = 'Last month'; break;
      case 'LAST_QUARTER': { const d = new Date(now); d.setMonth(now.getMonth() - 3); start = startOf(d); end = endOf(now); label = 'Last quarter'; break; }
      case 'LAST_YEAR': { const d = new Date(now); d.setFullYear(now.getFullYear() - 1); start = startOf(d); end = endOf(now); label = 'Last year'; break; }
      case 'CUSTOM':
        start = customStartDate ? startOf(new Date(customStartDate)) : new Date(2000, 0, 1);
        end = customEndDate ? endOf(new Date(customEndDate)) : new Date(2099, 11, 31);
        label = 'Custom range';
        break;
    }
    return { startDateObj: start, endDateObj: end, rangeLabel: label };
  }, [timePreset, customStartDate, customEndDate]);

  const inRange = useCallback(
    (value?: string | Date | null) => {
      if (!value) return false;
      const d = new Date(value);
      return d >= startDateObj && d <= endDateObj;
    },
    [startDateObj, endDateObj]
  );

  const filteredSales = useMemo(() => sales.filter((s) => inRange(s.createdAt)), [sales, inRange]);
  const filteredPurchases = useMemo(() => purchases.filter((p) => inRange(p.purchaseDate || p.createdAt)), [purchases, inRange]);
  const filteredSalesReturns = useMemo(() => salesReturns.filter((r) => inRange(r.createdAt)), [salesReturns, inRange]);
  const filteredPurchaseReturns = useMemo(() => purchaseReturns.filter((r) => inRange(r.createdAt)), [purchaseReturns, inRange]);
  const purchaseReturnValue = useMemo(
    () => filteredPurchaseReturns.reduce((t, r) => t + (r.totalReturnAmount || 0), 0),
    [filteredPurchaseReturns]
  );

  /*
   * Everything below comes out of lib/report-math. The page's job is to display it and let the
   * reader open any row; it does no arithmetic of its own, so what is on screen cannot drift
   * from what the engine (and the server that mirrors it) computed.
   */
  const engine = useMemo(() => {
    const landedCost = buildLandedCostIndex(purchases);
    const explodedSales: ExplodedSale[] = filteredSales.map((s) => explodeSale(s, { mode: gstMode, landedCost }));
    const explodedPurchases: ExplodedPurchase[] = filteredPurchases.map(explodePurchase);
    const { rateByProduct, costByProduct } = referenceRates(explodedSales);
    const returnLines = explodeReturns(filteredSalesReturns, rateByProduct, costByProduct);

    return {
      explodedSales,
      explodedPurchases,
      returnLines,
      summary: summarise(explodedSales, explodedPurchases, returnLines, gstMode),
      days: aggregateByDay(explodedSales),
      products: aggregateByProduct(explodedSales),
      salesSlabs: salesByGstSlab(explodedSales),
      purchaseSlabs: purchasesByGstSlab(explodedPurchases),
      landedCount: landedCost.size,
    };
  }, [filteredSales, filteredPurchases, filteredSalesReturns, purchases, gstMode]);

  const s = engine.summary;

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
            // batch.quantity is in content units while MRP is per pack, so pack size divides out —
            // otherwise the risk value is inflated ~packSize times.
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

  const inventoryValue = useMemo(() => {
    let mrp = 0;
    let cost = 0;
    inventory.forEach((inv) => {
      (inv.batches || []).forEach((b) => {
        if (b.quantity > 0) {
          const packSize = inv.packSize || 1;
          mrp += b.quantity * ((b.mrp || inv.mrp || 0) / packSize);
          const rate = (b.purchaseRate || inv.purchaseRate || 0) / packSize;
          cost += b.quantity * (registered ? rate : rate * (1 + (b.taxPercent || 0) / 100));
        }
      });
    });
    return { mrp, cost };
  }, [inventory, registered]);

  const handleBackup = async () => {
    try {
      const res = await api.get('/system/export-data');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AdGen_Pharmacy_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Backup failed', 'Could not download the data export.');
    }
  };

  // ── Column definitions ────────────────────────────────────────────────────

  const money = (v: number) => formatCurrency(v);
  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((t, r) => t + pick(r), 0);

  const saleLineColumns: Column<SaleLine>[] = [
    { key: 'product', header: 'Medicine', value: (l) => l.productName },
    { key: 'batch', header: 'Batch', value: (l) => l.batchNumber },
    { key: 'qty', header: 'Qty', value: (l) => l.quantity, align: 'right' },
    { key: 'rate', header: 'Rate/unit', value: (l) => l.unitPrice, render: (l) => money(l.unitPrice), align: 'right' },
    { key: 'gross', header: 'Gross', value: (l) => l.gross, render: (l) => money(l.gross), align: 'right' },
    { key: 'itemDisc', header: 'Item disc.', value: (l) => l.itemDiscount, render: (l) => (l.itemDiscount ? `−${money(l.itemDiscount)}` : '—'), align: 'right' },
    { key: 'billDisc', header: 'Bill disc. share', value: (l) => l.billDiscountShare, render: (l) => (l.billDiscountShare ? `−${money(l.billDiscountShare)}` : '—'), align: 'right' },
    { key: 'charged', header: 'Charged', value: (l) => l.charged, render: (l) => money(l.charged), align: 'right' },
    { key: 'taxPct', header: 'GST%', value: (l) => l.taxPercent, render: (l) => `${l.taxPercent}%`, align: 'center' },
    { key: 'tax', header: registered ? 'GST owed' : 'GST inside', value: (l) => l.tax, render: (l) => money(l.tax), align: 'right' },
    { key: 'revenue', header: 'Income', value: (l) => l.revenueExGst, render: (l) => money(l.revenueExGst), align: 'right' },
    { key: 'unitCost', header: 'Cost/unit', value: (l) => l.unitCost, render: (l) => money(l.unitCost), align: 'right' },
    { key: 'cost', header: 'Cost', value: (l) => l.cost, render: (l) => (l.costKnown ? money(l.cost) : '—'), align: 'right' },
    {
      key: 'profit', header: 'Profit', value: (l) => l.profit, align: 'right',
      render: (l) => (l.costKnown ? <span className={l.profit >= 0 ? 'text-brand-hover' : 'text-danger'}>{money(l.profit)}</span> : <span className="text-warn">no cost</span>),
    },
  ];

  const purchaseLineColumns: Column<PurchaseLine>[] = [
    { key: 'product', header: 'Medicine', value: (l) => l.productName },
    { key: 'batch', header: 'Batch', value: (l) => l.batchNumber },
    { key: 'exp', header: 'Expiry', value: (l) => l.expiryDate || '', render: (l) => (l.expiryDate ? formatDate(l.expiryDate) : '—') },
    { key: 'qty', header: 'Packs', value: (l) => l.quantity, align: 'right' },
    { key: 'free', header: 'Free', value: (l) => l.freeQuantity, render: (l) => (l.freeQuantity ? l.freeQuantity : '—'), align: 'right' },
    { key: 'rate', header: 'Rate', value: (l) => l.purchaseRate, render: (l) => money(l.purchaseRate), align: 'right' },
    { key: 'gross', header: 'Gross', value: (l) => l.gross, render: (l) => money(l.gross), align: 'right' },
    { key: 'disc', header: 'Discount', value: (l) => l.discount, render: (l) => (l.discount ? `−${money(l.discount)} (${l.discountPercent}%)` : '—'), align: 'right' },
    { key: 'net', header: 'Taxable', value: (l) => l.net, render: (l) => money(l.net), align: 'right' },
    { key: 'taxPct', header: 'GST%', value: (l) => l.taxPercent, render: (l) => `${l.taxPercent}%`, align: 'center' },
    { key: 'tax', header: 'GST', value: (l) => l.tax, render: (l) => money(l.tax), align: 'right' },
    { key: 'total', header: 'Line total', value: (l) => l.total, render: (l) => money(l.total), align: 'right' },
  ];

  const tabs = [
    { id: 'OVERVIEW', label: 'Overview' },
    { id: 'DAYS', label: 'Day book' },
    { id: 'SALES', label: 'Sales' },
    { id: 'PURCHASES', label: 'Purchases' },
    { id: 'MEDICINES', label: 'Medicines' },
    { id: 'GST', label: registered ? 'GST filing' : 'GST info' },
    { id: 'PL', label: 'Profit & Loss' },
    { id: 'EXPIRY', label: 'Expiry risk' },
  ] as const;

  const presets: { id: TimeRangePreset; label: string }[] = [
    { id: 'ALL_TIME', label: 'All time' },
    { id: 'TODAY', label: 'Today' },
    { id: 'YESTERDAY', label: 'Yesterday' },
    { id: 'LAST_7_DAYS', label: '7 days' },
    { id: 'LAST_30_DAYS', label: '30 days' },
    { id: 'LAST_MONTH', label: 'Last month' },
    { id: 'LAST_QUARTER', label: 'Quarter' },
    { id: 'CUSTOM', label: 'Custom' },
  ];

  return (
    <PageMain>
      {loadFailed.length > 0 ? (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-subtle px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <div className="text-sm">
            <span className="font-bold text-danger">Some data could not be loaded</span>
            <p className="mt-0.5 text-fg-muted">
              {[...new Set(loadFailed)].join(', ')} failed to load, so the figures below are incomplete.
            </p>
          </div>
        </div>
      ) : null}

      <PageHeader
        title="Reports"
        subtitle={`${rangeLabel} · ${filteredSales.length} sales · ${filteredPurchases.length} purchases`}
        action={
          <>
            <Button variant="outline" onClick={() => setIsPrintModalOpen(true)}>
              <Printer className="h-4 w-4 text-brand" aria-hidden /> Print
            </Button>
            <Button variant="outline" onClick={handleBackup}>
              <Download className="h-4 w-4" aria-hidden /> Backup
            </Button>
          </>
        }
      />

      {/* How the figures are being counted — stated once, at the top, in plain words. */}
      <div className={cn('mb-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm', registered ? 'border-line bg-raised' : 'border-accent-line bg-accent-subtle')}>
        <ShieldCheck className={cn('mt-0.5 h-4 w-4 shrink-0', registered ? 'text-brand' : 'text-accent')} aria-hidden />
        <div>
          <span className="font-bold text-fg">
            {registered ? 'GST-registered basis' : 'Not GST-registered — figures are on the unregistered basis'}
          </span>
          <p className="mt-0.5 text-fg-muted">
            {registered ? (
              <>
                GSTIN <span className="font-mono font-semibold">{profile?.gstNumber}</span> is on file. The tax inside your
                selling price belongs to the government so it is not counted as income, and the tax you pay suppliers comes
                back as input credit so it is not counted as cost.
              </>
            ) : (
              <>
                No GSTIN is on file, so you neither collect GST nor reclaim it. The full amount taken at the counter is your
                income, and the GST paid to suppliers ({formatCurrency(s.supplierTaxPaid)} on purchases in this period) is
                part of what your stock cost. Add a GSTIN in Admin → Settings to switch every figure to the registered basis.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Date range */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
        <CalendarDays className="h-4 w-4 text-fg-subtle" aria-hidden />
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setTimePreset(p.id)}
            aria-pressed={timePreset === p.id}
            className={cn(
              'h-8 rounded-md px-3 text-xs font-bold transition-colors',
              timePreset === p.id ? 'bg-brand text-brand-fg' : 'border border-line text-fg-muted hover:text-fg'
            )}
          >
            {p.label}
          </button>
        ))}
        {timePreset === 'CUSTOM' ? (
          <span className="flex items-center gap-2">
            <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-xs font-semibold" aria-label="From date" />
            <span className="text-xs text-fg-subtle">to</span>
            <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-xs font-semibold" aria-label="To date" />
          </span>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-md bg-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            aria-pressed={activeTab === t.id}
            className={cn(
              'whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-bold transition-colors',
              activeTab === t.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : (
        <div className="space-y-5">
          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeTab === 'OVERVIEW' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile
                  label="Collected at the counter" value={formatCurrency(s.charged)} sub={`${s.billCount} bills`}
                  explain={<>Every bill&apos;s grand total added up. This is money that came in, including the GST sitting inside the MRP.</>}
                />
                <Tile
                  label={registered ? 'Income (excl. GST)' : 'Income'} value={formatCurrency(s.netRevenueExGst)}
                  sub={registered ? 'after removing GST and returns' : 'after returns'} tone="accent"
                  explain={registered
                    ? <>Collected, less the GST owed to the government, less credit notes. This is what the shop keeps.</>
                    : <>Collected, less credit notes. You are not registered, so no part of it goes to the government.</>}
                />
                <Tile
                  label="Cost of goods sold" value={formatCurrency(s.cogs)}
                  sub={`${pct(s.cogsCoveragePercent)} of lines have a known cost`}
                  explain={<>What the medicines actually cost you: supplier rate, {registered ? 'excluding' : 'including'} GST, minus line and scheme discounts, spread over all units received including free goods.</>}
                />
                <Tile
                  label="Profit" value={formatCurrency(s.grossProfit)} sub={`${pct(s.marginPercent)} margin`}
                  tone={s.grossProfit >= 0 ? 'good' : 'bad'}
                  explain={<>Income minus cost of goods sold. Shop running costs — rent, salaries, electricity — are not in the system, so this is gross profit, not final take-home.</>}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Cash" value={formatCurrency(s.cash)} />
                <Tile label="UPI" value={formatCurrency(s.upi)} />
                <Tile label="Card" value={formatCurrency(s.card)} />
                <Tile label="Credit (unpaid)" value={formatCurrency(s.credit)} tone={s.credit > 0 ? 'bad' : 'plain'} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Discounts given" value={formatCurrency(s.itemDiscount + s.billDiscount)}
                  sub={`${formatCurrency(s.itemDiscount)} on items · ${formatCurrency(s.billDiscount)} on bills`}
                  explain={<>Money knocked off the MRP. Item discounts are per medicine; bill discounts are taken off the whole bill and shared across its lines.</>} />
                <Tile label="Purchases in period" value={formatCurrency(s.purchaseTotal)}
                  sub={purchaseReturnValue > 0 ? `${s.purchaseCount} bills · ${formatCurrency(purchaseReturnValue)} returned` : `${s.purchaseCount} supplier bills`} />
                <Tile label="Stock on hand (at MRP)" value={formatCurrency(inventoryValue.mrp)}
                  sub={`cost ${formatCurrency(inventoryValue.cost)}`}
                  explain={<>Today&apos;s shelf, not this period. Valued at selling price, with what it cost you beneath.</>} />
                <Tile label="Expiring within 90 days" value={formatCurrency(expiryRiskData.totalRiskVal)}
                  sub={`${expiryRiskData.list.length} batches`} tone={expiryRiskData.totalRiskVal > 0 ? 'bad' : 'plain'} />
              </div>

              {s.cogsCoveragePercent < 99.5 ? (
                <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-subtle px-4 py-3 text-xs font-semibold text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {formatCurrency(s.revenueWithoutCost)} of sales have no recorded purchase cost, so profit is overstated
                    for those lines. Open the Medicines tab to find them — they show &ldquo;no cost&rdquo;.
                  </span>
                </div>
              ) : null}
            </>
          )}

          {/* ── DAY BOOK ─────────────────────────────────────────────────── */}
          {activeTab === 'DAYS' && (
            <ReportTable<DayRow>
              caption={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand" />Day by day</span>}
              rows={engine.days}
              rowKey={(d) => d.day}
              exportName="day-book"
              initialSort={{ key: 'day', direction: 'desc' }}
              columns={[
                { key: 'day', header: 'Date', value: (d) => d.day, render: (d) => d.label },
                { key: 'bills', header: 'Bills', value: (d) => d.bills, align: 'right', total: (r) => sum(r, (d) => d.bills) },
                { key: 'gross', header: 'Gross MRP', value: (d) => d.gross, render: (d) => money(d.gross), align: 'right', total: (r) => money(sum(r, (d) => d.gross)) },
                { key: 'disc', header: 'Discounts', value: (d) => d.itemDiscount + d.billDiscount, render: (d) => money(d.itemDiscount + d.billDiscount), align: 'right', total: (r) => money(sum(r, (d) => d.itemDiscount + d.billDiscount)) },
                { key: 'charged', header: 'Charged', value: (d) => d.charged, render: (d) => money(d.charged), align: 'right', total: (r) => money(sum(r, (d) => d.charged)) },
                { key: 'tax', header: registered ? 'GST owed' : 'GST inside', value: (d) => d.tax, render: (d) => money(d.tax), align: 'right', total: (r) => money(sum(r, (d) => d.tax)) },
                { key: 'revenue', header: 'Income', value: (d) => d.revenueExGst, render: (d) => money(d.revenueExGst), align: 'right', total: (r) => money(sum(r, (d) => d.revenueExGst)) },
                { key: 'cost', header: 'Cost', value: (d) => d.cost, render: (d) => money(d.cost), align: 'right', total: (r) => money(sum(r, (d) => d.cost)) },
                {
                  key: 'profit', header: 'Profit', value: (d) => d.profit, align: 'right',
                  render: (d) => <span className={d.profit >= 0 ? 'text-brand-hover font-bold' : 'text-danger font-bold'}>{money(d.profit)}</span>,
                  total: (r) => money(sum(r, (d) => d.profit)),
                },
                { key: 'margin', header: 'Margin', value: (d) => d.marginPercent, render: (d) => pct(d.marginPercent), align: 'right' },
              ]}
              expand={(d) => {
                const bills = engine.explodedSales.filter((e) => d.saleIds.includes(e.bill.id));
                return (
                  <ReportTable<ExplodedSale>
                    caption={`${d.label} — ${bills.length} bills`}
                    rows={bills}
                    rowKey={(e) => e.bill.id}
                    columns={billColumns(registered, money)}
                    expand={(e) => <ReportTable<SaleLine> rows={e.lines} rowKey={(l, ) => `${e.bill.id}-${l.productId}-${l.batchNumber}`} columns={saleLineColumns} />}
                  />
                );
              }}
            />
          )}

          {/* ── SALES ────────────────────────────────────────────────────── */}
          {activeTab === 'SALES' && (
            <ReportTable<ExplodedSale>
              caption={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-brand" />Every sale, openable to its lines</span>}
              rows={engine.explodedSales}
              rowKey={(e) => e.bill.id}
              exportName="sales"
              initialSort={{ key: 'date', direction: 'desc' }}
              columns={billColumns(registered, money)}
              expand={(e) => (
                <div className="space-y-2">
                  <ReportTable<SaleLine>
                    caption="Lines on this bill"
                    rows={e.lines}
                    rowKey={(l) => `${e.bill.id}-${l.productId}-${l.batchNumber}`}
                    columns={saleLineColumns}
                  />
                  <p className="px-1 text-[11px] text-fg-subtle">
                    Charged {money(e.charged)}
                    {e.roundOff !== 0 ? ` + round off ${money(e.roundOff)}` : ''} = grand total{' '}
                    {money(e.bill.grandTotal || 0)}.
                    {e.billDiscount > 0 ? ` Bill discount of ${money(e.billDiscount)} was shared across the lines in proportion to their value.` : ''}
                  </p>
                </div>
              )}
            />
          )}

          {/* ── PURCHASES ────────────────────────────────────────────────── */}
          {activeTab === 'PURCHASES' && (
            <ReportTable<ExplodedPurchase>
              caption={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" />Every supplier bill, openable to its lines</span>}
              rows={engine.explodedPurchases}
              rowKey={(e) => e.bill.id}
              exportName="purchases"
              initialSort={{ key: 'date', direction: 'desc' }}
              columns={[
                { key: 'invoice', header: 'Bill #', value: (e) => e.bill.invoiceNumber },
                { key: 'date', header: 'Date', value: (e) => e.bill.purchaseDate || e.bill.createdAt, render: (e) => formatDate(e.bill.purchaseDate || e.bill.createdAt) },
                { key: 'party', header: 'Supplier', value: (e) => e.bill.party?.name || '—' },
                { key: 'lines', header: 'Lines', value: (e) => e.lines.length, align: 'right' },
                { key: 'gross', header: 'Gross', value: (e) => e.gross, render: (e) => money(e.gross), align: 'right', total: (r) => money(sum(r, (e) => e.gross)) },
                { key: 'disc', header: 'Discounts', value: (e) => e.discount + e.billDiscount, render: (e) => money(e.discount + e.billDiscount), align: 'right', total: (r) => money(sum(r, (e) => e.discount + e.billDiscount)) },
                { key: 'net', header: 'Taxable', value: (e) => e.net, render: (e) => money(e.net), align: 'right', total: (r) => money(sum(r, (e) => e.net)) },
                { key: 'tax', header: 'GST paid', value: (e) => e.tax, render: (e) => money(e.tax), align: 'right', total: (r) => money(sum(r, (e) => e.tax)) },
                { key: 'total', header: 'Bill total', value: (e) => e.bill.grandTotal, render: (e) => money(e.bill.grandTotal), align: 'right', total: (r) => money(sum(r, (e) => e.bill.grandTotal)) },
                { key: 'paid', header: 'Status', value: (e) => (e.bill.isPaid ? 'Paid' : 'Credit'), align: 'center',
                  render: (e) => <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', e.bill.isPaid ? 'bg-brand-subtle text-brand-hover' : 'bg-warn-subtle text-warn')}>{e.bill.isPaid ? 'Paid' : 'Credit'}</span> },
              ]}
              expand={(e) => (
                <div className="space-y-2">
                  <ReportTable<PurchaseLine> caption="Lines on this bill" rows={e.lines} rowKey={(l) => `${e.bill.id}-${l.productId}-${l.batchNumber}`} columns={purchaseLineColumns} />
                  <p className="px-1 text-[11px] text-fg-subtle">
                    Taxable {money(e.net)} + GST {money(e.tax)} = {money(e.net + e.tax)}
                    {e.billDiscount > 0 ? ` − scheme discount ${money(e.billDiscount)}` : ''}
                    {e.roundOff !== 0 ? ` + round off ${money(e.roundOff)}` : ''} = {money(e.bill.grandTotal)}.
                  </p>
                </div>
              )}
            />
          )}

          {/* ── MEDICINES ────────────────────────────────────────────────── */}
          {activeTab === 'MEDICINES' && (
            <ReportTable<ProductRow>
              caption={<span className="flex items-center gap-2"><Pill className="h-4 w-4 text-brand" />What each medicine earned</span>}
              rows={engine.products}
              rowKey={(p) => p.productId}
              exportName="medicine-profit"
              initialSort={{ key: 'profit', direction: 'desc' }}
              columns={[
                { key: 'name', header: 'Medicine', value: (p) => p.productName },
                { key: 'qty', header: 'Units sold', value: (p) => p.quantity, align: 'right', total: (r) => sum(r, (p) => p.quantity).toLocaleString('en-IN') },
                { key: 'bills', header: 'Bills', value: (p) => p.bills, align: 'right' },
                { key: 'charged', header: 'Charged', value: (p) => p.charged, render: (p) => money(p.charged), align: 'right', total: (r) => money(sum(r, (p) => p.charged)) },
                { key: 'revenue', header: 'Income', value: (p) => p.revenueExGst, render: (p) => money(p.revenueExGst), align: 'right', total: (r) => money(sum(r, (p) => p.revenueExGst)) },
                { key: 'cost', header: 'Cost', value: (p) => p.cost, render: (p) => money(p.cost), align: 'right', total: (r) => money(sum(r, (p) => p.cost)) },
                {
                  key: 'profit', header: 'Profit', value: (p) => p.profit, align: 'right',
                  render: (p) => (p.costKnown
                    ? <span className={p.profit >= 0 ? 'text-brand-hover font-bold' : 'text-danger font-bold'}>{money(p.profit)}</span>
                    : <span className="text-warn font-bold">no cost</span>),
                  total: (r) => money(sum(r, (p) => p.profit)),
                },
                { key: 'margin', header: 'Margin', value: (p) => p.marginPercent, render: (p) => pct(p.marginPercent), align: 'right' },
              ]}
              expand={(p) => (
                <ReportTable<SaleLine>
                  caption={`${p.productName} — every line sold`}
                  rows={p.lines}
                  rowKey={(l) => `${l.billId}-${l.batchNumber}`}
                  columns={[
                    { key: 'invoice', header: 'Bill #', value: (l) => l.invoiceNumber },
                    { key: 'date', header: 'Date', value: (l) => l.date, render: (l) => formatDate(l.date) },
                    { key: 'customer', header: 'Customer', value: (l) => l.customerName },
                    ...saleLineColumns.filter((c) => c.key !== 'product'),
                  ]}
                />
              )}
            />
          )}

          {/* ── GST ──────────────────────────────────────────────────────── */}
          {activeTab === 'GST' && (
            <div className="space-y-5">
              {!registered ? (
                <div className="rounded-lg border border-accent-line bg-accent-subtle px-4 py-3 text-sm text-fg-muted">
                  <span className="font-bold text-fg">For information only.</span> You are not registered, so none of this is
                  filed or paid. It is shown because the tax is still inside the prices: the manufacturer paid it before the
                  medicine reached you. The purchase side below is a cost to you, not a credit.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Tile label={registered ? 'Output GST collected' : 'GST inside your selling prices'} value={formatCurrency(engine.salesSlabs.reduce((t, r) => t + r.tax, 0))} tone="accent" />
                <Tile label={registered ? 'Input credit available' : 'GST you paid suppliers'} value={formatCurrency(s.supplierTaxPaid)} />
                <Tile
                  label={registered ? 'Net GST payable' : 'Payable to government'}
                  value={registered ? formatCurrency(s.netGstPayable) : '₹0.00'}
                  sub={registered ? (s.inputCreditCarried > 0 ? `${formatCurrency(s.inputCreditCarried)} credit carried forward` : 'output − input credit') : 'not registered'}
                  tone={registered ? 'bad' : 'good'}
                />
              </div>

              <ReportTable
                caption="Sales by GST rate"
                rows={engine.salesSlabs}
                rowKey={(r) => `s-${r.taxPercent}`}
                exportName="gst-sales"
                columns={[
                  { key: 'rate', header: 'Rate', value: (r) => r.taxPercent, render: (r) => `${r.taxPercent}%` },
                  { key: 'lines', header: 'Lines', value: (r) => r.lineCount, align: 'right' },
                  { key: 'inclusive', header: 'Charged (incl.)', value: (r) => r.inclusiveValue, render: (r) => money(r.inclusiveValue), align: 'right', total: (rows) => money(sum(rows, (r) => r.inclusiveValue)) },
                  { key: 'taxable', header: 'Taxable value', value: (r) => r.taxableValue, render: (r) => money(r.taxableValue), align: 'right', total: (rows) => money(sum(rows, (r) => r.taxableValue)) },
                  { key: 'tax', header: 'GST', value: (r) => r.tax, render: (r) => money(r.tax), align: 'right', total: (rows) => money(sum(rows, (r) => r.tax)) },
                  { key: 'cgst', header: 'CGST', value: (r) => r.tax / 2, render: (r) => money(r.tax / 2), align: 'right' },
                  { key: 'sgst', header: 'SGST', value: (r) => r.tax / 2, render: (r) => money(r.tax / 2), align: 'right' },
                ]}
              />

              <ReportTable
                caption="Purchases by GST rate"
                rows={engine.purchaseSlabs}
                rowKey={(r) => `p-${r.taxPercent}`}
                exportName="gst-purchases"
                columns={[
                  { key: 'rate', header: 'Rate', value: (r) => r.taxPercent, render: (r) => `${r.taxPercent}%` },
                  { key: 'lines', header: 'Lines', value: (r) => r.lineCount, align: 'right' },
                  { key: 'taxable', header: 'Taxable value', value: (r) => r.taxableValue, render: (r) => money(r.taxableValue), align: 'right', total: (rows) => money(sum(rows, (r) => r.taxableValue)) },
                  { key: 'tax', header: 'GST paid', value: (r) => r.tax, render: (r) => money(r.tax), align: 'right', total: (rows) => money(sum(rows, (r) => r.tax)) },
                  { key: 'total', header: 'Total', value: (r) => r.inclusiveValue, render: (r) => money(r.inclusiveValue), align: 'right', total: (rows) => money(sum(rows, (r) => r.inclusiveValue)) },
                ]}
              />
            </div>
          )}

          {/* ── PROFIT & LOSS ────────────────────────────────────────────── */}
          {activeTab === 'PL' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-line bg-surface shadow-xs">
                <div className="border-b border-line px-4 py-3">
                  <h2 className="text-sm font-black text-fg">Profit &amp; Loss — {rangeLabel}</h2>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Every line below is subtracted from the one above it. The workings under each label say where the
                    number came from.
                  </p>
                </div>

                <table className="w-full border-collapse text-sm">
                  <tbody className="divide-y divide-line">
                    <Line label="Gross value at MRP" amount={s.gross} workings={`${s.billCount} bills, before any discount`} />
                    <Line label="Item discounts" amount={s.itemDiscount} negative workings="given on individual medicines" />
                    <Line label="Bill discounts" amount={s.billDiscount} negative workings="given on whole bills" />
                    <Line label="Rounding" amount={s.roundOff} workings="rounding each bill to the rupee" />
                    <Line label="Collected at the counter" amount={s.charged} strong workings="what actually came in — matches the sales list" />

                    {s.returnedInclusive > 0 ? (
                      <Line label="Sales returns" amount={s.returnedInclusive} negative workings="credit notes to customers" />
                    ) : null}

                    {registered ? (
                      <Line label="GST owed to government" amount={s.outputTax} negative
                        workings="tax sitting inside the MRP — collected on the government's behalf, not income" />
                    ) : (
                      <Line label="GST owed to government" amount={0}
                        workings="none — not registered, so nothing is collected for the government" />
                    )}

                    <Line label="Your income" amount={s.netRevenueExGst} strong top
                      workings={registered ? 'what the shop keeps out of the sale' : 'the whole amount is yours'} />

                    <Line label="Cost of goods sold" amount={s.cogs} negative
                      workings={`supplier rate ${registered ? 'excluding' : 'including'} GST, less discounts, spread over units received (free goods included)`} />

                    {s.returnedCost > 0 ? (
                      <Line label="Cost of returned goods put back" amount={s.returnedCost} workings="restocked, so no longer a cost" />
                    ) : null}

                    <Line label="Gross profit" amount={s.grossProfit} strong top
                      workings={`${pct(s.marginPercent)} of income`} />
                  </tbody>
                </table>

                <div className="border-t border-line px-4 py-3 text-xs text-fg-muted">
                  Shop running costs — rent, salaries, electricity, licences — are not recorded in this system, so this is
                  gross profit. Subtract those separately to get what you actually take home.
                </div>
              </div>

              {s.cogsCoveragePercent < 99.5 ? (
                <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-subtle px-4 py-3 text-xs font-semibold text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Cost is known for {pct(s.cogsCoveragePercent)} of sales. The remaining {formatCurrency(s.revenueWithoutCost)}
                    has no purchase rate behind it, so profit above is overstated by whatever those medicines cost.
                  </span>
                </div>
              ) : null}

              <ReportTable<DayRow>
                caption="Profit day by day"
                rows={engine.days}
                rowKey={(d) => d.day}
                exportName="profit-by-day"
                initialSort={{ key: 'day', direction: 'desc' }}
                columns={[
                  { key: 'day', header: 'Date', value: (d) => d.day, render: (d) => d.label },
                  { key: 'revenue', header: 'Income', value: (d) => d.revenueExGst, render: (d) => money(d.revenueExGst), align: 'right', total: (r) => money(sum(r, (d) => d.revenueExGst)) },
                  { key: 'cost', header: 'Cost', value: (d) => d.cost, render: (d) => money(d.cost), align: 'right', total: (r) => money(sum(r, (d) => d.cost)) },
                  { key: 'profit', header: 'Profit', value: (d) => d.profit, render: (d) => <span className={d.profit >= 0 ? 'font-bold text-brand-hover' : 'font-bold text-danger'}>{money(d.profit)}</span>, align: 'right', total: (r) => money(sum(r, (d) => d.profit)) },
                  { key: 'margin', header: 'Margin', value: (d) => d.marginPercent, render: (d) => pct(d.marginPercent), align: 'right' },
                ]}
              />
            </div>
          )}

          {/* ── EXPIRY RISK ──────────────────────────────────────────────── */}
          {activeTab === 'EXPIRY' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Tile label="Within 30 days" value={formatCurrency(expiryRiskData.risk30Val)} tone="bad" />
                <Tile label="31 – 60 days" value={formatCurrency(expiryRiskData.risk60Val)} tone="accent" />
                <Tile label="61 – 90 days" value={formatCurrency(expiryRiskData.risk90Val)} />
                <Tile label="Total at risk" value={formatCurrency(expiryRiskData.totalRiskVal)} tone="bad" />
              </div>

              <ReportTable<ExpiryRiskRow>
                caption="Batches expiring within 90 days"
                rows={expiryRiskData.list}
                rowKey={(r) => `${r.productName}-${r.batchNumber}-${r.expiryDate}`}
                exportName="expiry-risk"
                initialSort={{ key: 'days', direction: 'asc' }}
                columns={[
                  { key: 'product', header: 'Medicine', value: (r) => r.productName },
                  { key: 'company', header: 'Company', value: (r) => r.companyName },
                  { key: 'batch', header: 'Batch', value: (r) => r.batchNumber },
                  { key: 'expiry', header: 'Expires', value: (r) => r.expiryDate, render: (r) => formatDate(r.expiryDate) },
                  {
                    key: 'days', header: 'Days left', value: (r) => r.daysLeft, align: 'right',
                    render: (r) => <span className={r.daysLeft <= 30 ? 'font-bold text-danger' : r.daysLeft <= 60 ? 'font-bold text-warn' : ''}>{r.daysLeft}</span>,
                  },
                  { key: 'qty', header: 'Units', value: (r) => r.quantity, align: 'right', total: (rows) => sum(rows, (r) => r.quantity).toLocaleString('en-IN') },
                  { key: 'value', header: 'Value at MRP', value: (r) => r.totalValue, render: (r) => money(r.totalValue), align: 'right', total: (rows) => money(sum(rows, (r) => r.totalValue)) },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {isPrintModalOpen && (
        <ReportPrintModal
          dateRangeLabel={rangeLabel}
          startDate={startDateObj.toLocaleDateString('en-IN')}
          endDate={endDateObj.toLocaleDateString('en-IN')}
          sales={filteredSales}
          purchases={filteredPurchases}
          metrics={{
            totalSalesRevenue: s.charged,
            totalPurchasesCost: s.purchaseTotal,
            totalOutputGst: s.outputTax,
            totalInputGst: s.inputTax,
            netGstPayable: s.netGstPayable,
            totalCogs: s.cogs,
            netGrossProfit: s.grossProfit,
            profitMarginPercent: s.marginPercent,
            cashSales: s.cash,
            upiSales: s.upi,
            cardSales: s.card,
            creditSales: s.credit,
            inventoryMrpValue: inventoryValue.mrp,
            inventoryCostValue: inventoryValue.cost,
          }}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </PageMain>
  );
}

/** Bill-level columns, shared by the Sales tab and the day-book drill-down. */
function billColumns(registered: boolean, money: (v: number) => string): Column<ExplodedSale>[] {
  return [
    { key: 'invoice', header: 'Bill #', value: (e) => e.bill.invoiceNumber || e.bill.id.slice(0, 8) },
    { key: 'date', header: 'Date', value: (e) => e.bill.createdAt, render: (e) => formatDate(e.bill.createdAt) },
    { key: 'customer', header: 'Customer', value: (e) => e.bill.customerName || e.bill.customer?.name || 'Walk-in' },
    { key: 'method', header: 'Paid by', value: (e) => String(e.bill.paymentMethod || 'CASH'), align: 'center' },
    { key: 'lines', header: 'Items', value: (e) => e.lines.length, align: 'right' },
    { key: 'gross', header: 'Gross MRP', value: (e) => e.gross, render: (e) => money(e.gross), align: 'right', total: (r) => money(r.reduce((t, e) => t + e.gross, 0)) },
    { key: 'disc', header: 'Discounts', value: (e) => e.itemDiscount + e.billDiscount, render: (e) => money(e.itemDiscount + e.billDiscount), align: 'right', total: (r) => money(r.reduce((t, e) => t + e.itemDiscount + e.billDiscount, 0)) },
    { key: 'charged', header: 'Grand total', value: (e) => e.bill.grandTotal || 0, render: (e) => money(e.bill.grandTotal || 0), align: 'right', total: (r) => money(r.reduce((t, e) => t + (e.bill.grandTotal || 0), 0)) },
    { key: 'tax', header: registered ? 'GST owed' : 'GST inside', value: (e) => e.tax, render: (e) => money(e.tax), align: 'right', total: (r) => money(r.reduce((t, e) => t + e.tax, 0)) },
    { key: 'cost', header: 'Cost', value: (e) => e.cost, render: (e) => money(e.cost), align: 'right', total: (r) => money(r.reduce((t, e) => t + e.cost, 0)) },
    {
      key: 'profit', header: 'Profit', value: (e) => e.profit, align: 'right',
      render: (e) => <span className={e.profit >= 0 ? 'font-bold text-brand-hover' : 'font-bold text-danger'}>{money(e.profit)}</span>,
      total: (r) => money(r.reduce((t, e) => t + e.profit, 0)),
    },
  ];
}
