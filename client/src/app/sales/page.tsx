'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import InvoicePrintModal from '@/components/invoice/InvoicePrintModal';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import {
  Search,
  Plus,
  Printer,
  Trash2,
  Receipt,
  Eye,
  FileText,
  RefreshCw,
  Edit3,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageMain from '@/components/layout/PageMain';
import DayNavigator, { isOnDay, todayKey } from '@/components/common/DayNavigator';
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
import type { Sale } from '@/types';
import { getApiErrorMessage } from '@/types';
import { IndianRupee, Banknote, Smartphone, Clock } from 'lucide-react';

const METHOD_TABS = [
  { id: 'ALL', label: 'All Invoices' },
  { id: 'CASH', label: 'Cash' },
  { id: 'UPI', label: 'UPI' },
  { id: 'SPLIT', label: 'Split' },
  { id: 'CREDIT', label: 'Credit (Unpaid)' },
];

export default function SalesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const { sales: cachedSales, loading, refreshData } = useErpData();
  const [sales, setSales] = useState<Sale[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [inspectBill, setInspectBill] = useState<Sale | null>(null);
  // The counter opens this screen to see the day it is working on, not the whole history.
  const [day, setDay] = useState<string | null>(() => todayKey());
  /**
   * Bills whose *line items* match the search term.
   *
   * The cached list carries no lines, so "which bills had Dolo on them" cannot be answered in
   * the browser. The term is sent to the server, which matches medicine names as well, and the
   * result replaces the local matches once it lands.
   */
  const [productMatches, setProductMatches] = useState<Sale[] | null>(null);
  const [searching, setSearching] = useState(false);

  /**
   * The list is fetched without its lines, so the detail view loads them on demand. Shows the
   * summary row immediately, then fills in the items when they arrive.
   */
  const openInspect = async (sale: Sale) => {
    setInspectBill(sale);
    try {
      const res = await api.get(`/sales/${sale.id}`);
      setInspectBill((current) => (current && current.id === sale.id ? res.data : current));
    } catch {
      /* keep the summary view; the header figures are already correct */
    }
  };
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Sale | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setSales(cachedSales);
  }, [cachedSales]);

  // Debounced so typing a medicine name is one request, not one per keystroke.
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
        .get<Sale[]>(`/sales?summary=1&q=${encodeURIComponent(term)}`)
        .then((res) => {
          if (!cancelled) setProductMatches(res.data || []);
        })
        .catch(() => {
          // Leave the local matches on screen rather than emptying the list on a failed search.
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

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this sales bill?',
      message:
        'The invoice will be removed and the stock it sold is returned to inventory ' +
        '(minus anything already put back by a sales return). This cannot be undone.',
      confirmLabel: 'Delete bill',
    });
    if (!ok) return;
    try {
      await api.delete(`/sales/${id}`);
      toast.success('Sales bill deleted');
      await refreshData();
    } catch (err) {
      toast.error('Failed to delete sale', getApiErrorMessage(err));
    }
  };

  const isSearching = search.trim().length > 0;

  /*
   * A search looks across every date — asking "when did we sell this" and being shown only
   * today's bills is worse than useless. The day filter applies to browsing, not to searching.
   */
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = isSearching ? (productMatches ?? sales) : sales;

    return source
      .filter((s) => {
        // Server-matched rows already satisfy the term (including by medicine name).
        const matchesSearch =
          !isSearching ||
          productMatches !== null ||
          (s.invoiceNumber || '').toLowerCase().includes(q) ||
          (s.customerName || s.customer?.name || '').toLowerCase().includes(q) ||
          (s.customerPhone || s.customer?.phone || '').includes(q);

        const matchesDay = isSearching || day === null || isOnDay(s.createdAt, day);

        const m = (s.paymentMethod || 'CASH').toUpperCase();
        const matchesMethod = methodFilter === 'ALL' || m === methodFilter;

        return matchesSearch && matchesDay && matchesMethod;
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [sales, search, methodFilter, day, isSearching, productMatches]);

  /*
   * The figures describe what is on screen. Totalling every bill ever while the table showed a
   * single day meant the cards and the rows below them never agreed.
   */
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let cashTotal = 0;
    let upiTotal = 0;
    let creditTotal = 0;

    filteredSales.forEach((s) => {
      const total = s.grandTotal || 0;
      totalRevenue += total;
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      if (m === 'CASH') cashTotal += total;
      else if (m === 'UPI') upiTotal += total;
      else if (m === 'CREDIT') creditTotal += total;
      else if (m === 'SPLIT') {
        cashTotal += (s.cashAmount || 0);
        upiTotal += (s.upiAmount || 0);
        creditTotal += (s.creditAmount || 0);
      }
    });

    return {
      totalInvoices: filteredSales.length,
      totalRevenue,
      cashTotal,
      upiTotal,
      creditTotal,
    };
  }, [filteredSales]);

  const getPaymentTone = (method?: string): { label: string; tone: 'success' | 'accent' | 'warning' | 'info' } => {
    const m = (method || 'CASH').toUpperCase();
    if (m === 'UPI') return { label: 'UPI', tone: 'accent' };
    if (m === 'CREDIT') return { label: 'CREDIT', tone: 'warning' };
    if (m === 'CARD') return { label: 'CARD', tone: 'info' };
    if (m === 'SPLIT') return { label: 'SPLIT', tone: 'accent' };
    return { label: 'CASH', tone: 'success' };
  };

  return (
    <PageMain>
      <PageHeader
        title="Sales Invoices"
        subtitle={
          isSearching
            ? `${stats.totalInvoices.toLocaleString('en-IN')} bills match “${search.trim()}” · all dates`
            : `${stats.totalInvoices.toLocaleString('en-IN')} bills · ${day === null ? 'all dates' : 'selected day'}`
        }
        action={
          <>
            <Button
              variant="outline"
              iconOnly
              onClick={() => refreshData()}
              title="Refresh sales"
              aria-label="Refresh sales"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin text-brand')} />
            </Button>
            <Link
              href="/billing"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Sale
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross Sales" value={formatCurrency(stats.totalRevenue)} sublabel={`${stats.totalInvoices} invoices`} icon={IndianRupee} tone="brand" />
        <StatCard label="Cash" value={formatCurrency(stats.cashTotal)} sublabel="Collected in cash" icon={Banknote} tone="teal" />
        <StatCard label="UPI" value={formatCurrency(stats.upiTotal)} sublabel="Digital payments" icon={Smartphone} tone="accent" />
        <StatCard label="Credit Unpaid" value={formatCurrency(stats.creditTotal)} sublabel="Outstanding from customers" icon={Clock} tone="warn" emphasizeValue />
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
              placeholder="Search invoice #, customer, phone, or medicine name…"
              className="w-full"
              aria-label="Search sales"
            />
            {isSearching ? (
              <p className="mt-1 pl-1 text-[11px] font-semibold text-fg-subtle">
                {searching
                  ? 'Searching medicines on every bill…'
                  : productMatches !== null
                    ? `Includes bills containing a medicine named like “${search.trim()}”.`
                    : 'Matching invoice number, customer and phone.'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 rounded-md bg-sunken p-1 overflow-x-auto">
            {METHOD_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMethodFilter(tab.id)}
                aria-pressed={methodFilter === tab.id}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-xs font-bold whitespace-nowrap transition-colors',
                  methodFilter === tab.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
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
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales bills found"
            message={
              search
                ? `Nothing matches “${search}” in this filter.`
                : day !== null
                  ? 'No bills on this day. Step back a day, or switch to All dates.'
                  : 'Raise a bill at the counter to see it here.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>
              ) : day !== null ? (
                <Button variant="outline" onClick={() => setDay(null)}>Show all dates</Button>
              ) : (
                <Link
                  href="/billing"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  New Sale
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
                  <TH>Sale Date</TH>
                  <TH>Customer Name</TH>
                  <TH>Payment</TH>
                  <TH align="right">Grand Total</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {filteredSales.map((s) => {
                  const badge = getPaymentTone(s.paymentMethod);
                  const isCredit = (s.paymentMethod || '').toUpperCase() === 'CREDIT';
                  const stripeClass = isCredit ? 'stripe-yellow' : 'stripe-emerald';

                  return (
                    <TR
                      key={s.id}
                      onClick={() => openInspect(s)}
                      className={cn(stripeClass, 'group cursor-pointer')}
                    >
                      <TD className="font-mono text-xs text-fg-muted">
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-fg-subtle transition-colors group-hover:text-brand" aria-hidden />
                          {/* The stored number already carries its series prefix; prepending one rendered
                              "INV-INV-000049" in the list. */}
                          {s.invoiceNumber || s.id.slice(0, 8)}
                        </span>
                      </TD>

                      {/* Time as well as date: the list is ordered by exact sale time, and with
                          only the day shown a dozen bills from one afternoon looked randomly
                          arranged. */}
                      <TD className="text-fg-muted whitespace-nowrap">
                        {formatDate(s.createdAt)}
                        <span className="mt-0.5 block font-mono text-[10px] text-fg-subtle">
                          {new Date(s.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </TD>

                      <TD>
                        <span className="block font-semibold">
                          {toTitleCase(s.customerName || s.customer?.name || 'Walk-in Customer')}
                        </span>
                        {(s.customerPhone || s.customer?.phone) ? (
                          <span className="block text-xs font-mono text-fg-subtle">
                            {s.customerPhone || s.customer?.phone}
                          </span>
                        ) : null}
                      </TD>

                      <TD>
                        <StatusChip tone={badge.tone} small>{badge.label}</StatusChip>
                      </TD>

                      <TD align="right" className="font-mono font-bold text-brand-hover">
                        {formatCurrency(s.grandTotal || 0)}
                      </TD>

                      <TD align="right">
                        <span
                          className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => router.push(`/billing?id=${s.id}`)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                            title="Edit sales bill (POS view)"
                            aria-label="Edit sales bill"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openInspect(s)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                            title="Inspect full details"
                            aria-label="Inspect details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setSelectedInvoiceForPrint(s)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                            title="Print sales memo"
                            aria-label="Print memo"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(s.id, e)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                            title="Delete sales bill"
                            aria-label="Delete bill"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* INSPECT SALES DETAILS MODAL */}
      <Modal
        open={!!inspectBill}
        onClose={() => setInspectBill(null)}
        title={inspectBill ? `Sales Invoice #${inspectBill.invoiceNumber || inspectBill.id.slice(0, 8)}` : ''}
        subtitle={
          inspectBill
            ? `Issued ${formatDate(inspectBill.createdAt)} · ${inspectBill.paymentMethod}`
            : undefined
        }
        size="xl"
        footer={
          inspectBill ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    router.push(`/billing?id=${inspectBill.id}`);
                    setInspectBill(null);
                  }}
                >
                  <Edit3 className="h-4 w-4" aria-hidden />
                  Edit Bill
                </Button>
                <Button variant="outline" onClick={() => setSelectedInvoiceForPrint(inspectBill)}>
                  <Printer className="h-4 w-4" aria-hidden />
                  Print Tax Memo
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
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ['Customer', toTitleCase(inspectBill.customerName || inspectBill.customer?.name || 'Walk-in Customer'), ''],
                  ['Phone', inspectBill.customerPhone || inspectBill.customer?.phone || '—', 'font-mono'],
                  ['Doctor', inspectBill.doctorName ? `Dr. ${inspectBill.doctorName}` : '—', ''],
                  ['Payment Mode', inspectBill.paymentMethod, ''],
                  ['Subtotal (excl. tax)', formatCurrency(inspectBill.subtotal || 0), 'font-mono'],
                  ['GST Collected', formatCurrency(inspectBill.taxTotal || 0), 'font-mono text-accent'],
                  ['Discount', `-${formatCurrency(inspectBill.discount || 0)}`, 'font-mono text-danger'],
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
                  Billing Notes / Remarks
                </span>
                <span className="mt-1 block text-sm text-fg">{inspectBill.notes}</span>
              </div>
            ) : null}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">
                Itemized Medicines Sold
              </h4>
              <div className="rounded-md border border-line overflow-hidden">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Medicine Name</TH>
                        <TH>Batch</TH>
                        <TH>Expiry</TH>
                        <TH align="center">Qty Sold</TH>
                        <TH align="right">Unit MRP</TH>
                        <TH align="right">Line Total</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {/* Lines arrive on a second request. Without this the dialog opened with an
                          empty table under a real grand total, then rows appeared a moment later —
                          which reads as a bill with nothing on it. Say it is loading instead. */}
                      {!inspectBill.items ? (
                        <TR>
                          <TD className="py-6 text-center text-fg-muted" colSpan={6}>
                            Loading medicines…
                          </TD>
                        </TR>
                      ) : inspectBill.items.length === 0 ? (
                        <TR>
                          <TD className="py-6 text-center text-fg-muted" colSpan={6}>
                            This bill has no line items.
                          </TD>
                        </TR>
                      ) : null}
                      {(inspectBill.items || []).map((item, idx) => (
                        <TR key={idx}>
                          <TD className="font-semibold">
                            {toTitleCase(item.product?.name || 'Medicine')}
                          </TD>
                          <TD className="font-mono text-fg-muted">
                            {item.batch?.batchNumber || '—'}
                          </TD>
                          <TD className="font-mono text-fg-subtle">
                            {item.batch?.expiryDate ? formatDate(item.batch.expiryDate) : '—'}
                          </TD>
                          <TD align="center" className="font-mono font-bold">
                            {item.quantity} Units
                          </TD>
                          <TD align="right" className="font-mono">
                            {formatCurrency(item.unitPrice || 0)}
                          </TD>
                          <TD align="right" className="font-mono font-bold">
                            {formatCurrency((item.quantity || 1) * (item.unitPrice || 0))}
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


      {selectedInvoiceForPrint && (
        <InvoicePrintModal invoice={selectedInvoiceForPrint} onClose={() => setSelectedInvoiceForPrint(null)} />
      )}
    </PageMain>
  );
}
