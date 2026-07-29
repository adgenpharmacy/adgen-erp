'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { api } from '@/lib/api-client';
import { getCachedInventory, invalidateCatalogCache } from '@/lib/catalog-cache';
import InvoicePrintModal from '@/components/invoice/InvoicePrintModal';
import {
  User,
  Phone,
  Stethoscope,
  MapPin,
  CreditCard,
  Smartphone,
  Clock,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  X,
  Search,
  Pill,
  Banknote,
  AlertTriangle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageMain from '@/components/layout/PageMain';
import { useErpData } from '@/context/ErpDataContext';
import { Button, Card, CardHeader, CardBody, Field, Input, Modal, useToast } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import type { InventoryItem, InventoryBatch, Sale, SaleDetail, SaleDetailItem } from '@/types';
import { getApiErrorMessage } from '@/types';

const PAYMENT_MODES = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'UPI', label: 'UPI', icon: Smartphone },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'CREDIT', label: 'Credit', icon: Clock },
  { id: 'SPLIT', label: 'Split', icon: Plus },
] as const;

/** One editable row on the counter. Not an API type — it holds pack/loose split before submit. */
interface SaleLineDraft {
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  /** Display-only MM/YY string. */
  expiryDate: string;
  /** MRP per pack. */
  mrp: number;
  discountPercent: number;
  quantityStrips: number;
  quantityLoose: number;
  packSize: number;
  packUnit: string;
  contentUnit: string;
  /** Batches available for this product, earliest expiry first. */
  batches: InventoryBatch[];
  taxPercent?: number;
  gstPercent?: number;
}

const EMPTY_ITEM: SaleLineDraft = {
  productId: '',
  productName: '',
  batchId: '',
  batchNumber: '',
  expiryDate: '',
  mrp: 0,
  discountPercent: 0,
  quantityStrips: 0,
  quantityLoose: 0,
  packSize: 1,
  packUnit: 'Strip',
  contentUnit: 'Tablet',
  batches: [],
};

function NewSalePageContent() {
  const toast = useToast();
  const { refreshData, customers } = useErpData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Customer Details State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [address, setAddress] = useState('');

  // Payment Method State
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [upiAmount, setUpiAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [creditAmount, setCreditAmount] = useState<number>(0);

  // Discount & Round Off State
  const [schemeDiscountType, setSchemeDiscountType] = useState<'amount' | 'percent'>('percent');
  const [schemeDiscountValue, setSchemeDiscountValue] = useState<number>(0);
  const [isRoundOff, setIsRoundOff] = useState<boolean>(true);

  // Products Line Items State
  const [items, setItems] = useState<SaleLineDraft[]>([{ ...EMPTY_ITEM }]);

  const [createdBillForPrint, setCreatedBillForPrint] = useState<Sale | null>(null);
  /**
   * Synchronous submit lock. `isSubmitting` alone is not enough: React state updates are
   * async, so two fast clicks (or a click plus F9) both enter the handler before the
   * re-render disables the button — which saved the same bill twice and double-deducted stock.
   */
  const submitLock = useRef(false);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement | null }>({});

  const isFormDirty = () => {
    return Boolean(customerName || customerPhone || items.some((i) => i.productId || i.productName));
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
  }, [customerName, customerPhone, items]);

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
  }, [customerName, customerPhone, items]);

  const handleBackClick = () => {
    if (isFormDirty()) {
      setShowUnsavedModal(true);
    } else {
      router.push('/sales');
    }
  };

  useEffect(() => {
    if (editId) {
      api.get<SaleDetail>(`/sales/${editId}`).then((r) => {
        const bill = r.data;
        setCustomerName(bill.customerName || bill.customer?.name || '');
        setCustomerPhone(bill.customerPhone || bill.customer?.phone || '');
        setDoctorName(bill.doctorName || bill.customer?.doctorName || '');
        setAddress(bill.notes || bill.customer?.address || '');
        setPaymentMethod((bill.paymentMethod as typeof paymentMethod) || 'CASH');

        setCashAmount(bill.cashAmount || 0);
        setUpiAmount(bill.upiAmount || 0);
        setCardAmount(bill.cardAmount || 0);
        setCreditAmount(bill.creditAmount || 0);

        if (bill.discount) {
          setSchemeDiscountType('amount');
          setSchemeDiscountValue(bill.discount);
        }
        setIsRoundOff(bill.isRoundOff ?? true);

        if (bill.items && bill.items.length > 0) {
          setItems(
            (bill.items ?? []).map((i: SaleDetailItem): SaleLineDraft => {
              const packSize = i.product?.packSize || 1;
              const strips = Math.floor((i.quantity || 0) / packSize);
              const loose = (i.quantity || 0) % packSize;

              return {
                productId: i.productId,
                productName: i.product?.name || 'Medicine Item',
                batchId: i.batchId,
                batchNumber: i.batch?.batchNumber || 'DEF-001',
                expiryDate: i.batch?.expiryDate ? new Date(i.batch.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '07/27',
                mrp: i.batch?.mrp || (i.unitPrice ? i.unitPrice * packSize : 0),
                discountPercent: i.discountPercent || 0,
                quantityStrips: strips,
                quantityLoose: loose,
                packSize: packSize,
                packUnit: i.product?.packUnit || 'Strip',
                contentUnit: i.product?.contentUnit || 'Tablet',
                batches: i.batch ? [i.batch] : [],
              };
            })
          );
        }
      }).catch(console.error);
    }
  }, [editId]);

  // Warm the medicine cache the moment the counter opens. Without this the FIRST keystroke
  // paid for a full inventory fetch (~3k rows) before showing anything — the operator is
  // typing the customer's name during this, so the wait is free.
  useEffect(() => {
    void getCachedInventory('');
  }, []);

  // INSTANT 0ms MEDICINE SEARCH VIA BROWSER CACHE.
  // Must hit /inventory, not /products: only /inventory returns live `systemStock` and every
  // batch ordered by expiry ascending. /products returns a single newest-created batch, which
  // made the counter show a hardcoded stock of 10 and pick the wrong batch for FEFO.
  useEffect(() => {
    let isCurrent = true;
    if (search.trim()) {
      getCachedInventory(search.trim()).then((res) => {
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

  // Counter keyboard shortcuts. The operator bills with both hands on the keyboard, so the
  // two most frequent actions get F-keys rather than requiring a trip to the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
        // Focus the new row's search box once it has rendered.
        setTimeout(() => setActiveSearchIndex(items.length), 60);
      }
      if (e.key === 'F9') {
        e.preventDefault();
        handleSaveSale(new Event('submit') as unknown as React.FormEvent);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, customerName, customerPhone, paymentMethod, schemeDiscountValue, isRoundOff, cashAmount, upiAmount, cardAmount, creditAmount]);

  const selectProductForItem = (index: number, invItem: InventoryItem) => {
    // batches[0] is the earliest-expiring batch because /inventory sorts by expiryDate asc.
    const batchList = invItem.batches || [];
    const firstBatch = batchList[0];

    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: invItem.productId || invItem.id,
      productName: invItem.productName || invItem.name || 'Medicine Item',
      batchId: firstBatch?.id || '',
      batchNumber: firstBatch?.batchNumber || 'DEF-001',
      expiryDate: firstBatch?.expiryDate ? new Date(firstBatch.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '07/27',
      mrp: firstBatch?.mrp || invItem.mrp || 0,
      discountPercent: 0,
      quantityStrips: 1,
      quantityLoose: 0,
      packSize: invItem.packSize || 1,
      packUnit: invItem.packUnit || 'Strip',
      contentUnit: invItem.contentUnit || 'Tablet',
      batches: batchList,
    };
    setItems(updated);
    setSearch('');
    setActiveSearchIndex(null);

    setTimeout(() => {
      inputRefs.current[`strips-${index}`]?.focus();
    }, 50);
  };

  const clearItemProduct = (index: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: '',
      productName: '',
      batchId: '',
      batchNumber: '',
      expiryDate: '',
      mrp: 0,
      quantityStrips: 0,
      quantityLoose: 0,
    };
    setItems(updated);
  };

  const updateItem = <K extends keyof SaleLineDraft>(index: number, field: K, value: SaleLineDraft[K]) => {
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

  const getItemLineTotal = (item: SaleLineDraft) => {
    if (!item.productId) return 0;
    const packSize = item.packSize || 1;
    const totalContentUnits = ((item.quantityStrips || 0) * packSize) + (item.quantityLoose || 0);
    const unitPrice = (item.mrp || 0) / packSize;
    const lineGross = totalContentUnits * unitPrice;
    const disc = lineGross * ((item.discountPercent || 0) / 100);
    return Math.max(0, lineGross - disc);
  };

  const grossSubtotal = items.reduce((sum, item) => sum + getItemLineTotal(item), 0);
  const totalItemDiscount = items.reduce((sum, item) => {
    const packSize = item.packSize || 1;
    const totalContentUnits = ((item.quantityStrips || 0) * packSize) + (item.quantityLoose || 0);
    const unitPrice = (item.mrp || 0) / packSize;
    const lineGross = totalContentUnits * unitPrice;
    return sum + (lineGross * ((item.discountPercent || 0) / 100));
  }, 0);

  const schemeDiscountAmount = schemeDiscountType === 'percent'
    ? (grossSubtotal * (schemeDiscountValue / 100))
    : schemeDiscountValue;

  // MRP is tax-inclusive by Indian GST law for Retail Pharmacy POS:
  // Grand Total = Total MRP - Discounts
  // Taxable Subtotal = Grand Total / (1 + TaxRate)
  // GST Tax Amount = Grand Total - Taxable Subtotal
  const rawGrandTotal = Math.max(0, grossSubtotal - schemeDiscountAmount);
  const gstRate = 0.12; // 12% default average GST
  const netTaxable = rawGrandTotal / (1 + gstRate);
  const gstTotal = rawGrandTotal - netTaxable;

  const grandTotal = isRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;

  const totalContentUnits = items.reduce((sum, item) => {
    if (!item.productId) return sum;
    const packSize = item.packSize || 1;
    return sum + (((item.quantityStrips || 0) * packSize) + (item.quantityLoose || 0));
  }, 0);

  const splitAllocated = cashAmount + upiAmount + cardAmount + creditAmount;

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    const validItems = items.filter((i) => i.productId && (i.quantityStrips > 0 || i.quantityLoose > 0));
    if (validItems.length === 0) {
      toast.error('Nothing to bill', 'Add at least one medicine with a quantity.');
      return;
    }

    // A line where the medicine was typed but never picked from the suggestions has no
    // productId, and the filter above drops it without a word — the customer would be charged
    // for fewer medicines than were rung up. Stop the sale and say which line is at fault.
    const notSelected = items.find((i) => !i.productId && i.productName.trim());
    if (notSelected) {
      toast.error(
        'Medicine not selected',
        `"${notSelected.productName.trim()}" was typed but not chosen from the list. Pick it from the suggestions, or clear the line.`
      );
      return;
    }

    if (paymentMethod === 'SPLIT') {
      const splitSum = (cashAmount || 0) + (upiAmount || 0) + (cardAmount || 0) + (creditAmount || 0);
      if (Math.abs(splitSum - grandTotal) > 0.5) {
        toast.error('Split payment does not balance', `Allocated ₹${splitSum.toFixed(2)} but the bill total is ₹${grandTotal.toFixed(2)}.`);
        return;
      }
    }

    submitLock.current = true;
    try {
      setIsSubmitting(true);
      const payload = {
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || null,
        doctorName: doctorName.trim() || null,
        notes: address.trim() || null,
        paymentMethod,
        cashAmount: paymentMethod === 'SPLIT' ? cashAmount : (paymentMethod === 'CASH' ? grandTotal : 0),
        upiAmount: paymentMethod === 'SPLIT' ? upiAmount : (paymentMethod === 'UPI' ? grandTotal : 0),
        cardAmount: paymentMethod === 'SPLIT' ? cardAmount : (paymentMethod === 'CARD' ? grandTotal : 0),
        creditAmount: paymentMethod === 'SPLIT' ? creditAmount : (paymentMethod === 'CREDIT' ? grandTotal : 0),
        discount: schemeDiscountAmount,
        isRoundOff,
        roundOffAmount: grandTotal - rawGrandTotal,
        items: validItems.map((i) => ({
          productId: i.productId,
          batchId: i.batchId,
          quantity: ((i.quantityStrips || 0) * (i.packSize || 1)) + (i.quantityLoose || 0),
          unitPrice: (i.mrp || 0) / (i.packSize || 1),
          taxPercent: i.taxPercent !== undefined ? i.taxPercent : (i.gstPercent !== undefined ? i.gstPercent : 12),
          discountPercent: i.discountPercent || 0,
        })),
      };

      if (editId) {
        await api.put(`/sales/${editId}`, payload);
        invalidateCatalogCache();
        // Refresh in the background: awaiting a 7-endpoint refetch here made every save
        // feel sluggish even though the write itself had already committed.
        void refreshData();
        toast.success('Sales invoice updated');
        setItems([]);
        router.push('/sales');
      } else {
        const res = await api.post('/sales', payload);
        invalidateCatalogCache();
        void refreshData();
        setItems([]);
        setCustomerName('');
        setCustomerPhone('');
        setDoctorName('');
        setAddress('');
        setCreatedBillForPrint(res.data);
      }
    } catch (err) {
      // Only release on failure. On success the screen navigates away (or opens the print
      // modal), so staying locked prevents a stray second click from re-submitting.
      submitLock.current = false;
      toast.error('Failed to save sales invoice', getApiErrorMessage(err));
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
              {editId ? 'Edit Sales Invoice' : 'New Sale (POS)'}
            </h1>
            <p className="text-sm text-fg-muted">
              {totalContentUnits} units across {items.filter((i) => i.productId).length} medicines
              <span className="ml-2 hidden sm:inline text-fg-subtle">
                · <kbd className="font-mono font-semibold">F2</kbd> add item
                · <kbd className="font-mono font-semibold">F9</kbd> save
              </span>
            </p>
          </div>
        </div>

        <Button size="lg" onClick={handleSaveSale} loading={isSubmitting}>
          <Save className="h-4 w-4" aria-hidden />
          {editId ? 'Update Sale' : 'Save Sale'}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT: Customer + summary */}
        <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader title="Customer Details" />
            <CardBody className="space-y-3.5">
              <Field label="Customer Name" hint="Pick a saved customer to fill phone & doctor">
                <Input
                  icon={User}
                  type="text"
                  list="billing-customer-list"
                  ref={(el) => { inputRefs.current['customerName'] = el; }}
                  onKeyDown={(e) => handleKeyDown(e, 'customerName', 'customerPhone')}
                  value={customerName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomerName(value);
                    // Selecting a saved customer pulls through their phone and usual doctor,
                    // which is the whole point of keeping a customer directory.
                    const match = customers.find(
                      (c) => c.name.toLowerCase().trim() === value.toLowerCase().trim()
                    );
                    if (match) {
                      if (match.phone) setCustomerPhone(match.phone);
                      if (match.doctorName) setDoctorName(match.doctorName);
                      if (match.address) setAddress(match.address);
                    }
                  }}
                  placeholder="Walk-in Customer"
                />
                <datalist id="billing-customer-list">
                  {customers.slice(0, 500).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.phone ?? ''}
                    </option>
                  ))}
                </datalist>
              </Field>

              <Field label="Phone Number">
                <Input
                  icon={Phone}
                  type="tel"
                  maxLength={10}
                  ref={(el) => { inputRefs.current['customerPhone'] = el; }}
                  onKeyDown={(e) => handleKeyDown(e, 'customerPhone', 'doctorName')}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="e.g. 9826012345"
                  className="font-mono"
                />
              </Field>

              <Field label="Doctor Name">
                <Input
                  icon={Stethoscope}
                  type="text"
                  ref={(el) => { inputRefs.current['doctorName'] = el; }}
                  onKeyDown={(e) => handleKeyDown(e, 'doctorName', 'address')}
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="e.g. Dr. Sharma"
                />
              </Field>

              {/* Saved to the bill's notes field. Previously the Enter key jumped here from Doctor
                  but no input existed to receive focus. */}
              <Field label="Address / Notes">
                <Input
                  icon={MapPin}
                  type="text"
                  ref={(el) => { inputRefs.current['address'] = el; }}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city — or any bill remark"
                />
              </Field>

              <Field label="Payment Mode">
                <div className="grid grid-cols-5 gap-1">
                  {PAYMENT_MODES.map((m) => {
                    const Icon = m.icon;
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        aria-pressed={active}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-md py-2 text-[10px] font-bold transition-colors',
                          active ? 'bg-brand text-brand-fg' : 'bg-sunken text-fg-muted hover:bg-hover'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {paymentMethod === 'SPLIT' ? (
                <div className="space-y-3 rounded-md border border-brand-line bg-brand-subtle p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-hover">
                    Multi-mode split breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ['Cash', cashAmount, setCashAmount],
                        ['UPI', upiAmount, setUpiAmount],
                        ['Card', cardAmount, setCardAmount],
                        ['Credit', creditAmount, setCreditAmount],
                      ] as const
                    ).map(([label, value, setter]) => (
                      <Field key={label} label={`${label} (₹)`}>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={value || ''}
                          onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-9 font-mono font-semibold"
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-brand-line pt-2 text-xs font-bold">
                    <span className="text-fg-muted">Total allocated</span>
                    <span
                      className={cn(
                        'font-mono',
                        Math.abs(splitAllocated - grandTotal) < 0.5 ? 'text-brand' : 'text-warn'
                      )}
                    >
                      {formatCurrency(splitAllocated)} / {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Totals */}
          <Card>
            <CardHeader title="Invoice Summary" />
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
                  <dt className="text-fg-muted">Estimated Tax / GST</dt>
                  <dd className="font-mono font-bold">{formatCurrency(gstTotal)}</dd>
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
              <p className="text-xs text-fg-subtle">Scan or search inventory medicine items instantly</p>
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
                        placeholder="Search medicine stock instantly…"
                        aria-label={`Search medicine for item ${idx + 1}`}
                      />

                      {activeSearchIndex === idx ? (
                        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-md border border-line bg-surface shadow-pop">
                          {products.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-fg-subtle">
                              {search.trim() ? 'No matching stock found' : 'Start typing to search inventory…'}
                            </p>
                          ) : (
                            products.map((inv) => {
                              const batch = inv.batches?.[0];
                              return (
                                <button
                                  key={inv.id}
                                  type="button"
                                  onClick={() => selectProductForItem(idx, inv)}
                                  className="flex w-full items-center justify-between gap-3 border-b border-line-light px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-hover"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-fg">
                                      {inv.productName || inv.name}
                                    </span>
                                    <span className="block text-xs text-fg-subtle">
                                      Batch {batch?.batchNumber || 'DEF-001'} · Stock {inv.systemStock}{' '}
                                      {inv.contentUnit || 'Units'}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono text-sm font-bold text-brand">
                                    {formatCurrency(batch?.mrp || inv.mrp || 0)}
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Batch No." required>
                  {item.batches && item.batches.length > 1 ? (
                    <select
                      value={item.batchId}
                      onChange={(e) => {
                        const b = item.batches.find((x) => x.id === e.target.value);
                        if (b) {
                          const updated = [...items];
                          updated[idx] = {
                            ...updated[idx],
                            batchId: b.id,
                            batchNumber: b.batchNumber,
                            mrp: b.mrp,
                            expiryDate: b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '07/27',
                          };
                          setItems(updated);
                        }
                      }}
                      className="h-10 w-full cursor-pointer rounded-md border border-line bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                    >
                      {item.batches.map((b) => (
                        <option key={b.id} value={b.id}>{b.batchNumber} (MRP: ₹{b.mrp})</option>
                      ))}
                    </select>
                  ) : (
                    <Input type="text" readOnly value={item.batchNumber || 'DEF-001'} className="bg-sunken" />
                  )}
                </Field>

                <Field label="Expiry (MM/YY)">
                  <Input type="text" readOnly value={item.expiryDate || '07/27'} className="bg-sunken font-mono" />
                </Field>

                <Field label={`Qty (${item.packUnit || 'Strip'}s)`} required>
                  <Input
                    type="number"
                    min="0"
                    ref={(el) => { inputRefs.current[`strips-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `strips-${idx}`, `loose-${idx}`)}
                    value={item.quantityStrips}
                    onChange={(e) => updateItem(idx, 'quantityStrips', parseFloat(e.target.value) || 0)}
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label={`Qty (loose ${item.contentUnit || 'unit'}s)`}>
                  <Input
                    type="number"
                    min="0"
                    ref={(el) => { inputRefs.current[`loose-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `loose-${idx}`, `mrp-${idx}`)}
                    value={item.quantityLoose}
                    onChange={(e) => updateItem(idx, 'quantityLoose', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="MRP / Pack (₹)">
                  <Input
                    type="number"
                    step="any"
                    ref={(el) => { inputRefs.current[`mrp-${idx}`] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, `mrp-${idx}`, `disc-${idx}`)}
                    value={item.mrp || ''}
                    onChange={(e) => updateItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="font-mono font-semibold"
                  />
                </Field>

                <Field label="Discount %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    ref={(el) => { inputRefs.current[`disc-${idx}`] = el; }}
                    // End of the row: Enter jumps to the next item's quantity, matching how the
                    // operator actually moves down a bill.
                    onKeyDown={(e) => handleKeyDown(e, `disc-${idx}`, `strips-${idx + 1}`)}
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
                  <span className="block text-xs text-brand">Includes MRP rate &amp; discounts</span>
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
        title="Unsaved Sales Invoice"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowUnsavedModal(false)}>
              Continue Billing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowUnsavedModal(false);
                router.push('/sales');
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
            You have entered unsaved sales items or customer details. If you leave now, all your entered
            billing data will be lost.
          </p>
        </div>
      </Modal>

      {/* Invoice Print Modal Popup after save */}
      {createdBillForPrint && (
        <InvoicePrintModal
          bill={createdBillForPrint}
          onClose={() => { setCreatedBillForPrint(null); router.push('/sales'); }}
        />
      )}
    </PageMain>
  );
}

export default function NewSalePage() {
  return (
    <Suspense
      fallback={
        <PageMain>
          <p className="p-8 text-center text-sm text-fg-muted">Loading billing counter…</p>
        </PageMain>
      }
    >
      <NewSalePageContent />
    </Suspense>
  );
}
