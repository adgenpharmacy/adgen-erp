'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { Search, Plus, BookOpen } from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import type { LedgerEntry, Customer, Party } from '@/types';
import { getApiErrorMessage } from '@/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Modal,
  PageHeader,
  StatusChip,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  useToast,
} from '@/components/ui';

export default function LedgerPage() {
  const toast = useToast();
  const { ledgers: cachedLedgers, customers: cachedCustomers, parties: cachedParties, refreshData } = useErpData();
  const [ledgers, setLedgers] = useState<LedgerEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  /** Which book is on screen: what patients owe the shop, or what the shop owes distributors. */
  const [book, setBook] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'CUSTOMER' | 'PARTY'>('CUSTOMER');
  const [entityId, setEntityId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (cachedLedgers?.length > 0) setLedgers(cachedLedgers);
    if (cachedCustomers?.length > 0) setCustomers(cachedCustomers);
    if (cachedParties?.length > 0) setParties(cachedParties);
  }, [cachedLedgers, cachedCustomers, cachedParties]);

  const fetchLedgers = async () => {
    try {
      const res = await api.get('/ledger');
      setLedgers(res.data);
      refreshData();
    }
    catch (e) { console.error('Failed to fetch ledgers:', e); }
  };

  useEffect(() => {
    fetchLedgers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSettlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId || amount <= 0) return;
    try {
      await api.post('/ledger/payment', {
        type: paymentType,
        customerId: paymentType === 'CUSTOMER' ? entityId : undefined,
        partyId: paymentType === 'PARTY' ? entityId : undefined,
        amount, notes,
      });
      setShowPaymentModal(false); setEntityId(''); setAmount(0); setNotes('');
      toast.success('Payment recorded');
      fetchLedgers();
    } catch (e) { toast.error('Failed to record payment', getApiErrorMessage(e)); }
  };

  /*
   * Money owed TO the shop and money owed BY the shop were listed together, so the one figure a
   * pharmacy actually wants — what each side comes to — could not be read off the screen. They
   * are the same table but two different books, split by which party the entry belongs to.
   */
  const matchesSearch = (l: LedgerEntry) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (l.customer?.name || '').toLowerCase().includes(q) ||
      (l.party?.name || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q)
    );
  };

  const isSupplierSide = (l: LedgerEntry) => l.partyType === 'SUPPLIER' || Boolean(l.partyId) || Boolean(l.purchaseBillId);

  const salesLedger = ledgers.filter((l) => !isSupplierSide(l) && matchesSearch(l));
  const purchaseLedger = ledgers.filter((l) => isSupplierSide(l) && matchesSearch(l));
  const filtered = book === 'SALES' ? salesLedger : purchaseLedger;

  const outstandingOf = (rows: LedgerEntry[]) =>
    rows.reduce((sum, l) => sum + (l.isSettled ? 0 : l.outstandingAmount ?? l.amount ?? 0), 0);

  const receivable = outstandingOf(salesLedger);
  const payable = outstandingOf(purchaseLedger);

  const handleInlineSettle = async (item: LedgerEntry) => {
    try {
      await api.post('/ledger/settle', {
        ledgerId: item.id.startsWith('synth-') ? undefined : item.id,
        salesBillId: item.salesBillId, purchaseBillId: item.purchaseBillId,
        // Settle what is still outstanding, not the amount originally owed.
        amountPaid: item.outstandingAmount ?? item.amount,
      });
      toast.success('Bill settled');
      fetchLedgers();
    } catch { toast.error('Failed to settle bill'); }
  };

  return (
    <PageMain>
      <PageHeader
        title="Ledger"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} in this book`}
        action={
          <Button onClick={() => setShowPaymentModal(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Record Payment
          </Button>
        }
      >
        <Input
          icon={Search}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, supplier, or notes…"
          className="max-w-md"
          aria-label="Search ledger"
        />
      </PageHeader>

      {/* The two balances side by side: what is coming in, and what has to go out. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {([
          ['SALES', 'Receivable — patients owe you', receivable, salesLedger.length, 'text-brand'],
          ['PURCHASE', 'Payable — you owe distributors', payable, purchaseLedger.length, 'text-warn'],
        ] as const).map(([id, label, value, count, tone]) => (
          <button
            key={id}
            onClick={() => setBook(id)}
            aria-pressed={book === id}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors',
              book === id ? 'border-brand bg-brand-subtle/40 shadow-card' : 'border-line bg-surface hover:border-line-strong'
            )}
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">{label}</span>
            <span className={cn('mt-1 block font-mono text-xl font-black', tone)}>{formatCurrency(value)}</span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {count} {count === 1 ? 'entry' : 'entries'}
            </span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={search ? 'No matching entries' : 'No ledger entries'}
            message={
              search
                ? 'Try a different customer, supplier, or note.'
                : 'Credit sales and unpaid purchase bills post here automatically. You can also record a payment manually.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={() => setShowPaymentModal(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Record Payment
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Account</TH>
                  <TH className="hidden sm:table-cell">Type</TH>
                  <TH className="hidden md:table-cell">Description</TH>
                  <TH align="right">Amount</TH>
                  <TH align="center">Status</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((l) => {
                  const type = l.transactionType;
                  return (
                    <TR key={l.id}>
                      <TD className="text-fg-muted whitespace-nowrap">{formatDate(l.createdAt)}</TD>
                      <TD className="font-semibold">
                        {l.customer?.name || l.party?.name || 'General'}
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <StatusChip tone={type === 'CREDIT' ? 'error' : 'success'} small>
                          {type}
                        </StatusChip>
                      </TD>
                      <TD className="hidden md:table-cell text-fg-subtle max-w-75 truncate">{l.description}</TD>
                      {/* `amount` is what was originally owed; the API recomputes `outstandingAmount`
                          against the linked bill's payments, so that is the live figure to show. */}
                      <TD align="right" className="font-mono font-bold">
                        {formatCurrency(l.outstandingAmount ?? l.amount ?? 0)}
                      </TD>
                      <TD align="center">
                        {l.isSettled ? (
                          <StatusChip tone="neutral" small>Settled</StatusChip>
                        ) : (
                          <Button size="sm" onClick={() => handleInlineSettle(l)}>
                            Settle
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record Payment"
        subtitle="Settle an outstanding customer or supplier balance"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form">
              Record
            </Button>
          </div>
        }
      >
        <form id="payment-form" onSubmit={handleSettlePayment} className="p-5 space-y-4">
          <Field label="Account Type">
            <div className="grid grid-cols-2 gap-2">
              {(['CUSTOMER', 'PARTY'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setPaymentType(t); setEntityId(''); }}
                  className={cn(
                    'h-10 rounded-md text-sm font-semibold transition-colors',
                    paymentType === t
                      ? 'bg-brand text-brand-fg'
                      : 'bg-sunken text-fg-muted hover:bg-hover'
                  )}
                >
                  {t === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Select ${paymentType === 'CUSTOMER' ? 'Customer' : 'Supplier'}`} required>
            <Select required value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">Choose…</option>
              {paymentType === 'CUSTOMER'
                ? customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.creditBalance || 0)})</option>)
                : parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.outstandingBalance || 0)})</option>)
              }
            </Select>
          </Field>

          <Field label="Amount (₹)" required>
            <Input
              type="number"
              required
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="font-mono"
            />
          </Field>

          <Field label="Notes">
            <Input
              type="text"
              placeholder="e.g. UPI Ref #9082"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </PageMain>
  );
}
