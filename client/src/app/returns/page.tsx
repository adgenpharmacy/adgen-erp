'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import {
  RotateCcw,
  Plus,
  RefreshCw,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import { useErpData } from '@/context/ErpDataContext';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import type { ReturnRecord, Product } from '@/types';
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
  TableSkeleton,
  useToast,
} from '@/components/ui';

interface SalesReturnLineDraft {
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  condition: 'RESTOCK' | 'DAMAGED' | string;
  reason: string;
}

interface PurchaseReturnLineDraft {
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  purchaseRate: number;
  reason: string;
}

const EMPTY_SR_ITEM: SalesReturnLineDraft = {
  productId: '', productName: '', batchNumber: '', quantity: 1, unitPrice: 0,
  condition: 'RESTOCK', reason: 'Customer Changed Mind',
};

const EMPTY_PR_ITEM: PurchaseReturnLineDraft = {
  productId: '', productName: '', batchNumber: '', quantity: 1, purchaseRate: 0,
  reason: 'Damaged Packaging',
};

export default function ReturnsPage() {
  const toast = useToast();
  const { refreshData, parties } = useErpData();
  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [salesReturns, setSalesReturns] = useState<ReturnRecord[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showSalesReturnModal, setShowSalesReturnModal] = useState(false);
  const [showPurchaseReturnModal, setShowPurchaseReturnModal] = useState(false);
  const [inspectReturn, setInspectReturn] = useState<(ReturnRecord & { returnType: 'SALES' | 'PURCHASE' }) | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sales Return Form State
  const [srCustomerName, setSrCustomerName] = useState('');
  const [srRefundMethod, setSrRefundMethod] = useState<'CASH' | 'UPI' | 'CREDIT_NOTE'>('CASH');
  const [srNotes, setSrNotes] = useState('');
  const [srItems, setSrItems] = useState<SalesReturnLineDraft[]>([{ ...EMPTY_SR_ITEM }]);

  // Purchase Return Form State
  const [prPartyName, setPrPartyName] = useState('');
  const [prRefundMethod, setPrRefundMethod] = useState<'CASH' | 'UPI' | 'DEBIT_NOTE'>('DEBIT_NOTE');
  const [prNotes, setPrNotes] = useState('');
  const [prItems, setPrItems] = useState<PurchaseReturnLineDraft[]>([{ ...EMPTY_PR_ITEM }]);

  const [productsList, setProductsList] = useState<Product[]>([]);

  const fetchReturnsData = async () => {
    try {
      setLoading(true);
      const [srRes, prRes, prodRes] = await Promise.all([
        api.get('/returns/sales').catch(() => ({ data: [] })),
        api.get('/returns/purchases').catch(() => ({ data: [] })),
        api.get('/products').catch(() => ({ data: [] })),
      ]);
      setSalesReturns(srRes.data || []);
      setPurchaseReturns(prRes.data || []);
      setProductsList(prodRes.data || []);
    } catch (err) {
      console.error('Error loading returns data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnsData();
  }, []);

  const handleCreateSalesReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = srItems.filter(i => i.productName && i.quantity > 0);
    const itemsToSubmit = [];
    for (const item of validItems) {
      let matchedId = item.productId;
      if (!matchedId && item.productName) {
        const found = productsList.find(p => p.name.toLowerCase().trim() === item.productName.toLowerCase().trim());
        if (found) matchedId = found.id;
      }
      if (!matchedId) {
        toast.error('Medicine not in catalogue', `"${item.productName}" could not be matched. Pick one from the suggestions.`);
        return;
      }
      itemsToSubmit.push({
        productId: matchedId,
        batchNumber: item.batchNumber || 'DEFAULT',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        condition: item.condition,
        reason: item.reason,
      });
    }

    try {
      setSubmitting(true);
      await api.post('/returns/sales', {
        refundMethod: srRefundMethod,
        notes: `${srCustomerName ? 'Customer: ' + srCustomerName + ' • ' : ''}${srNotes}`,
        items: itemsToSubmit,
      });

      invalidateCatalogCache();
      void refreshData();
      toast.success('Credit note created', 'Inventory has been updated.');
      setShowSalesReturnModal(false);
      setSrItems([{ ...EMPTY_SR_ITEM }]);
      setSrCustomerName('');
      setSrNotes('');
      fetchReturnsData();
    } catch (err) {
      toast.error('Failed to create sales return', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = prItems.filter(i => i.productName && i.quantity > 0);
    const itemsToSubmit = [];
    for (const item of validItems) {
      let matchedId = item.productId;
      if (!matchedId && item.productName) {
        const found = productsList.find(p => p.name.toLowerCase().trim() === item.productName.toLowerCase().trim());
        if (found) matchedId = found.id;
      }
      if (!matchedId) {
        toast.error('Medicine not in catalogue', `"${item.productName}" could not be matched. Pick one from the suggestions.`);
        return;
      }
      itemsToSubmit.push({
        productId: matchedId,
        batchNumber: item.batchNumber || 'DEFAULT',
        quantity: item.quantity,
        purchaseRate: item.purchaseRate,
        reason: item.reason,
      });
    }

    try {
      setSubmitting(true);
      await api.post('/returns/purchases', {
        refundMethod: prRefundMethod,
        notes: `${prPartyName ? 'Supplier: ' + prPartyName + ' • ' : ''}${prNotes}`,
        items: itemsToSubmit,
      });

      invalidateCatalogCache();
      void refreshData();
      toast.success('Debit note created', 'Stock has been deducted.');
      setShowPurchaseReturnModal(false);
      setPrItems([{ ...EMPTY_PR_ITEM }]);
      setPrPartyName('');
      setPrNotes('');
      fetchReturnsData();
    } catch (err) {
      toast.error('Failed to create purchase return', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const rows = activeTab === 'SALES' ? salesReturns : purchaseReturns;
  const isSales = activeTab === 'SALES';

  /** Shared datalist so both return forms get catalogue autocomplete. */
  const productOptions = (
    <datalist id="returns-product-list">
      {productsList.slice(0, 500).map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );

  return (
    <PageMain>
      {productOptions}

      <PageHeader
        title="Sales & Purchase Returns"
        subtitle="Issue credit notes (customer returns) and debit notes (supplier returns) with automated stock adjustments"
        action={
          <>
            <Button
              variant="outline"
              iconOnly
              onClick={() => fetchReturnsData()}
              title="Refresh returns"
              aria-label="Refresh returns"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin text-brand')} />
            </Button>
            <Button
              onClick={() => (isSales ? setShowSalesReturnModal(true) : setShowPurchaseReturnModal(true))}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {isSales ? 'Sales Return' : 'Purchase Return'}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-1 rounded-md bg-sunken p-1 w-fit">
          {(
            [
              ['SALES', 'Sales Returns (Credit Notes)', RotateCcw],
              ['PURCHASE', 'Purchase Returns (Debit Notes)', ArrowLeftRight],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold whitespace-nowrap transition-colors',
                activeTab === id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={isSales ? RotateCcw : ArrowLeftRight}
            title={isSales ? 'No credit notes yet' : 'No debit notes yet'}
            message={
              isSales
                ? 'Customer returns you accept will appear here, with stock restocked or written off.'
                : 'Supplier returns you raise will appear here, with stock deducted automatically.'
            }
            action={
              <Button onClick={() => (isSales ? setShowSalesReturnModal(true) : setShowPurchaseReturnModal(true))}>
                <Plus className="h-4 w-4" aria-hidden />
                {isSales ? 'Sales Return' : 'Purchase Return'}
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>{isSales ? 'Credit Note #' : 'Debit Note #'}</TH>
                  <TH>Date</TH>
                  <TH>Refund Mode</TH>
                  <TH>Items Returned</TH>
                  <TH align="right">Return Total</TH>
                  <TH align="center">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR
                    key={r.id}
                    onClick={() => setInspectReturn({ ...r, returnType: activeTab })}
                    className="cursor-pointer"
                  >
                    <TD className="font-mono font-bold text-brand">{r.returnNumber}</TD>
                    <TD className="text-fg-muted whitespace-nowrap">{formatDate(r.createdAt)}</TD>
                    <TD>
                      <StatusChip tone={isSales ? 'success' : 'accent'} small>
                        {r.refundMethod || (isSales ? 'CASH' : 'DEBIT_NOTE')}
                      </StatusChip>
                    </TD>
                    <TD className="text-fg-muted">
                      {(r.items || []).length} medicine {(r.items || []).length === 1 ? 'item' : 'items'}
                    </TD>
                    <TD align="right" className="font-mono font-bold">
                      {formatCurrency(r.totalReturnAmount || 0)}
                    </TD>
                    <TD align="center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectReturn({ ...r, returnType: activeTab });
                        }}
                      >
                        Inspect
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* CREATE SALES RETURN MODAL */}
      <Modal
        open={showSalesReturnModal}
        onClose={() => setShowSalesReturnModal(false)}
        title="Create Customer Sales Return (Credit Note)"
        subtitle="Restocked items go back into inventory; damaged items are written off"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowSalesReturnModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="sales-return-form" loading={submitting}>
              Issue Credit Note
            </Button>
          </div>
        }
      >
        <form id="sales-return-form" onSubmit={handleCreateSalesReturn} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer Name" hint="Optional">
              <Input
                type="text"
                value={srCustomerName}
                onChange={(e) => setSrCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
              />
            </Field>
            <Field label="Refund Method">
              <Select value={srRefundMethod} onChange={(e) => setSrRefundMethod(e.target.value as typeof srRefundMethod)}>
                <option value="CASH">Refund cash to customer</option>
                <option value="UPI">Refund via UPI transfer</option>
                <option value="CREDIT_NOTE">Store credit note balance</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-muted">Returned Medicine Items</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSrItems([...srItems, { ...EMPTY_SR_ITEM }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Item
              </Button>
            </div>

            {srItems.map((item, idx) => (
              <div key={idx} className="rounded-md border border-line bg-raised p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
                    Item {idx + 1}
                  </span>
                  {srItems.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setSrItems(srItems.filter((_, i) => i !== idx))}
                      aria-label={`Remove item ${idx + 1}`}
                      className="p-1 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Medicine Name">
                    <Input
                      type="text"
                      list="returns-product-list"
                      value={item.productName}
                      onChange={(e) => {
                        const copy = [...srItems];
                        copy[idx].productName = e.target.value;
                        const matched = productsList.find(p => p.name.toLowerCase() === e.target.value.toLowerCase());
                        if (matched) {
                          copy[idx].productId = matched.id;
                          copy[idx].unitPrice = matched.mrp || 0;
                        }
                        setSrItems(copy);
                      }}
                      placeholder="e.g. Paracetamol 500"
                    />
                  </Field>
                  <Field label="Batch Number">
                    <Input
                      type="text"
                      value={item.batchNumber}
                      onChange={(e) => {
                        const copy = [...srItems];
                        copy[idx].batchNumber = e.target.value;
                        setSrItems(copy);
                      }}
                      placeholder="e.g. BATCH-123"
                      className="font-mono"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Return Qty">
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const copy = [...srItems];
                        copy[idx].quantity = parseFloat(e.target.value) || 1;
                        setSrItems(copy);
                      }}
                      className="font-mono font-semibold"
                    />
                  </Field>
                  <Field label="Unit Price (₹)">
                    <Input
                      type="number"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const copy = [...srItems];
                        copy[idx].unitPrice = parseFloat(e.target.value) || 0;
                        setSrItems(copy);
                      }}
                      className="font-mono font-semibold"
                    />
                  </Field>
                  <Field label="Stock Action">
                    <Select
                      value={item.condition}
                      onChange={(e) => {
                        const copy = [...srItems];
                        copy[idx].condition = e.target.value;
                        setSrItems(copy);
                      }}
                    >
                      <option value="RESTOCK">Restock into inventory</option>
                      <option value="DAMAGED">Discard as damaged</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Reason">
                  <Select
                    value={item.reason}
                    onChange={(e) => {
                      const copy = [...srItems];
                      copy[idx].reason = e.target.value;
                      setSrItems(copy);
                    }}
                  >
                    <option value="Customer Changed Mind">Customer changed mind</option>
                    <option value="Wrong Medicine Dispensed">Wrong medicine dispensed</option>
                    <option value="Damaged Packaging">Damaged packaging</option>
                    <option value="Near Expiry">Near expiry</option>
                    <option value="Adverse Reaction">Adverse reaction</option>
                  </Select>
                </Field>
              </div>
            ))}
          </div>

          <Field label="Notes / Remarks">
            <Input
              type="text"
              value={srNotes}
              onChange={(e) => setSrNotes(e.target.value)}
              placeholder="Optional remarks for this credit note"
            />
          </Field>
        </form>
      </Modal>

      {/* CREATE PURCHASE RETURN MODAL */}
      <Modal
        open={showPurchaseReturnModal}
        onClose={() => setShowPurchaseReturnModal(false)}
        title="Create Supplier Purchase Return (Debit Note)"
        subtitle="Returned quantities are deducted from inventory stock"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowPurchaseReturnModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="purchase-return-form" loading={submitting}>
              Issue Debit Note
            </Button>
          </div>
        }
      >
        <form id="purchase-return-form" onSubmit={handleCreatePurchaseReturn} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Suppliers are suggested from the directory. The field was free text with no
                list at all, so the name had to be typed from memory and any typo produced a
                debit note that could not be matched to the supplier's ledger. */}
            <Field label="Supplier Party Name">
              <Input
                type="text"
                list="purchase-return-parties"
                value={prPartyName}
                onChange={(e) => setPrPartyName(e.target.value)}
                placeholder="Start typing a supplier name"
              />
              <datalist id="purchase-return-parties">
                {parties.map((party) => (
                  <option key={party.id} value={party.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Refund Method">
              <Select value={prRefundMethod} onChange={(e) => setPrRefundMethod(e.target.value as typeof prRefundMethod)}>
                <option value="DEBIT_NOTE">Supplier debit note (adjust payables)</option>
                <option value="CASH">Cash refund from supplier</option>
                <option value="UPI">Bank refund</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-muted">Returned Medicine Items</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPrItems([...prItems, { ...EMPTY_PR_ITEM }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Item
              </Button>
            </div>

            {prItems.map((item, idx) => (
              <div key={idx} className="rounded-md border border-line bg-raised p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
                    Item {idx + 1}
                  </span>
                  {prItems.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPrItems(prItems.filter((_, i) => i !== idx))}
                      aria-label={`Remove item ${idx + 1}`}
                      className="p-1 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Medicine Name">
                    <Input
                      type="text"
                      list="returns-product-list"
                      value={item.productName}
                      onChange={(e) => {
                        const copy = [...prItems];
                        copy[idx].productName = e.target.value;
                        const matched = productsList.find(p => p.name.toLowerCase() === e.target.value.toLowerCase());
                        if (matched) {
                          copy[idx].productId = matched.id;
                          copy[idx].purchaseRate = matched.purchaseRate || 0;
                        }
                        setPrItems(copy);
                      }}
                      placeholder="e.g. Augmentin 625"
                    />
                  </Field>
                  <Field label="Batch Number">
                    <Input
                      type="text"
                      value={item.batchNumber}
                      onChange={(e) => {
                        const copy = [...prItems];
                        copy[idx].batchNumber = e.target.value;
                        setPrItems(copy);
                      }}
                      placeholder="e.g. BATCH-456"
                      className="font-mono"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Return Qty" hint="Deducted from stock">
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const copy = [...prItems];
                        copy[idx].quantity = parseFloat(e.target.value) || 1;
                        setPrItems(copy);
                      }}
                      className="font-mono font-semibold"
                    />
                  </Field>
                  <Field label="Purchase Rate (₹)">
                    <Input
                      type="number"
                      step="any"
                      value={item.purchaseRate}
                      onChange={(e) => {
                        const copy = [...prItems];
                        copy[idx].purchaseRate = parseFloat(e.target.value) || 0;
                        setPrItems(copy);
                      }}
                      className="font-mono font-semibold"
                    />
                  </Field>
                  <Field label="Reason">
                    <Select
                      value={item.reason}
                      onChange={(e) => {
                        const copy = [...prItems];
                        copy[idx].reason = e.target.value;
                        setPrItems(copy);
                      }}
                    >
                      <option value="Damaged Packaging">Damaged packaging</option>
                      <option value="Expired Stock">Expired stock</option>
                      <option value="Wrong Item Supplied">Wrong item supplied</option>
                      <option value="Excess Supply">Excess supply</option>
                      <option value="Quality Issue">Quality issue</option>
                    </Select>
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <Field label="Notes / Remarks">
            <Input
              type="text"
              value={prNotes}
              onChange={(e) => setPrNotes(e.target.value)}
              placeholder="Optional remarks for this debit note"
            />
          </Field>
        </form>
      </Modal>

      {/* INSPECT RETURN DETAILS MODAL */}
      <Modal
        open={!!inspectReturn}
        onClose={() => setInspectReturn(null)}
        title={
          inspectReturn
            ? `${inspectReturn.returnType === 'SALES' ? 'Sales Credit Note' : 'Purchase Debit Note'} #${inspectReturn.returnNumber}`
            : ''
        }
        subtitle={inspectReturn ? `Issued ${formatDate(inspectReturn.createdAt)}` : undefined}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setInspectReturn(null)}>
              Close
            </Button>
          </div>
        }
      >
        {inspectReturn ? (
          <div className="p-5 space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  ['Date Issued', formatDate(inspectReturn.createdAt), 'font-mono'],
                  ['Refund Method', inspectReturn.refundMethod || 'STANDARD', ''],
                  ['Total Amount', formatCurrency(inspectReturn.totalReturnAmount || 0), 'font-mono text-brand'],
                ] as const
              ).map(([label, value, valueClass]) => (
                <div key={label} className="rounded-md border border-line bg-raised px-3 py-2.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-fg-subtle">{label}</dt>
                  <dd className={cn('mt-1 text-sm font-bold text-fg truncate', valueClass)}>{value}</dd>
                </div>
              ))}
            </dl>

            {inspectReturn.notes ? (
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
                  Notes / Remarks
                </span>
                <span className="mt-1 block text-sm text-fg">{inspectReturn.notes}</span>
              </div>
            ) : null}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">
                Itemized Returned Items
              </h4>
              <div className="rounded-md border border-line overflow-hidden">
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Medicine</TH>
                        <TH>Batch</TH>
                        <TH align="center">Qty</TH>
                        <TH align="right">Rate</TH>
                        <TH align="right">Subtotal</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {(inspectReturn.items || []).map((item, idx) => (
                        <TR key={idx}>
                          <TD className="font-semibold">
                            {item.product?.name || item.productName || 'Medicine'}
                          </TD>
                          <TD className="font-mono text-fg-muted">{item.batchNumber || '—'}</TD>
                          <TD align="center" className="font-mono font-bold">{item.quantity}</TD>
                          <TD align="right" className="font-mono">
                            {formatCurrency(item.unitPrice || item.purchaseRate || 0)}
                          </TD>
                          <TD align="right" className="font-mono font-bold">
                            {formatCurrency((item.quantity || 1) * (item.unitPrice || item.purchaseRate || 0))}
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
    </PageMain>
  );
}
