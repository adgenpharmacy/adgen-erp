'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { RotateCcw, Plus, RefreshCw, Search, PackageX, Trash2 } from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import { useErpData } from '@/context/ErpDataContext';
import { useAuth } from '@/context/AuthContext';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import type { ReturnRecord, Product, Sale, Purchase } from '@/types';
import { getApiErrorMessage } from '@/types';
import {
  Button, Card, EmptyState, Field, Input, Select, Modal, PageHeader, StatusChip,
  TableWrap, Table, THead, TH, TR, TD, TableSkeleton, useToast, useConfirm,
} from '@/components/ui';

/**
 * A return is now raised against the document that created the stock movement — the sales bill
 * for a patient return, the supplier bill (or the expiring batch) for a return to a distributor.
 *
 * It used to be free text: the operator retyped the medicine, guessed the batch, and typed a
 * price. That let goods be credited that were never sold, batches be invented, and refunds be
 * given at the wrong price — and the over-return check only spoke up after the save failed.
 * Everything below is chosen from what actually happened.
 */

interface ReturnableSaleLine {
  productId: string;
  productName: string;
  packSize: number;
  packUnit: string;
  contentUnit: string;
  batchNumber: string | null;
  expiryDate: string | null;
  soldQuantity: number;
  alreadyReturned: number;
  returnableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}

interface ReturnableSaleBill {
  salesBillId: string;
  invoiceNumber: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  grandTotal: number;
  lines: ReturnableSaleLine[];
}

interface ReturnablePurchaseLine {
  productId: string;
  productName: string;
  packSize: number;
  packUnit: string;
  batchNumber: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  isExpired: boolean;
  purchaseRate: number;
  taxPercent: number;
  receivedUnits: number;
  alreadyReturned: number;
  onHandUnits: number;
  returnableUnits: number;
}

interface ReturnablePurchaseBill {
  purchaseBillId: string;
  invoiceNumber: string;
  purchaseDate: string;
  partyId: string | null;
  partyName: string | null;
  grandTotal: number;
  lines: ReturnablePurchaseLine[];
}

interface ExpiredBatch {
  batchId: string;
  productId: string;
  productName: string;
  packSize: number;
  batchNumber: string;
  expiryDate: string;
  daysToExpiry: number;
  quantity: number;
  purchaseRate: number;
  purchaseBillId: string | null;
  invoiceNumber: string | null;
  partyId: string | null;
  partyName: string | null;
}

/** What the operator has decided to send back, keyed by line. */
type Picked = Record<string, { quantity: number; condition?: string; reason?: string }>;

export default function ReturnsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { refreshData } = useErpData();
  const isOwner = user?.role === 'OWNER';

  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [salesReturns, setSalesReturns] = useState<ReturnRecord[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<ReturnRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inspect, setInspect] = useState<(ReturnRecord & { returnType: 'SALES' | 'PURCHASE' }) | null>(null);

  const productName = (productId: string) => products.find((p) => p.id === productId)?.name || 'Medicine';

  // ── Patient return composer ───────────────────────────────────────────────
  const [srOpen, setSrOpen] = useState(false);
  const [srSearch, setSrSearch] = useState('');
  const [srBills, setSrBills] = useState<Sale[]>([]);
  const [srBill, setSrBill] = useState<ReturnableSaleBill | null>(null);
  const [srPicked, setSrPicked] = useState<Picked>({});
  const [srDeduction, setSrDeduction] = useState(0);
  const [srRefundMethod, setSrRefundMethod] = useState('CASH');
  const [srNotes, setSrNotes] = useState('');

  // ── Supplier return composer ──────────────────────────────────────────────
  const [prOpen, setPrOpen] = useState(false);
  const [prMode, setPrMode] = useState<'BILL' | 'EXPIRED'>('EXPIRED');
  const [prSearch, setPrSearch] = useState('');
  const [prBills, setPrBills] = useState<Purchase[]>([]);
  const [prBill, setPrBill] = useState<ReturnablePurchaseBill | null>(null);
  const [prPicked, setPrPicked] = useState<Picked>({});
  const [expiring, setExpiring] = useState<ExpiredBatch[]>([]);
  const [expiredPicked, setExpiredPicked] = useState<Picked>({});
  const [expiredSupplier, setExpiredSupplier] = useState<string | null>(null);
  const [prDeduction, setPrDeduction] = useState(0);
  const [prRefundMethod, setPrRefundMethod] = useState('DEBIT_NOTE');
  const [prNotes, setPrNotes] = useState('');

  /**
   * `showSpinner` is false on the initial load: `loading` already starts true, so flipping it
   * again synchronously inside the mount effect only adds a redundant render.
   */
  const loadReturns = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [sr, pr, prod] = await Promise.all([
        api.get<ReturnRecord[]>('/returns/sales').then((r) => r.data).catch(() => []),
        api.get<ReturnRecord[]>('/returns/purchases').then((r) => r.data).catch(() => []),
        api.get<Product[]>('/products').then((r) => r.data).catch(() => []),
      ]);
      setSalesReturns(sr || []);
      setPurchaseReturns(pr || []);
      setProducts(prod || []);
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * The initial fetch is written as a promise chain rather than `await`-ing loadReturns: every
   * setState then sits inside a callback, which is what the effect lint rule asks for — it
   * cannot tell that the awaited version only sets state after the request resolves.
   */
  useEffect(() => {
    Promise.all([
      api.get<ReturnRecord[]>('/returns/sales').then((r) => r.data).catch(() => [] as ReturnRecord[]),
      api.get<ReturnRecord[]>('/returns/purchases').then((r) => r.data).catch(() => [] as ReturnRecord[]),
      api.get<Product[]>('/products').then((r) => r.data).catch(() => [] as Product[]),
    ])
      .then(([sr, pr, prod]) => {
        setSalesReturns(sr || []);
        setPurchaseReturns(pr || []);
        setProducts(prod || []);
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Withdraw a credit or debit note.
   *
   * A note raised against the wrong bill, for the wrong medicine, or twice by a double-click was
   * final: the stock had moved and the refund was on the ledger with nothing in the app able to
   * take either back. The server reverses exactly what raising it did — including pulling the
   * restocked goods off the shelf again — and refuses if that stock has since been sold, so the
   * failure is explained rather than silently leaving inventory wrong.
   */
  const cancelReturn = async (record: ReturnRecord, type: 'SALES' | 'PURCHASE') => {
    const isSales = type === 'SALES';
    const ok = await confirm({
      title: `Cancel ${isSales ? 'credit' : 'debit'} note ${record.returnNumber}?`,
      message: isSales
        ? 'The returned medicines come back off the shelf, the refund is removed from the customer’s ledger, and the original invoice goes back to what it was owed. This cannot be undone.'
        : 'The medicines sent back to the supplier return to stock and the debit note is removed from the supplier’s balance. This cannot be undone.',
      confirmLabel: 'Cancel note',
    });
    if (!ok) return;

    try {
      await api.delete(`/returns/${isSales ? 'sales' : 'purchases'}/${record.id}`);
      toast.success(`${record.returnNumber} cancelled`, 'Stock and balances reversed.');
      setInspect(null);
      invalidateCatalogCache();
      await Promise.all([loadReturns(false), refreshData()]);
    } catch (err) {
      toast.error('Could not cancel the note', getApiErrorMessage(err));
    }
  };

  const openSalesComposer = async () => {
    setSrOpen(true);
    setSrBill(null);
    setSrPicked({});
    setSrDeduction(0);
    setSrNotes('');
    try {
      const res = await api.get<Sale[]>('/sales?summary=1');
      setSrBills(res.data || []);
    } catch {
      toast.error('Could not load bills', 'Try again in a moment.');
    }
  };

  const srMatches = useMemo(() => {
    const q = srSearch.trim().toLowerCase();
    const rows = q
      ? srBills.filter(
          (b) =>
            (b.invoiceNumber || '').toLowerCase().includes(q) ||
            (b.customerName || '').toLowerCase().includes(q) ||
            (b.customerPhone || '').includes(q)
        )
      : srBills;
    return rows.slice(0, 25);
  }, [srBills, srSearch]);

  const chooseSalesBill = async (billId: string) => {
    try {
      const res = await api.get<ReturnableSaleBill>(`/returns/sales/returnable/${billId}`);
      setSrBill(res.data);
      setSrPicked({});
    } catch (err) {
      toast.error('Could not open that bill', getApiErrorMessage(err));
    }
  };

  const srGross = useMemo(() => {
    if (!srBill) return 0;
    return srBill.lines.reduce((sum, line) => sum + (srPicked[line.productId]?.quantity || 0) * line.unitPrice, 0);
  }, [srBill, srPicked]);

  const srRefund = Math.max(0, srGross - srDeduction);

  const submitSalesReturn = async () => {
    if (!srBill) return;
    const items = srBill.lines
      .filter((l) => (srPicked[l.productId]?.quantity || 0) > 0)
      .map((l) => ({
        productId: l.productId,
        batchNumber: l.batchNumber,
        quantity: srPicked[l.productId].quantity,
        unitPrice: l.unitPrice,
        condition: srPicked[l.productId].condition || 'RESTOCK',
        reason: srPicked[l.productId].reason || null,
      }));

    if (items.length === 0) {
      toast.error('Nothing selected', 'Enter a return quantity against at least one medicine.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/returns/sales', {
        salesBillId: srBill.salesBillId,
        customerId: srBill.customerId,
        refundMethod: srRefundMethod,
        discount: srDeduction,
        notes: srNotes || null,
        items,
      });
      invalidateCatalogCache();
      void refreshData();
      toast.success('Credit note raised', `${formatCurrency(srRefund)} refunded.`);
      setSrOpen(false);
      await loadReturns();
    } catch (err) {
      toast.error('Could not raise the credit note', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openPurchaseComposer = async () => {
    setPrOpen(true);
    setPrBill(null);
    setPrPicked({});
    setExpiredPicked({});
    setExpiredSupplier(null);
    setPrDeduction(0);
    setPrNotes('');
    try {
      const [bills, exp] = await Promise.all([
        api.get<Purchase[]>('/purchases?summary=1').then((r) => r.data).catch(() => []),
        api.get<ExpiredBatch[]>('/returns/purchases/expired?withinDays=60').then((r) => r.data).catch(() => []),
      ]);
      setPrBills(bills || []);
      setExpiring(exp || []);
    } catch {
      toast.error('Could not load supplier bills', 'Try again in a moment.');
    }
  };

  const prMatches = useMemo(() => {
    const q = prSearch.trim().toLowerCase();
    const rows = q
      ? prBills.filter(
          (b) => (b.invoiceNumber || '').toLowerCase().includes(q) || (b.party?.name || '').toLowerCase().includes(q)
        )
      : prBills;
    return rows.slice(0, 25);
  }, [prBills, prSearch]);

  const choosePurchaseBill = async (billId: string) => {
    try {
      const res = await api.get<ReturnablePurchaseBill>(`/returns/purchases/returnable/${billId}`);
      setPrBill(res.data);
      setPrPicked({});
    } catch (err) {
      toast.error('Could not open that bill', getApiErrorMessage(err));
    }
  };

  /** Expiring batches grouped by supplier — a debit note goes to one distributor. */
  const expiringBySupplier = useMemo(() => {
    const groups = new Map<string, { partyId: string | null; partyName: string; batches: ExpiredBatch[] }>();
    for (const b of expiring) {
      const key = b.partyId || 'unknown';
      const group = groups.get(key) || { partyId: b.partyId, partyName: b.partyName || 'Unknown supplier', batches: [] };
      group.batches.push(b);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.batches.length - a.batches.length);
  }, [expiring]);

  const prGross = useMemo(() => {
    if (prMode === 'BILL') {
      if (!prBill) return 0;
      return prBill.lines.reduce((sum, l) => sum + (prPicked[l.productId]?.quantity || 0) * l.purchaseRate, 0);
    }
    // purchaseRate is per pack while the picked quantity is in content units.
    return expiring.reduce(
      (sum, b) => sum + (expiredPicked[b.batchId]?.quantity || 0) * (b.purchaseRate / (b.packSize || 1)),
      0
    );
  }, [prMode, prBill, prPicked, expiring, expiredPicked]);

  const prRefund = Math.max(0, prGross - prDeduction);

  const submitPurchaseReturn = async () => {
    let items: Record<string, unknown>[] = [];
    let purchaseBillId: string | null = null;
    let partyId: string | null = null;

    if (prMode === 'BILL') {
      if (!prBill) return;
      purchaseBillId = prBill.purchaseBillId;
      partyId = prBill.partyId;
      items = prBill.lines
        .filter((l) => (prPicked[l.productId]?.quantity || 0) > 0)
        .map((l) => ({
          productId: l.productId,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          quantity: prPicked[l.productId].quantity,
          purchaseRate: l.purchaseRate,
          reason: prPicked[l.productId].reason || (l.isExpired ? 'Expired stock' : null),
        }));
    } else {
      const chosen = expiring.filter((b) => (expiredPicked[b.batchId]?.quantity || 0) > 0);
      const suppliers = new Set(chosen.map((b) => b.partyId || 'unknown'));
      if (suppliers.size > 1) {
        toast.error('Mixed suppliers', 'A debit note goes to one supplier. Raise a separate note for the rest.');
        return;
      }
      const first = chosen[0];
      purchaseBillId = first?.purchaseBillId ?? null;
      partyId = first?.partyId ?? null;
      items = chosen.map((b) => ({
        productId: b.productId,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: expiredPicked[b.batchId].quantity,
        purchaseRate: b.purchaseRate / (b.packSize || 1),
        reason: expiredPicked[b.batchId].reason || (b.daysToExpiry < 0 ? 'Expired' : 'Near expiry'),
      }));
    }

    if (items.length === 0) {
      toast.error('Nothing selected', 'Enter a return quantity against at least one medicine.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/returns/purchases', {
        purchaseBillId,
        partyId,
        refundMethod: prRefundMethod,
        discount: prDeduction,
        notes: prNotes || null,
        items,
      });
      invalidateCatalogCache();
      void refreshData();
      toast.success('Debit note raised', `${formatCurrency(prRefund)} claimed from the supplier.`);
      setPrOpen(false);
      await loadReturns();
    } catch (err) {
      toast.error('Could not raise the debit note', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const rows = activeTab === 'SALES' ? salesReturns : purchaseReturns;
  const withExtras = (r: ReturnRecord) =>
    r as ReturnRecord & {
      discount?: number;
      customer?: { name?: string };
      salesBill?: { invoiceNumber?: string; customerName?: string };
      purchaseBill?: { invoiceNumber?: string; party?: { name?: string } };
    };

  return (
    <PageMain>
      <PageHeader
        title="Returns"
        subtitle={`${salesReturns.length} credit notes · ${purchaseReturns.length} debit notes`}
        action={
          <>
            <Button variant="outline" iconOnly onClick={() => void loadReturns()} title="Refresh" aria-label="Refresh returns">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin text-brand')} />
            </Button>
            <Button onClick={activeTab === 'SALES' ? openSalesComposer : openPurchaseComposer}>
              <Plus className="h-4 w-4" aria-hidden />
              {activeTab === 'SALES' ? 'Patient return' : 'Return to supplier'}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-1 rounded-md bg-sunken p-1">
        {(['SALES', 'PURCHASE'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-bold transition-colors',
              activeTab === tab ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
            )}
          >
            {tab === 'SALES' ? 'Patient returns (credit notes)' : 'Supplier returns (debit notes)'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title={activeTab === 'SALES' ? 'No patient returns yet' : 'No supplier returns yet'}
            message={
              activeTab === 'SALES'
                ? 'Raise one against the original bill — stock and refund then follow automatically.'
                : 'Start from expiring stock; the batch and expiry are filled in for you.'
            }
            action={
              <Button onClick={activeTab === 'SALES' ? openSalesComposer : openPurchaseComposer}>
                <Plus className="h-4 w-4" aria-hidden /> New return
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Note #</TH>
                  <TH>Date</TH>
                  <TH>{activeTab === 'SALES' ? 'Patient / Bill' : 'Supplier / Bill'}</TH>
                  <TH align="right">Items</TH>
                  <TH align="right">Deduction</TH>
                  <TH align="right">Net</TH>
                  {isOwner ? <TH align="right">Actions</TH> : null}
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const x = withExtras(r);
                  return (
                    <TR key={r.id} onClick={() => setInspect({ ...r, returnType: activeTab })} className="group cursor-pointer">
                      <TD className="font-mono text-xs font-bold">{r.returnNumber}</TD>
                      <TD className="text-fg-muted">{formatDate(r.createdAt)}</TD>
                      <TD>
                        <span className="block font-semibold">
                          {activeTab === 'SALES'
                            ? x.customer?.name || x.salesBill?.customerName || 'Walk-in patient'
                            : x.purchaseBill?.party?.name || 'Supplier'}
                        </span>
                        <span className="block font-mono text-[11px] text-fg-subtle">
                          {activeTab === 'SALES' ? x.salesBill?.invoiceNumber || '—' : x.purchaseBill?.invoiceNumber || '—'}
                        </span>
                      </TD>
                      <TD align="right" className="font-mono">{r.items?.length || 0}</TD>
                      <TD align="right" className="font-mono text-danger">
                        {x.discount ? `−${formatCurrency(x.discount)}` : '—'}
                      </TD>
                      <TD align="right" className="font-mono font-bold text-brand-hover">
                        {formatCurrency(r.totalReturnAmount || 0)}
                      </TD>
                      {isOwner ? (
                        <TD align="right">
                          <span
                            className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => cancelReturn(r, activeTab)}
                              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                              title={`Cancel ${activeTab === 'SALES' ? 'credit' : 'debit'} note`}
                              aria-label={`Cancel note ${r.returnNumber}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* ── PATIENT RETURN ─────────────────────────────────────────────────── */}
      <Modal
        open={srOpen}
        onClose={() => setSrOpen(false)}
        title="Patient return"
        subtitle={srBill ? `Against bill ${srBill.invoiceNumber}` : 'Find the bill the medicines were sold on'}
        size="xl"
        footer={
          srBill ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-fg-muted">Refund </span>
                <span className="font-mono text-lg font-black text-brand">{formatCurrency(srRefund)}</span>
                {srDeduction > 0 ? (
                  <span className="ml-2 text-xs text-fg-subtle">
                    ({formatCurrency(srGross)} less {formatCurrency(srDeduction)} deduction)
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSrBill(null)}>Pick another bill</Button>
                <Button onClick={submitSalesReturn} loading={submitting}>Raise credit note</Button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="space-y-4 p-5">
          {!srBill ? (
            <>
              <Input
                icon={Search}
                autoFocus
                value={srSearch}
                onChange={(e) => setSrSearch(e.target.value)}
                placeholder="Bill number, patient name or phone…"
                aria-label="Find the original bill"
              />
              <div className="max-h-96 overflow-y-auto rounded-md border border-line">
                {srMatches.length === 0 ? (
                  <p className="p-6 text-center text-sm text-fg-muted">No bills match that.</p>
                ) : (
                  srMatches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => chooseSalesBill(b.id)}
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-raised"
                    >
                      <span>
                        <span className="block font-mono text-xs font-bold text-fg">{b.invoiceNumber}</span>
                        <span className="block text-xs text-fg-muted">
                          {b.customerName || 'Walk-in'} · {formatDate(b.createdAt)}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-bold text-brand-hover">{formatCurrency(b.grandTotal || 0)}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-line bg-raised px-4 py-2.5 text-xs">
                <span className="font-bold text-fg">{srBill.customerName || 'Walk-in patient'}</span>
                {srBill.customerPhone ? <span className="ml-2 font-mono text-fg-muted">{srBill.customerPhone}</span> : null}
                <span className="ml-2 text-fg-subtle">
                  · sold {formatDate(srBill.createdAt)} · bill {formatCurrency(srBill.grandTotal)}
                </span>
              </div>

              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Medicine</TH>
                      <TH>Batch</TH>
                      <TH align="right">Sold</TH>
                      <TH align="right">Already back</TH>
                      <TH align="right">Can return</TH>
                      <TH align="right">Returning</TH>
                      <TH>Condition</TH>
                      <TH align="right">Value</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {srBill.lines.map((line) => {
                      const picked = srPicked[line.productId]?.quantity || 0;
                      return (
                        <TR key={line.productId}>
                          <TD className="font-semibold">{line.productName}</TD>
                          <TD className="font-mono text-xs text-fg-muted">
                            {line.batchNumber || '—'}
                            {line.expiryDate ? (
                              <span className="block text-[10px] text-fg-subtle">exp {formatDate(line.expiryDate)}</span>
                            ) : null}
                          </TD>
                          <TD align="right" className="font-mono">{line.soldQuantity}</TD>
                          <TD align="right" className="font-mono text-fg-subtle">{line.alreadyReturned || '—'}</TD>
                          <TD align="right" className="font-mono font-bold">{line.returnableQuantity}</TD>
                          <TD align="right">
                            <input
                              type="number"
                              min={0}
                              max={line.returnableQuantity}
                              step="any"
                              value={picked || ''}
                              onChange={(e) => {
                                // Clamped as you type, not at save time: the server enforces the
                                // same ceiling, but discovering it on rejection is no use at a counter.
                                const qty = Math.max(0, Math.min(parseFloat(e.target.value) || 0, line.returnableQuantity));
                                setSrPicked((prev) => ({
                                  ...prev,
                                  [line.productId]: { ...prev[line.productId], quantity: qty },
                                }));
                              }}
                              disabled={line.returnableQuantity <= 0}
                              className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-right font-mono text-sm disabled:opacity-40"
                              aria-label={`Return quantity for ${line.productName}`}
                            />
                          </TD>
                          <TD>
                            <select
                              value={srPicked[line.productId]?.condition || 'RESTOCK'}
                              onChange={(e) =>
                                setSrPicked((prev) => ({
                                  ...prev,
                                  [line.productId]: {
                                    ...prev[line.productId],
                                    quantity: prev[line.productId]?.quantity || 0,
                                    condition: e.target.value,
                                  },
                                }))
                              }
                              className="h-8 rounded-md border border-line bg-surface px-2 text-xs font-semibold"
                              aria-label={`Condition for ${line.productName}`}
                            >
                              <option value="RESTOCK">Back to shelf</option>
                              <option value="DAMAGED">Damaged — write off</option>
                            </select>
                          </TD>
                          <TD align="right" className="font-mono font-bold">{formatCurrency(picked * line.unitPrice)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Deduction withheld" hint="Opened pack, restocking fee">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={srDeduction || ''}
                    onChange={(e) => setSrDeduction(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="₹ 0.00"
                    className="font-mono"
                  />
                </Field>
                <Field label="Refund by">
                  <Select value={srRefundMethod} onChange={(e) => setSrRefundMethod(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CREDIT_NOTE">Adjust against the bill</option>
                  </Select>
                </Field>
                <Field label="Note">
                  <Input value={srNotes} onChange={(e) => setSrNotes(e.target.value)} placeholder="Reason, optional" />
                </Field>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── SUPPLIER RETURN ────────────────────────────────────────────────── */}
      <Modal
        open={prOpen}
        onClose={() => setPrOpen(false)}
        title="Return to supplier"
        subtitle="Expired or damaged stock going back on a debit note"
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-fg-muted">Claim </span>
              <span className="font-mono text-lg font-black text-brand">{formatCurrency(prRefund)}</span>
              {prDeduction > 0 ? (
                <span className="ml-2 text-xs text-fg-subtle">
                  ({formatCurrency(prGross)} less {formatCurrency(prDeduction)})
                </span>
              ) : null}
            </div>
            <Button onClick={submitPurchaseReturn} loading={submitting}>Raise debit note</Button>
          </div>
        }
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-1 rounded-md bg-sunken p-1">
            {([['EXPIRED', 'From expiring stock'], ['BILL', 'From a supplier bill']] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setPrMode(mode)}
                aria-pressed={prMode === mode}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-xs font-bold transition-colors',
                  prMode === mode ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {prMode === 'EXPIRED' ? (
            expiring.length === 0 ? (
              <EmptyState icon={PackageX} title="Nothing expiring within 60 days" message="No stock needs returning right now." />
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {expiringBySupplier.map((g) => (
                    <button
                      key={g.partyId || 'unknown'}
                      onClick={() => setExpiredSupplier(expiredSupplier === (g.partyId || 'unknown') ? null : g.partyId || 'unknown')}
                      aria-pressed={expiredSupplier === (g.partyId || 'unknown')}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-bold transition-colors',
                        expiredSupplier === (g.partyId || 'unknown')
                          ? 'border-brand bg-brand-subtle text-brand-hover'
                          : 'border-line text-fg-muted hover:text-fg'
                      )}
                    >
                      {g.partyName} ({g.batches.length})
                    </button>
                  ))}
                </div>

                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Medicine</TH>
                        <TH>Batch</TH>
                        <TH>Expiry</TH>
                        <TH align="right">On shelf</TH>
                        <TH align="right">Returning</TH>
                        <TH>Supplier</TH>
                        <TH align="right">Value</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {expiring
                        .filter((b) => !expiredSupplier || (b.partyId || 'unknown') === expiredSupplier)
                        .map((b) => {
                          const picked = expiredPicked[b.batchId]?.quantity || 0;
                          const unitRate = b.purchaseRate / (b.packSize || 1);
                          return (
                            <TR key={b.batchId}>
                              <TD className="font-semibold">{b.productName}</TD>
                              <TD className="font-mono text-xs">{b.batchNumber}</TD>
                              <TD>
                                <span className={cn('font-mono text-xs', b.daysToExpiry < 0 ? 'font-bold text-danger' : 'text-warn')}>
                                  {formatDate(b.expiryDate)}
                                </span>
                                <span className="block text-[10px] text-fg-subtle">
                                  {b.daysToExpiry < 0 ? `expired ${Math.abs(b.daysToExpiry)}d ago` : `${b.daysToExpiry}d left`}
                                </span>
                              </TD>
                              <TD align="right" className="font-mono">{b.quantity}</TD>
                              <TD align="right">
                                <input
                                  type="number"
                                  min={0}
                                  max={b.quantity}
                                  step="any"
                                  value={picked || ''}
                                  onChange={(e) => {
                                    const qty = Math.max(0, Math.min(parseFloat(e.target.value) || 0, b.quantity));
                                    setExpiredPicked((prev) => ({ ...prev, [b.batchId]: { ...prev[b.batchId], quantity: qty } }));
                                  }}
                                  className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-right font-mono text-sm"
                                  aria-label={`Return quantity for ${b.productName} ${b.batchNumber}`}
                                />
                              </TD>
                              <TD className="text-xs text-fg-muted">{b.partyName || '—'}</TD>
                              <TD align="right" className="font-mono font-bold">{formatCurrency(picked * unitRate)}</TD>
                            </TR>
                          );
                        })}
                    </tbody>
                  </Table>
                </TableWrap>
              </>
            )
          ) : !prBill ? (
            <>
              <Input
                icon={Search}
                autoFocus
                value={prSearch}
                onChange={(e) => setPrSearch(e.target.value)}
                placeholder="Supplier bill number or distributor name…"
                aria-label="Find the supplier bill"
              />
              <div className="max-h-96 overflow-y-auto rounded-md border border-line">
                {prMatches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => choosePurchaseBill(b.id)}
                    className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-raised"
                  >
                    <span>
                      <span className="block font-mono text-xs font-bold text-fg">{b.invoiceNumber}</span>
                      <span className="block text-xs text-fg-muted">
                        {b.party?.name || 'Supplier'} · {formatDate(b.purchaseDate || b.createdAt)}
                      </span>
                    </span>
                    <span className="font-mono text-sm font-bold text-accent">{formatCurrency(b.grandTotal || 0)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-line bg-raised px-4 py-2.5 text-xs">
                <span className="font-bold text-fg">{prBill.partyName}</span>
                <span className="ml-2 font-mono text-fg-muted">{prBill.invoiceNumber}</span>
                <span className="ml-2 text-fg-subtle">· received {formatDate(prBill.purchaseDate)}</span>
                <button onClick={() => setPrBill(null)} className="ml-3 font-bold text-brand hover:underline">
                  change bill
                </button>
              </div>

              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Medicine</TH>
                      <TH>Batch</TH>
                      <TH>Expiry</TH>
                      <TH align="right">Received</TH>
                      <TH align="right">On shelf</TH>
                      <TH align="right">Can return</TH>
                      <TH align="right">Returning</TH>
                      <TH align="right">Value</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {prBill.lines.map((line) => {
                      const picked = prPicked[line.productId]?.quantity || 0;
                      return (
                        <TR key={line.productId}>
                          <TD className="font-semibold">{line.productName}</TD>
                          <TD className="font-mono text-xs">{line.batchNumber || '—'}</TD>
                          <TD>
                            <span className={cn('font-mono text-xs', line.isExpired && 'font-bold text-danger')}>
                              {line.expiryDate ? formatDate(line.expiryDate) : '—'}
                            </span>
                            {line.isExpired ? <span className="block text-[10px] font-bold text-danger">expired</span> : null}
                          </TD>
                          <TD align="right" className="font-mono">{line.receivedUnits}</TD>
                          <TD align="right" className="font-mono">{line.onHandUnits}</TD>
                          <TD align="right" className="font-mono font-bold">{line.returnableUnits}</TD>
                          <TD align="right">
                            <input
                              type="number"
                              min={0}
                              max={line.returnableUnits}
                              step="any"
                              value={picked || ''}
                              onChange={(e) => {
                                const qty = Math.max(0, Math.min(parseFloat(e.target.value) || 0, line.returnableUnits));
                                setPrPicked((prev) => ({ ...prev, [line.productId]: { ...prev[line.productId], quantity: qty } }));
                              }}
                              disabled={line.returnableUnits <= 0}
                              className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-right font-mono text-sm disabled:opacity-40"
                              aria-label={`Return quantity for ${line.productName}`}
                            />
                          </TD>
                          <TD align="right" className="font-mono font-bold">{formatCurrency(picked * line.purchaseRate)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Deduction by supplier" hint="Short credit, handling charge">
              <Input
                type="number"
                min="0"
                step="any"
                value={prDeduction || ''}
                onChange={(e) => setPrDeduction(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="₹ 0.00"
                className="font-mono"
              />
            </Field>
            <Field label="Settled by">
              <Select value={prRefundMethod} onChange={(e) => setPrRefundMethod(e.target.value)}>
                <option value="DEBIT_NOTE">Debit note against the account</option>
                <option value="CASH">Cash refund</option>
                <option value="UPI">UPI refund</option>
              </Select>
            </Field>
            <Field label="Note">
              <Input value={prNotes} onChange={(e) => setPrNotes(e.target.value)} placeholder="Reason, optional" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* ── INSPECT ────────────────────────────────────────────────────────── */}
      <Modal
        open={!!inspect}
        onClose={() => setInspect(null)}
        title={inspect ? `${inspect.returnType === 'SALES' ? 'Credit note' : 'Debit note'} ${inspect.returnNumber}` : ''}
        size="lg"
        footer={
          inspect ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isOwner ? (
                <Button variant="danger" onClick={() => cancelReturn(inspect, inspect.returnType)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Cancel this note
                </Button>
              ) : <span />}
              <Button variant="ghost" onClick={() => setInspect(null)}>Close</Button>
            </div>
          ) : null
        }
      >
        {inspect ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['Raised', formatDate(inspect.createdAt)],
                ['Items', String(inspect.items?.length || 0)],
                ['Deduction', formatCurrency(withExtras(inspect).discount || 0)],
                ['Net', formatCurrency(inspect.totalReturnAmount || 0)],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-md border border-line bg-raised px-3 py-2">
                  <span className="block text-[11px] font-bold uppercase text-fg-subtle">{label}</span>
                  <span className="mt-0.5 block font-mono text-sm font-bold text-fg">{value}</span>
                </div>
              ))}
            </div>

            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Medicine</TH>
                    <TH>Batch</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Rate</TH>
                    <TH>Condition</TH>
                    <TH align="right">Value</TH>
                  </tr>
                </THead>
                <tbody>
                  {(inspect.items || []).map((item, idx) => (
                    <TR key={idx}>
                      <TD className="font-semibold">{item.product?.name || item.productName || productName(item.productId)}</TD>
                      <TD className="font-mono text-xs text-fg-muted">{item.batchNumber || '—'}</TD>
                      <TD align="right" className="font-mono">{item.quantity}</TD>
                      <TD align="right" className="font-mono">{formatCurrency(item.unitPrice ?? item.purchaseRate ?? 0)}</TD>
                      <TD>
                        {item.condition ? (
                          <StatusChip tone={item.condition === 'RESTOCK' ? 'success' : 'warning'} small>
                            {item.condition === 'RESTOCK' ? 'Back to shelf' : 'Written off'}
                          </StatusChip>
                        ) : (
                          <span className="text-xs text-fg-subtle">{item.reason || '—'}</span>
                        )}
                      </TD>
                      <TD align="right" className="font-mono font-bold">{formatCurrency(item.totalAmount || 0)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            {inspect.notes ? (
              <p className="rounded-md border border-line bg-raised px-3 py-2 text-xs text-fg-muted">{inspect.notes}</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </PageMain>
  );
}
