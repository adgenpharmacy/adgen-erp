'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api-client';
import PurchasePrintModal from '@/components/invoice/PurchasePrintModal';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import {
  Search,
  Plus,
  Printer,
  Trash2,
  Eye,
  FileText,
  RefreshCw,
  Building2,
  ShoppingBag,
  Edit3,
  IndianRupee,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageMain from '@/components/layout/PageMain';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  StatCard,
  StatusChip,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  TableSkeleton,
  useToast,
  useConfirm,
} from '@/components/ui';
import type { Purchase } from '@/types';
import { getApiErrorMessage } from '@/types';
import DayNavigator, { isOnDay, todayKey } from '@/components/common/DayNavigator';

const STATUS_TABS = [
  { id: 'ALL', label: 'All Purchases' },
  { id: 'PAID', label: 'Paid' },
  { id: 'CREDIT', label: 'Pending Credit' },
];

function PurchasesPageContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const billIdFromUrl = searchParams.get('bill');
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { purchases: cachedPurchases, loading, refreshData } = useErpData();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  // Opens on today's inward, steps a day at a time from there.
  const [day, setDay] = useState<string | null>(() => todayKey());
  const [productMatches, setProductMatches] = useState<Purchase[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [inspectBill, setInspectBill] = useState<Purchase | null>(null);

  /**
   * The list arrives without its lines, so the detail view loads them on demand. The summary
   * shows at once and the items fill in when they arrive.
   */
  const openInspect = async (bill: Purchase) => {
    setInspectBill(bill);
    try {
      const res = await api.get(`/purchases/${bill.id}`);
      setInspectBill((current) => (current && current.id === bill.id ? res.data : current));
    } catch {
      /* keep the summary view */
    }
  };
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<Purchase | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setPurchases(cachedPurchases);
  }, [cachedPurchases]);

  // Debounced medicine-name search; the cached list has no line items to match against.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setProductMatches(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<Purchase[]>(`/purchases?summary=1&q=${encodeURIComponent(term)}`)
        .then((res) => {
          if (!cancelled) setProductMatches(res.data || []);
        })
        .catch(() => {
          if (!cancelled) setProductMatches(null);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  // Deep link from an inventory batch: /purchases?bill=<id> opens that bill's details
  // directly, so the operator lands on the supplier invoice the stock came from.
  useEffect(() => {
    if (!billIdFromUrl || purchases.length === 0) return;
    const target = purchases.find((p) => p.id === billIdFromUrl);
    if (target) openInspect(target);
  }, [billIdFromUrl, purchases]);

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this purchase bill?',
      message: 'The bill and its received stock batches will be removed. This cannot be undone.',
      confirmLabel: 'Delete bill',
    });
    if (!ok) return;
    try {
      await api.delete(`/purchases/${id}`);
      toast.success('Purchase bill deleted');
      await refreshData();
    } catch (err) {
      toast.error('Failed to delete purchase bill', getApiErrorMessage(err));
    }
  };

  const isSearching = search.trim().length > 0;

  /*
   * Browsing is a day at a time; searching looks across every date. Same rule as the sales list.
   * Medicine-name matches come from the server because the cached list carries no line items.
   */
  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = isSearching ? (productMatches ?? purchases) : purchases;

    return source
      .filter((p) => {
        const partyName = p.party?.name || '';
        const matchesSearch =
          !isSearching ||
          productMatches !== null ||
          (p.invoiceNumber || '').toLowerCase().includes(q) ||
          partyName.toLowerCase().includes(q);

        if (!matchesSearch) return false;

        if (!isSearching && day !== null && !isOnDay(p.purchaseDate || p.createdAt, day)) return false;

        if (statusFilter === 'PAID') return p.isPaid;
        if (statusFilter === 'CREDIT') return !p.isPaid;

        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.purchaseDate || a.createdAt).getTime();
        const dateB = new Date(b.purchaseDate || b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [purchases, search, statusFilter, day, isSearching, productMatches]);

  // The cards describe the rows on screen, not the whole ledger.
  const stats = useMemo(() => {
    let totalProcurement = 0;
    let paidTotal = 0;
    let pendingCredit = 0;
    let paidCount = 0;
    let creditCount = 0;

    filteredPurchases.forEach((p) => {
      const amt = p.grandTotal || 0;
      totalProcurement += amt;
      if (p.isPaid) {
        paidTotal += amt;
        paidCount++;
      } else {
        pendingCredit += amt;
        creditCount++;
      }
    });

    return {
      totalBills: filteredPurchases.length,
      totalProcurement,
      paidTotal,
      pendingCredit,
      paidCount,
      creditCount,
    };
  }, [filteredPurchases]);

  return (
    <PageMain>
      <PageHeader
        title="Supplier Purchase Bills"
        subtitle={
          isSearching
            ? `${stats.totalBills.toLocaleString('en-IN')} bills match “${search.trim()}” · all dates`
            : `${stats.totalBills.toLocaleString('en-IN')} bills · ${day === null ? 'all dates' : 'selected day'}`
        }
        action={
          <>
            <Button
              variant="outline"
              iconOnly
              onClick={() => refreshData()}
              title="Refresh purchases"
              aria-label="Refresh purchases"
            >
              <RefreshCw className={cn('h-4 w-4', isMounted && loading && 'animate-spin text-brand')} />
            </Button>
            <Link
              href="/purchases/new"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Purchase Entry
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Procurement"
          value={formatCurrency(stats.totalProcurement)}
          sublabel={`${stats.totalBills} bills received`}
          icon={IndianRupee}
          tone="info"
        />
        <StatCard
          label="Paid"
          value={formatCurrency(stats.paidTotal)}
          sublabel={`${stats.paidCount} settled bills`}
          icon={CheckCircle2}
          tone="brand"
        />
        <StatCard
          label="Pending Credit"
          value={formatCurrency(stats.pendingCredit)}
          sublabel={`${stats.creditCount} unpaid bills`}
          icon={Clock}
          tone="warn"
          emphasizeValue
        />
      </div>

      <Card className="mt-4 p-3">
        <DayNavigator
          value={day}
          onChange={setDay}
          summary={isSearching ? 'Search ignores the date — showing every match' : undefined}
          className="mb-3"
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input
              icon={Search}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, supplier, batch, or medicine name…"
              className="w-full"
              aria-label="Search purchases"
            />
            {isSearching ? (
              <p className="mt-1 pl-1 text-[11px] font-semibold text-fg-subtle">
                {searching
                  ? 'Searching medicines on every bill…'
                  : productMatches !== null
                    ? `Includes bills containing a medicine named like “${search.trim()}”.`
                    : 'Matching invoice number and supplier.'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 rounded-md bg-sunken p-1 overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                aria-pressed={statusFilter === tab.id}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-xs font-bold whitespace-nowrap transition-colors',
                  statusFilter === tab.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {!isMounted || loading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : filteredPurchases.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No purchase bills found"
            message={
              search
                ? `Nothing matches “${search}” in this filter.`
                : day !== null
                  ? 'No bills received on this day. Step back a day, or switch to All dates.'
                  : 'Record a supplier bill to build up stock.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>
              ) : day !== null ? (
                <Button variant="outline" onClick={() => setDay(null)}>Show all dates</Button>
              ) : (
                <Link
                  href="/purchases/new"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  New Purchase Entry
                </Link>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Invoice #</TH>
                  <TH>Purchase Date</TH>
                  <TH>Supplier Party</TH>
                  <TH>Payment Status</TH>
                  <TH align="right">Bill Total</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {filteredPurchases.map((p) => (
                  <TR
                    key={p.id}
                    onClick={() => openInspect(p)}
                    className={cn(p.isPaid ? 'stripe-emerald' : 'stripe-amber', 'group cursor-pointer')}
                  >
                    <TD className="font-mono text-xs text-fg-muted">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-fg-subtle transition-colors group-hover:text-brand" aria-hidden />
                        {p.invoiceNumber || p.id.slice(0, 8)}
                      </span>
                    </TD>

                    {/* Time as well as date, matching Sales: the list orders by exact time and
                        with only the day shown a dozen bills from one afternoon looked
                        randomly arranged. */}
                    <TD className="text-fg-muted whitespace-nowrap">
                      {formatDate(p.purchaseDate || p.createdAt)}
                      <span className="mt-0.5 block font-mono text-[10px] text-fg-subtle">
                        {new Date(p.purchaseDate || p.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    </TD>

                    <TD>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Building2 className="h-3.5 w-3.5 text-fg-subtle shrink-0" aria-hidden />
                        {toTitleCase(p.party?.name || 'Supplier Party')}
                      </span>
                    </TD>

                    <TD>
                      <StatusChip tone={p.isPaid ? 'success' : 'warning'} small>
                        {p.isPaid ? 'PAID' : 'CREDIT (UNPAID)'}
                      </StatusChip>
                    </TD>

                    <TD align="right" className="font-mono font-bold">
                      {formatCurrency(p.grandTotal || 0)}
                    </TD>

                    <TD align="right">
                      <span
                        className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => router.push(`/purchases/new?id=${p.id}`)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                          title="Edit purchase bill items"
                          aria-label="Edit purchase items"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openInspect(p)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-info-subtle hover:text-info"
                          title="Inspect bill items"
                          aria-label="Inspect bill"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setSelectedPurchaseForPrint(p)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-info-subtle hover:text-info"
                          title="Print purchase bill"
                          aria-label="Print bill"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {/* Owner-only endpoint; showing it to staff only produced a 403. */}
                        {isOwner ? (
                          <button
                            onClick={(e) => handleDelete(p.id, e)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                            title="Delete purchase bill"
                            aria-label="Delete bill"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* INSPECT PURCHASE DETAILS MODAL */}
      <Modal
        open={!!inspectBill}
        onClose={() => {
          setInspectBill(null);
          if (billIdFromUrl) router.replace('/purchases');
        }}
        title={inspectBill ? `Purchase Invoice #${inspectBill.invoiceNumber || inspectBill.id.slice(0, 8)}` : ''}
        subtitle={
          inspectBill
            ? `Received ${formatDate(inspectBill.purchaseDate || inspectBill.createdAt)} · ${inspectBill.party?.name || 'Supplier'}`
            : undefined
        }
        size="xl"
        footer={
          inspectBill ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    router.push(`/purchases/new?id=${inspectBill.id}`);
                    setInspectBill(null);
                  }}
                >
                  <Edit3 className="h-4 w-4" aria-hidden />
                  Edit Bill
                </Button>
                <Button variant="outline" onClick={() => setSelectedPurchaseForPrint(inspectBill)}>
                  <Printer className="h-4 w-4" aria-hidden />
                  Print Purchase Memo
                </Button>
              </div>
              <Button variant="ghost" onClick={() => setInspectBill(null)}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {inspectBill ? (
          <div className="p-5 space-y-5">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">Supplier Party</dt>
                <dd className="mt-1 text-sm font-bold text-fg truncate">
                  {toTitleCase(inspectBill.party?.name || 'Supplier')}
                </dd>
                {inspectBill.party?.phone ? (
                  <dd className="text-xs font-mono text-fg-subtle mt-0.5">{inspectBill.party.phone}</dd>
                ) : null}
              </div>
              {(
                [
                  ['GSTIN / DL Number', inspectBill.party?.gstNumber || inspectBill.party?.dlNumber || '—', 'font-mono'],
                  ['Payment Status', inspectBill.isPaid ? 'PAID' : 'CREDIT (UNPAID)', ''],
                  ['Taxable Subtotal', formatCurrency(inspectBill.subtotal || 0), 'font-mono'],
                  // Legacy/imported bills carry their discount per LINE, not on the header —
                  // showing only the bill-level figure made every imported bill read as ₹0.
                  [
                    'Item Discount',
                    `-${formatCurrency(
                      (inspectBill.items || []).reduce(
                        (s, i) => s + i.quantity * i.purchaseRate * ((i.discountPercent || 0) / 100),
                        0
                      )
                    )}`,
                    'font-mono text-brand',
                  ],
                  ['Bill Discount', `-${formatCurrency(inspectBill.discount || 0)}`, 'font-mono text-brand'],
                  ['Input GST Tax', formatCurrency(inspectBill.taxTotal || 0), 'font-mono text-accent'],
                  ['Round Off', formatCurrency(inspectBill.roundOffAmount || 0), 'font-mono'],
                  ['Grand Total', formatCurrency(inspectBill.grandTotal || 0), 'font-mono text-brand'],
                ] as const
              ).map(([label, value, valueClass]) => (
                <div key={label} className="rounded-md border border-line bg-raised px-3 py-2.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">{label}</dt>
                  <dd className={cn('mt-1 text-sm font-bold text-fg truncate', valueClass)}>{value}</dd>
                </div>
              ))}
            </dl>

            {inspectBill.notes ? (
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
                  Purchase Entry Notes / Remarks
                </span>
                <span className="mt-1 block text-sm text-fg">{inspectBill.notes}</span>
              </div>
            ) : null}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">
                Received Inventory Items &amp; Batches
              </h4>
              <div className="rounded-md border border-line overflow-hidden">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Medicine Item</TH>
                        <TH>Batch #</TH>
                        <TH>Expiry</TH>
                        <TH align="center">Qty Rec. (Free)</TH>
                        <TH align="right">P. Rate</TH>
                        <TH align="right">MRP</TH>
                        <TH align="right">Total</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {(inspectBill.items || []).map((item, idx) => (
                        <TR key={idx}>
                          <TD className="font-semibold">
                            {toTitleCase(item.product?.name || 'Medicine')}
                          </TD>
                          <TD className="font-mono text-fg-muted">
                            {item.batchNumber || '—'}
                          </TD>
                          <TD className="font-mono text-fg-subtle">
                            {formatDate(item.expiryDate)}
                          </TD>
                          <TD align="center" className="font-mono font-bold text-accent">
                            {item.quantity}
                            {item.freeQuantity ? ` (+${item.freeQuantity} free)` : ''}
                          </TD>
                          <TD align="right" className="font-mono">{formatCurrency(item.purchaseRate || 0)}</TD>
                          <TD align="right" className="font-mono font-bold">{formatCurrency(item.mrp || 0)}</TD>
                          <TD align="right" className="font-mono font-bold text-brand">
                            {formatCurrency(item.totalAmount || item.quantity * item.purchaseRate || 0)}
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>


      {selectedPurchaseForPrint && (
        <PurchasePrintModal purchase={selectedPurchaseForPrint} onClose={() => setSelectedPurchaseForPrint(null)} />
      )}
    </PageMain>
  );
}

export default function PurchasesPage() {
  return (
    <Suspense
      fallback={
        <PageMain>
          <p className="p-8 text-center text-sm text-fg-muted">Loading purchases…</p>
        </PageMain>
      }
    >
      <PurchasesPageContent />
    </Suspense>
  );
}
