'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { api } from '@/lib/api-client';
import { getCachedProducts, invalidateCatalogCache } from '@/lib/catalog-cache';
import {
  Building2,
  Receipt,
  Calendar,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  X,
  Search,
  Pill,
  AlertTriangle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageMain from '@/components/layout/PageMain';
import { useErpData } from '@/context/ErpDataContext';
import { Button, Card, CardHeader, CardBody, Field, Input, Select, Modal, useToast } from '@/components/ui';
import { formatCurrency, cn, normalizeExpiryInput, toExpiryMMYY, isCompleteExpiry } from '@/lib/utils';
import type { Party, Product, PurchaseDetail, PurchaseDetailItem } from '@/types';
import { getApiErrorMessage } from '@/types';

const PAYMENT_TYPES = [
  { id: 'CASH', label: 'Cash' },
  { id: 'CREDIT', label: 'Credit' },
  { id: 'BANK', label: 'Bank' },
] as const;

/** One editable row on the purchase entry form. Quantities are in packs, not content units. */
interface PurchaseLineDraft {
  productId: string;
  productName: string;
  batchNumber: string;
  /** Free-text MM/YY, normalised to a date on submit. */
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  mrp: number;
  purchaseRate: number;
  gstPercent: number;
  isCustomGst: boolean;
  discountPercent: number;
  packSize: number;
  packUnit: string;
  contentUnit: string;
}

const EMPTY_ITEM: PurchaseLineDraft = {
  productId: '',
  productName: '',
  batchNumber: '',
  expiryDate: '',
  quantity: 1,
  freeQuantity: 0,
  mrp: 0,
  purchaseRate: 0,
  gstPercent: 12,
  isCustomGst: false,
  discountPercent: 0,
  packSize: 1,
  packUnit: 'Strip',
  contentUnit: 'Tablet',
};

function NewPurchasePageContent() {
  const toast = useToast();
  const { refreshData } = useErpData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [parties, setParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Bill Header State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [partyId, setPartyId] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'BANK'>('CASH');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  // Discount & Roundoff State
  const [schemeDiscountType, setSchemeDiscountType] = useState<'amount' | 'percent'>('percent');
  const [schemeDiscountValue, setSchemeDiscountValue] = useState<number>(0);
  const [isRoundOff, setIsRoundOff] = useState<boolean>(true);

  // Line Items State
  const [items, setItems] = useState<PurchaseLineDraft[]>([{ ...EMPTY_ITEM }]);

  const inputRefs = useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement | null }>({});
  /** Synchronous submit lock — see the note in the billing screen. */
  const submitLock = useRef(false);

  const isFormDirty = () => {
    return Boolean(partyId || items.some((i) => i.productId || i.batchNumber || i.mrp > 0 || i.purchaseRate > 0));
  };

  // 1. Browser unload / refresh / close tab prevention
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, items]);

  // 2. Trackpad 2-finger swipe left / Browser Back Button (popstate) trap
  useEffect(() => {
    if (isFormDirty()) {
      window.history.pushState(null, '', window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      if (isFormDirty()) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        setShowUnsavedModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, items]);

  const handleBackClick = () => {
    if (isFormDirty()) {
      setShowUnsavedModal(true);
    } else {
      router.push('/purchases');
    }
  };

  useEffect(() => {
    api.get('/parties').then((r) => setParties(r.data)).catch(console.error);

    if (editId) {
      api.get<PurchaseDetail>(`/purchases/${editId}`).then((r) => {
        const bill = r.data;
        setInvoiceNumber(bill.invoiceNumber || '');
        setPartyId(bill.partyId || bill.party?.id || '');
        setPaymentType(bill.isPaid ? 'CASH' : 'CREDIT');
        if (bill.purchaseDate) {
          setPurchaseDate(new Date(bill.purchaseDate).toISOString().split('T')[0]);
        }

        // Restore the stored bill-level discount as a flat amount, otherwise re-saving an
        // edited bill would silently drop the discount it was created with.
        if (bill.discount) {
          setSchemeDiscountType('amount');
          setSchemeDiscountValue(bill.discount);
        }
        setIsRoundOff(bill.isRoundOff ?? true);

        if (bill.items && bill.items.length > 0) {
          setItems(
            (bill.items ?? []).map((i: PurchaseDetailItem): PurchaseLineDraft => ({
              productId: i.productId,
              productName: i.product?.name || 'Medicine Item',
              batchNumber: i.batchNumber || '',
              expiryDate: toExpiryMMYY(i.expiryDate),
              quantity: i.quantity || 1,
              freeQuantity: i.freeQuantity || 0,
              mrp: i.mrp || 0,
              purchaseRate: i.purchaseRate || 0,
              gstPercent: i.taxPercent || 12,
              isCustomGst: false,
              discountPercent: i.discountPercent || 0,
              packSize: i.product?.packSize || 1,
              packUnit: i.product?.packUnit || 'Strip',
              contentUnit: i.product?.contentUnit || 'Tablet',
            }))
          );
        }
      }).catch(console.error);
    } else {
      api.get('/purchases/next-number').then((r) => setInvoiceNumber(r.data.nextInvoiceNumber)).catch(() => setInvoiceNumber('PUR-001001'));
    }
  }, [editId]);

  // Warm the catalogue cache on open so the first keystroke filters in-memory rather than
  // waiting on a full product fetch.
  useEffect(() => {
    void getCachedProducts('');
  }, []);

  // INSTANT 0ms MEDICINE SEARCH VIA BROWSER CACHE
  useEffect(() => {
    let isCurrent = true;
    if (search.trim()) {
      getCachedProducts(search.trim()).then((res) => {
        if (isCurrent) setProducts(res);
      });
    } else {
      setProducts([]);
    }
    return () => { isCurrent = false; };
  }, [search]);

  // Close the medicine dropdown when clicking away from the row that owns it.
  useEffect(() => {
    if (activeSearchIndex === null) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-medicine-search]')) {
        setActiveSearchIndex(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [activeSearchIndex]);

  const addEmptyItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const selectProductForItem = (index: number, prod: Product) => {
    const updated = [...items];
    // /products includes only the newest batch; used purely to prefill default rates.
    const latestBatch = prod.batches?.[0];
    const defaultMrp = prod.mrp || latestBatch?.mrp || 0;
    const defaultRate = prod.purchaseRate || latestBatch?.purchaseRate || 0;

    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productName: prod.name,
      batchNumber: latestBatch?.batchNumber || '',
      expiryDate: toExpiryMMYY(latestBatch?.expiryDate),
      mrp: defaultMrp,
      purchaseRate: defaultRate,
      gstPercent: prod.gstPercent !== undefined && prod.gstPercent !== null ? prod.gstPercent : 12,
      packSize: prod.packSize || 1,
      packUnit: prod.packUnit || 'Strip',
      contentUnit: prod.contentUnit || 'Tablet',
    };
    setItems(updated);
    setSearch('');
    setActiveSearchIndex(null);

    setTimeout(() => {
      inputRefs.current[`batch-${index}`]?.focus();
    }, 50);
  };

  const clearItemProduct = (index: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: '',
      productName: '',
      batchNumber: '',
      expiryDate: '',
      mrp: 0,
      purchaseRate: 0,
    };
    setItems(updated);
  };

  const updateItem = <K extends keyof PurchaseLineDraft>(index: number, field: K, value: PurchaseLineDraft[K]) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      clearItemProduct(0);
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, keyName: string, nextKeyName?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextKeyName && inputRefs.current[nextKeyName]) {
        inputRefs.current[nextKeyName]?.focus();
      }
    }
  };

  const getItemLineTotal = (item: PurchaseLineDraft) => {
    if (!item.productId) return 0;
    const gross = (item.quantity || 0) * (item.purchaseRate || 0);
    const disc = gross * ((item.discountPercent || 0) / 100);
    return Math.max(0, gross - disc);
  };

  const grossSubtotal = items.reduce((sum, item) => sum + getItemLineTotal(item), 0);
  const totalItemDiscount = items.reduce((sum, item) => {
    const gross = (item.quantity || 0) * (item.purchaseRate || 0);
    return sum + (gross * ((item.discountPercent || 0) / 100));
  }, 0);

  const schemeDiscountAmount = schemeDiscountType === 'percent'
    ? (grossSubtotal * (schemeDiscountValue / 100))
    : schemeDiscountValue;

  const netTaxable = Math.max(0, grossSubtotal - schemeDiscountAmount);
  const gstTotal = items.reduce((sum, item) => {
    const lineTotal = getItemLineTotal(item);
    const itemGst = item.gstPercent !== undefined && item.gstPercent !== null ? item.gstPercent : 12;
    return sum + (lineTotal * (itemGst / 100));
  }, 0);

  const rawGrandTotal = netTaxable + gstTotal;
  const grandTotal = isRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;

  const totalContentUnits = items.reduce((sum, item) => {
    if (!item.productId) return sum;
    const totalStrips = (item.quantity || 0) + (item.freeQuantity || 0);
    return sum + (totalStrips * (item.packSize || 1));
  }, 0);

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    if (!partyId) {
      toast.error('Supplier required', 'Choose the supplier this bill came from.');
      return;
    }
    const validItems = items.filter((i) => i.productId && i.batchNumber);
    if (validItems.length === 0) {
      toast.error('No valid items', 'Each item needs a medicine and a batch number.');
      return;
    }

    // Catch a half-typed or unparseable expiry here. Left to the server it arrives as an
    // unusable date and comes back as a raw Prisma dump the counter staff cannot act on.
    const badExpiry = validItems.find((i) => !isCompleteExpiry(i.expiryDate));
    if (badExpiry) {
      toast.error(
        'Check the expiry date',
        `"${badExpiry.productName}" needs an expiry as MM/YY, for example 07/27.`
      );
      return;
    }

    submitLock.current = true;
    try {
      setIsSubmitting(true);
      const payload = {
        invoiceNumber,
        partyId,
        isPaid: paymentType === 'CASH',
        purchaseDate,
        // Bill-level scheme discount and round-off. These were previously computed for display
        // only and dropped on save, so a discounted purchase was stored at its full value.
        discount: schemeDiscountAmount,
        isRoundOff,
        roundOffAmount: grandTotal - rawGrandTotal,
        items: validItems.map((i) => {
          // Guaranteed complete by the check above, so this always yields a real ISO date
          // rather than passing the raw text through for the server to choke on.
          const [mm, yy] = i.expiryDate.split('/');
          return {
            ...i,
            expiryDate: `20${yy}-${mm.padStart(2, '0')}-01`,
          };
        }),
      };

      if (editId) {
        await api.put(`/purchases/${editId}`, payload);
        toast.success('Purchase entry updated');
      } else {
        await api.post('/purchases', payload);
        toast.success('Purchase entry saved');
      }
      invalidateCatalogCache();
      void refreshData();
      setItems([]);
      router.push('/purchases');
    } catch (err) {
      submitLock.current = false;
      toast.error('Failed to save purchase bill', getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageMain>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" iconOnly onClick={handleBackClick} title="Go back" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">
              {editId ? 'Edit Purchase Entry' : 'New Purchase Entry'}
            </h1>
            <p className="text-sm text-fg-muted">
              {totalContentUnits} units across {items.filter((i) => i.productId).length} medicines
            </p>
          </div>
        </div>

        <Button size="lg" onClick={handleSavePurchase} loading={isSubmitting}>
          <Save className="h-4 w-4" aria-hidden />
          {editId ? 'Update Purchase' : 'Save Purchase'}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT: bill header + summary */}
        <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader title="Bill Details" />
            <CardBody className="space-y-3.5">
              <Field label="Supplier / Party" required>
                <Select
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  ref={(el) => { inputRefs.current['partyId'] = el; }}
                >
                  <option value="">Select supplier…</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Supplier Invoice Number">
                <Input
                  icon={Receipt}
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'invoiceNumber', 'purchaseDate')}
                  ref={(el) => { inputRefs.current['invoiceNumber'] = el; }}
                  placeholder="e.g. DVN-26-78166"
                  className="font-mono font-semibold"
                />
              </Field>

              <Field label="Purchase Date">
                <Input
                  icon={Calendar}
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  ref={(el) => { inputRefs.current['purchaseDate'] = el; }}
                />
              </Field>

              <Field label="Payment Type">
                <div className="grid grid-cols-3 gap-1">
                  {PAYMENT_TYPES.map((m) => {
                    const active = paymentType === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentType(m.id)}
                        aria-pressed={active}
                        className={cn(
                          'h-9 rounded-md text-xs font-bold transition-colors',
                          active ? 'bg-brand text-brand-fg' : 'bg-sunken text-fg-muted hover:bg-hover'
                        )}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <p className="rounded-md border border-line bg-raised px-3 py-2 text-xs text-fg-muted">
                <Building2 className="mr-1.5 inline h-3.5 w-3.5 text-fg-subtle" aria-hidden />
                Marked as <strong className="text-fg">{paymentType === 'CASH' ? 'paid' : 'unpaid (credit)'}</strong> on save.
              </p>
            </CardBody>
          </Card>

          {/* Totals */}
          <Card>
            <CardHeader title="Purchase Summary" />
            <CardBody className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Gross Subtotal</dt>
                  <dd className="font-mono font-bold">{formatCurrency(grossSubtotal)}</dd>
                </div>
                {totalItemDiscount > 0 ? (
                  <div className="flex justify-between text-brand">
                    <dt>(−) Item Discounts</dt>
                    <dd className="font-mono font-bold">−{formatCurrency(totalItemDiscount)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="border-t border-line pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">Bill Discount</span>
                  <div className="flex items-center gap-0.5 rounded-md bg-sunken p-0.5">
                    {(['percent', 'amount'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSchemeDiscountType(t)}
                        aria-pressed={schemeDiscountType === t}
                        className={cn(
                          'rounded-sm px-2.5 py-0.5 text-xs font-bold transition-colors',
                          schemeDiscountType === t ? 'bg-surface text-fg shadow-card' : 'text-fg-subtle'
                        )}
                      >
                        {t === 'percent' ? '%' : '₹'}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={schemeDiscountValue || ''}
                  onChange={(e) => setSchemeDiscountValue(parseFloat(e.target.value) || 0)}
                  placeholder={schemeDiscountType === 'percent' ? '0 %' : '₹ 0.00'}
                  className="h-9 font-mono font-semibold"
                  aria-label="Bill discount"
                />
              </div>

              <dl className="space-y-2 border-t border-line pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Net Taxable</dt>
                  <dd className="font-mono font-bold">{formatCurrency(netTaxable)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">(+) Input GST</dt>
                  <dd className="font-mono font-bold text-accent">{formatCurrency(gstTotal)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-fg-muted">Round Off</dt>
                  <dd>
                    <input
                      type="checkbox"
                      checked={isRoundOff}
                      onChange={(e) => setIsRoundOff(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-brand"
                      aria-label="Round off grand total"
                    />
                  </dd>
                </div>
              </dl>

              <div className="flex items-end justify-between border-t-2 border-fg pt-3">
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wide text-fg-subtle">
                    Grand Total
                  </span>
                  <span className="text-xs text-fg-subtle">({totalContentUnits} units)</span>
                </div>
                <span className="font-mono text-2xl font-extrabold text-brand">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT: line items */}
        <div className="space-y-4 lg:col-span-8">
          <Card className="flex items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-bold text-fg">Items ({items.length})</h2>
              <p className="text-xs text-fg-subtle">Search the catalogue, then enter batch &amp; expiry</p>
            </div>
            <Button type="button" onClick={addEmptyItem}>
              <Plus className="h-4 w-4" aria-hidden />
              Add Item
            </Button>
          </Card>

          {items.map((item, idx) => (
            <Card key={idx} className="p-4 space-y-4">
              {/* Product selector */}
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-subtle text-sm font-extrabold text-brand-hover">
                  {idx + 1}
                </span>

                <div className="relative flex-1" data-medicine-search>
                  {item.productId ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-brand-line bg-brand-subtle px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 font-bold text-brand-hover">
                        <Pill className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                        <span className="truncate">{item.productName}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => clearItemProduct(idx)}
                        title="Change medicine"
                        aria-label="Change medicine"
                        className="rounded-md p-1 text-brand transition-colors hover:bg-brand-line hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input
                        icon={Search}
                        type="text"
                        value={activeSearchIndex === idx ? search : ''}
                        onFocus={() => setActiveSearchIndex(idx)}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search the medicine catalogue…"
                        aria-label={`Search medicine for item ${idx + 1}`}
                      />

                      {activeSearchIndex === idx ? (
                        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-md border border-line bg-surface shadow-pop">
                          {products.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-fg-subtle">
                              {search.trim() ? 'No matching medicine found' : 'Start typing to search the catalogue…'}
                            </p>
                          ) : (
                            products.map((prod) => {
                              return (
                                <button
                                  key={prod.id}
                                  type="button"
                                  onClick={() => selectProductForItem(idx, prod)}
                                  className="flex w-full items-center justify-between gap-3 border-b border-line-light px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-hover"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-fg">{prod.name}</span>
                                    <span className="block text-xs text-fg-subtle">
                                      {prod.companyName || 'Generic'} · 1 {prod.packUnit || 'Strip'} ={' '}
                                      {prod.packSize || 1} {prod.contentUnit || 'Units'}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono text-sm font-bold text-brand">
                                    {formatCurrency(prod.mrp || 0)}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  title="Remove item"
                  aria-label={`Remove item ${idx + 1}`}
                  className="shrink-0 rounded-md p-2 text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Batch No." required>
                  <Input
                    type="text"
                    ref={(el) => { inputRefs.current[`batch-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `batch-${idx}`, `expiry-${idx}`)}
                    value={item.batchNumber}
                    onChange={(e) => updateItem(idx, 'batchNumber', e.target.value)}
                    placeholder="e.g. AB1234"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="Expiry (MM/YY)">
                  <Input
                    type="text"
                    ref={(el) => { inputRefs.current[`expiry-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `expiry-${idx}`, `qty-${idx}`)}
                    value={item.expiryDate}
                    // Typing the four digits off the strip ("0727") is the counter's natural
                    // flow; the slash is inserted for them.
                    onChange={(e) => updateItem(idx, 'expiryDate', normalizeExpiryInput(e.target.value))}
                    placeholder="07/27  (type 0727)"
                    inputMode="numeric"
                    maxLength={5}
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label={`Qty (${item.packUnit || 'Strip'}s)`} required>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    ref={(el) => { inputRefs.current[`qty-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `qty-${idx}`, `free-${idx}`)}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="Free Qty">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    ref={(el) => { inputRefs.current[`free-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `free-${idx}`, `rate-${idx}`)}
                    value={item.freeQuantity}
                    onChange={(e) => updateItem(idx, 'freeQuantity', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="Purchase Rate (₹)">
                  <Input
                    type="number"
                    step="any"
                    ref={(el) => { inputRefs.current[`rate-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `rate-${idx}`, `mrp-${idx}`)}
                    value={item.purchaseRate || ''}
                    onChange={(e) => updateItem(idx, 'purchaseRate', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="MRP / Pack (₹)">
                  <Input
                    type="number"
                    step="any"
                    ref={(el) => { inputRefs.current[`mrp-${idx}`] = el; }}
                    value={item.mrp || ''}
                    onChange={(e) => updateItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="GST %">
                  <Select
                    value={item.gstPercent}
                    onChange={(e) => updateItem(idx, 'gstPercent', parseFloat(e.target.value))}
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </Select>
                </Field>

                <Field label="Discount %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discountPercent || ''}
                    onChange={(e) => updateItem(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                    placeholder="0 %"
                    className="font-mono font-semibold"
                  />
                </Field>
              </div>

              {/* Line total */}
              <div className="flex items-center justify-between rounded-md border border-brand-line bg-brand-subtle px-4 py-2.5">
                <span>
                  <span className="block text-xs font-bold text-brand-hover">Line Total</span>
                  <span className="block text-xs text-brand">Net of discount, before GST</span>
                </span>
                <span className="font-mono text-lg font-extrabold text-brand-hover">
                  {formatCurrency(getItemLineTotal(item))}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* UNSAVED DATA CONFIRMATION MODAL */}
      <Modal
        open={showUnsavedModal}
        onClose={() => setShowUnsavedModal(false)}
        title="Unsaved Purchase Entry"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowUnsavedModal(false)}>
              Continue Editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowUnsavedModal(false);
                router.push('/purchases');
              }}
            >
              Discard &amp; Leave
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p className="text-sm text-fg-muted">
            You have entered unsaved purchase items or supplier details. If you leave now, all your entered
            data will be lost.
          </p>
        </div>
      </Modal>
    </PageMain>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense
      fallback={
        <PageMain>
          <p className="p-8 text-center text-sm text-fg-muted">Loading purchase entry…</p>
        </PageMain>
      }
    >
      <NewPurchasePageContent />
    </Suspense>
  );
}
