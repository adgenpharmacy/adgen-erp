'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { 
  Building2, 
  Receipt, 
  Calendar, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Save, 
  Check, 
  X, 
  Search,
  Pill,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function NewPurchasePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Bill Header State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [partyId, setPartyId] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'BANK'>('CREDIT');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  // Discount & Roundoff State
  const [schemeDiscountType, setSchemeDiscountType] = useState<'amount' | 'percent'>('percent');
  const [schemeDiscountValue, setSchemeDiscountValue] = useState<number>(0);
  const [isRoundOff, setIsRoundOff] = useState<boolean>(true);

  // Line Items State
  const [items, setItems] = useState<any[]>([
    {
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
    }
  ]);

  const inputRefs = useRef<{ [key: string]: HTMLInputElement | HTMLSelectElement | null }>({});

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
      api.get(`/purchases/${editId}`).then((r) => {
        const bill = r.data;
        setInvoiceNumber(bill.invoiceNumber || '');
        setPartyId(bill.partyId || bill.party?.id || '');
        setPaymentType(bill.isPaid ? 'CASH' : 'CREDIT');
        if (bill.purchaseDate) {
          setPurchaseDate(new Date(bill.purchaseDate).toISOString().split('T')[0]);
        }

        if (bill.items && bill.items.length > 0) {
          setItems(
            bill.items.map((i: any) => ({
              productId: i.productId,
              productName: i.product?.name || i.productName || 'Medicine Item',
              batchNumber: i.batchNumber || '',
              expiryDate: i.expiryDate ? new Date(i.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '07/27',
              quantity: i.quantity || 1,
              freeQuantity: i.freeQuantity || 0,
              mrp: i.mrp || 0,
              purchaseRate: i.purchaseRate || 0,
              gstPercent: i.taxPercent || i.gstPercent || 12,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim()) {
        api.get(`/products?q=${encodeURIComponent(search.trim())}`)
          .then((r) => setProducts(r.data))
          .catch(console.error);
      } else {
        setProducts([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  const addEmptyItem = () => {
    setItems((prev) => [
      ...prev,
      {
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
      }
    ]);
  };

  const selectProductForItem = (index: number, prod: any) => {
    const updated = [...items];
    const latestBatch = prod.inventoryBatches?.[0] || prod.batches?.[0];
    const defaultMrp = prod.mrp || latestBatch?.mrp || 0;
    const defaultRate = prod.purchaseRate || latestBatch?.purchaseRate || 0;

    updated[index] = {
      ...updated[index],
      productId: prod.id,
      productName: prod.name,
      batchNumber: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '07/27',
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

  const updateItem = (index: number, field: string, value: any) => {
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

  const getItemLineTotal = (item: any) => {
    if (!item.productId) return 0;
    const gross = (parseFloat(item.quantity) || 0) * (parseFloat(item.purchaseRate) || 0);
    const disc = gross * ((parseFloat(item.discountPercent) || 0) / 100);
    return Math.max(0, gross - disc);
  };

  const grossSubtotal = items.reduce((sum, item) => sum + getItemLineTotal(item), 0);
  const totalItemDiscount = items.reduce((sum, item) => {
    const gross = (parseFloat(item.quantity) || 0) * (parseFloat(item.purchaseRate) || 0);
    return sum + (gross * ((parseFloat(item.discountPercent) || 0) / 100));
  }, 0);

  const schemeDiscountAmount = schemeDiscountType === 'percent'
    ? (grossSubtotal * (schemeDiscountValue / 100))
    : schemeDiscountValue;

  const netTaxable = Math.max(0, grossSubtotal - schemeDiscountAmount);
  const gstTotal = items.reduce((sum, item) => {
    const lineTotal = getItemLineTotal(item);
    const itemGst = item.gstPercent !== undefined && item.gstPercent !== null ? parseFloat(item.gstPercent) : 12;
    return sum + (lineTotal * (itemGst / 100));
  }, 0);

  const rawGrandTotal = netTaxable + gstTotal;
  const grandTotal = isRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;

  const totalContentUnits = items.reduce((sum, item) => {
    if (!item.productId) return sum;
    const totalStrips = (parseFloat(item.quantity) || 0) + (parseFloat(item.freeQuantity) || 0);
    return sum + (totalStrips * (item.packSize || 1));
  }, 0);

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId) {
      alert('Please select a Party / Supplier!');
      return;
    }
    const validItems = items.filter((i) => i.productId && i.batchNumber);
    if (validItems.length === 0) {
      alert('Please select at least 1 medicine item with a valid Batch Number!');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        invoiceNumber,
        partyId,
        isPaid: paymentType === 'CASH',
        purchaseDate,
        items: validItems.map((i) => ({
          ...i,
          expiryDate: i.expiryDate.includes('/') 
            ? `20${i.expiryDate.split('/')[1]}-${i.expiryDate.split('/')[0]}-01`
            : i.expiryDate,
        })),
      };

      if (editId) {
        await api.put(`/purchases/${editId}`, payload);
        alert('Purchase Entry updated successfully!');
      } else {
        await api.post('/purchases', payload);
        alert('Purchase Entry saved successfully!');
      }
      router.push('/purchases');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save purchase bill');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-3 md:p-6 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackClick}
              className="p-2 text-slate-500 hover:text-slate-900 bg-white rounded-xl border border-slate-200 shadow-xs"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-slate-900">New Purchase Entry</h1>
          </div>

          <button
            onClick={handleSavePurchase}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Save Purchase'}</span>
          </button>
        </div>

        {/* 2-Column Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* LEFT COLUMN: Bill Details & Summary (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-3">
              <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Bill Details</h2>
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Party / Supplier *</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <select
                    required
                    ref={(el) => { inputRefs.current['partyId'] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, 'partyId', 'invoiceNumber')}
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Select Supplier Party</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Invoice Number *</label>
                <div className="relative">
                  <Receipt className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    ref={(el) => { inputRefs.current['invoiceNumber'] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, 'invoiceNumber', 'purchaseDate')}
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-90412"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Invoice Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3.5 top-3 text-emerald-600" />
                  <input
                    type="date"
                    ref={(el) => { inputRefs.current['purchaseDate'] = el; }}
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full bg-emerald-50/60 border border-emerald-200 rounded-xl pl-10 pr-3 py-2.5 text-xs font-extrabold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-medium">Payment Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['CASH', 'CREDIT', 'BANK'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentType(mode)}
                      className={`py-2 rounded-xl text-xs font-bold transition ${
                        paymentType === mode ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals Summary Card */}
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-3">
              <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Bill Summary</h2>
              
              <div className="space-y-2 text-xs font-medium text-slate-600">
                <div className="flex justify-between">
                  <span>Gross Subtotal</span>
                  <span className="font-mono font-bold text-slate-900">₹{grossSubtotal.toFixed(2)}</span>
                </div>
                {totalItemDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>(-) Item Discounts</span>
                    <span className="font-mono font-bold">−₹{totalItemDiscount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-700 font-bold">Scheme Discount</span>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSchemeDiscountType('percent')}
                        className={`px-2 py-0.5 rounded-md font-bold ${schemeDiscountType === 'percent' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchemeDiscountType('amount')}
                        className={`px-2 py-0.5 rounded-md font-bold ${schemeDiscountType === 'amount' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                      >
                        ₹
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={schemeDiscountValue || ''}
                    onChange={(e) => setSchemeDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder={schemeDiscountType === 'percent' ? '0 %' : '₹ 0.00'}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="flex justify-between">
                  <span>Total Tax / GST</span>
                  <span className="font-mono font-bold text-slate-900">₹{gstTotal.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-slate-700 font-bold">Round Off</span>
                  <input
                    type="checkbox"
                    checked={isRoundOff}
                    onChange={(e) => setIsRoundOff(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-2 border-t-2 border-slate-900 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">Grand Total</span>
                  <span className="text-[10px] text-slate-400 font-medium">({totalContentUnits} units)</span>
                </div>
                <span className="text-xl font-black font-mono text-emerald-600">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: STACKED CARD FORM GRID (8 Cols) - NO HORIZONTAL SCROLL! */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Items ({items.length})</h2>
                <p className="text-xs text-slate-400">Add medicine items using the stacked grid form below</p>
              </div>
              <button
                type="button"
                onClick={addEmptyItem}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>

            {/* Item Form Cards List */}
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white border-2 border-emerald-100/90 rounded-2xl p-5 shadow-sm space-y-4 relative transition hover:border-emerald-200"
                >
                  {/* Top Item Selector Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-sm flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>

                    <div className="flex-1 relative">
                      {item.productId ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-2.5 text-emerald-900 font-bold text-sm shadow-2xs">
                          <div className="flex items-center gap-2.5 truncate">
                            <Pill className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span className="truncate">{item.productName}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => clearItemProduct(idx)}
                            className="text-emerald-500 hover:text-rose-600 p-1 rounded-lg transition hover:bg-emerald-100"
                            title="Change Medicine"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="relative flex items-center">
                            <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
                            <input
                              type="text"
                              value={activeSearchIndex === idx ? search : ''}
                              onFocus={() => setActiveSearchIndex(idx)}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder="Search medicine catalog by name..."
                              className="w-full bg-slate-50 border-2 border-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-3 focus:ring-emerald-500/20"
                            />
                          </div>

                          {/* Search Dropdown Popover */}
                          {activeSearchIndex === idx && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                              {products.length === 0 ? (
                                <div className="p-4 text-center text-slate-400 text-xs">
                                  {search.trim() ? 'No matching medicines found' : 'Start typing to search medicines...'}
                                </div>
                              ) : (
                                products.map((p) => (
                                  <div
                                    key={p.id}
                                    onClick={() => selectProductForItem(idx, p)}
                                    className="p-3 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition"
                                  >
                                    <div>
                                      <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                                      <div className="text-xs text-slate-400">{p.companyName || 'Generic'} · {p.packUnit}</div>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-emerald-600">₹{p.purchaseRate || p.mrp || 0}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-2 text-slate-400 hover:text-rose-600 transition rounded-xl hover:bg-rose-50 flex-shrink-0"
                      title="Remove item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Form Grid Rows (Stacked, Full Width) */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Row 1: Batch & Expiry */}
                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Batch No. *
                      </label>
                      <input
                        type="text"
                        ref={(el) => { inputRefs.current[`batch-${idx}`] = el; }}
                        value={item.batchNumber}
                        onChange={(e) => updateItem(idx, 'batchNumber', e.target.value)}
                        placeholder="e.g. B-901"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Expiry (MM/YY)
                      </label>
                      <input
                        type="text"
                        value={item.expiryDate}
                        onChange={(e) => updateItem(idx, 'expiryDate', e.target.value)}
                        placeholder="07/27"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Row 2: Qty & Free */}
                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Qty (Strips/Units) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Free Units
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.freeQuantity}
                        onChange={(e) => updateItem(idx, 'freeQuantity', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Row 3: MRP & Purchase Rate */}
                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        MRP/Unit (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={item.mrp || ''}
                        onChange={(e) => updateItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Rate/Unit (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={item.purchaseRate || ''}
                        onChange={(e) => updateItem(idx, 'purchaseRate', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 4: GST %, Disc %, Line Total */}
                  <div className="grid grid-cols-12 gap-3 items-center pt-1">
                    <div className="col-span-3">
                      <label className="text-[10px] font-bold text-slate-400 block mb-0.5">GST %</label>
                      <select
                        value={item.gstPercent}
                        onChange={(e) => updateItem(idx, 'gstPercent', parseFloat(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>

                    <div className="col-span-4 relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.discountPercent || ''}
                        onChange={(e) => updateItem(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                        placeholder="Disc %"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div className="col-span-5 bg-emerald-100/70 border border-emerald-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-800">Line Total</span>
                      <span className="text-base font-black text-emerald-900 font-mono">
                        ₹{getItemLineTotal(item).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* UNSAVED DATA CONFIRMATION MODAL */}
      {showUnsavedModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Unsaved Purchase Entry</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have entered unsaved purchase items or supplier details. If you leave now, all your typed entry data will be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition"
              >
                Continue Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  router.push('/purchases');
                }}
                className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm"
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-medium text-slate-500">Loading Purchase Entry...</div>}>
      <NewPurchasePageContent />
    </Suspense>
  );
}
