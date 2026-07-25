'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { api } from '@/lib/api-client';
import { getCachedProducts, invalidateCatalogCache } from '@/lib/catalog-cache';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import InvoicePrintModal from '@/components/invoice/InvoicePrintModal';
import { 
  User, 
  Phone, 
  Stethoscope, 
  MapPin, 
  CreditCard, 
  Smartphone, 
  Clock, 
  Camera, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Save, 
  Check, 
  X, 
  Search,
  Pill,
  Banknote,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function NewSalePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
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
  const [items, setItems] = useState<any[]>([
    {
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
    }
  ]);

  const [createdBillForPrint, setCreatedBillForPrint] = useState<any>(null);
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
      api.get(`/sales/${editId}`).then((r) => {
        const bill = r.data;
        setCustomerName(bill.customerName || bill.customer?.name || '');
        setCustomerPhone(bill.customerPhone || bill.customer?.phone || '');
        setDoctorName(bill.doctorName || bill.customer?.doctorName || '');
        setAddress(bill.notes || bill.customer?.address || '');
        setPaymentMethod(bill.paymentMethod || 'CASH');

        if (bill.items && bill.items.length > 0) {
          setItems(
            bill.items.map((i: any) => {
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

  const addEmptyItem = () => {
    setItems((prev) => [
      ...prev,
      {
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
      }
    ]);
  };

  const selectProductForItem = (index: number, invItem: any) => {
    const prod = invItem.product || invItem;
    const batchList = invItem.batches || prod.batches || [];
    const firstBatch = batchList[0] || {};

    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productId: prod.id || invItem.productId || invItem.id,
      productName: prod.name || invItem.name || invItem.productName || 'Medicine Item',
      batchId: firstBatch.id || '',
      batchNumber: firstBatch.batchNumber || 'DEF-001',
      expiryDate: firstBatch.expiryDate ? new Date(firstBatch.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '07/27',
      mrp: firstBatch.mrp || invItem.mrp || prod.mrp || 0,
      discountPercent: 0,
      quantityStrips: 1,
      quantityLoose: 0,
      packSize: prod.packSize || invItem.packSize || 1,
      packUnit: prod.packUnit || invItem.packUnit || 'Strip',
      contentUnit: prod.contentUnit || invItem.contentUnit || 'Tablet',
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
    const packSize = item.packSize || 1;
    const totalContentUnits = ((parseFloat(item.quantityStrips) || 0) * packSize) + (parseFloat(item.quantityLoose) || 0);
    const unitPrice = (parseFloat(item.mrp) || 0) / packSize;
    const lineGross = totalContentUnits * unitPrice;
    const disc = lineGross * ((parseFloat(item.discountPercent) || 0) / 100);
    return Math.max(0, lineGross - disc);
  };

  const grossSubtotal = items.reduce((sum, item) => sum + getItemLineTotal(item), 0);
  const totalItemDiscount = items.reduce((sum, item) => {
    const packSize = item.packSize || 1;
    const totalContentUnits = ((parseFloat(item.quantityStrips) || 0) * packSize) + (parseFloat(item.quantityLoose) || 0);
    const unitPrice = (parseFloat(item.mrp) || 0) / packSize;
    const lineGross = totalContentUnits * unitPrice;
    return sum + (lineGross * ((parseFloat(item.discountPercent) || 0) / 100));
  }, 0);

  const schemeDiscountAmount = schemeDiscountType === 'percent'
    ? (grossSubtotal * (schemeDiscountValue / 100))
    : schemeDiscountValue;

  const netTaxable = Math.max(0, grossSubtotal - schemeDiscountAmount);
  const gstTotal = items.reduce((sum, item) => {
    const lineTotal = getItemLineTotal(item);
    return sum + (lineTotal * 0.12);
  }, 0);

  const rawGrandTotal = netTaxable + gstTotal;
  const grandTotal = isRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;

  const totalContentUnits = items.reduce((sum, item) => {
    if (!item.productId) return sum;
    const packSize = item.packSize || 1;
    return sum + (((parseFloat(item.quantityStrips) || 0) * packSize) + (parseFloat(item.quantityLoose) || 0));
  }, 0);

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.productId && (i.quantityStrips > 0 || i.quantityLoose > 0));
    if (validItems.length === 0) {
      alert('Please select at least 1 medicine item with quantity!');
      return;
    }

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
          quantity: ((parseFloat(i.quantityStrips) || 0) * (i.packSize || 1)) + (parseFloat(i.quantityLoose) || 0),
          unitPrice: (parseFloat(i.mrp) || 0) / (i.packSize || 1),
          taxPercent: 12,
          discountPercent: i.discountPercent || 0,
        })),
      };

      if (editId) {
        await api.put(`/sales/${editId}`, payload);
        alert('Sales invoice updated successfully!');
        router.push('/sales');
      } else {
        const res = await api.post('/sales', payload);
        invalidateCatalogCache();
        setCreatedBillForPrint(res.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save sales invoice');
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
            <h1 className="text-xl font-bold text-slate-900">New Sale</h1>
          </div>

          <button
            onClick={handleSaveSale}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm transition shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Save Sale'}</span>
          </button>
        </div>

        {/* 2-Column Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* LEFT COLUMN: Customer Details & Summary (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-3">
              <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Customer Details</h2>
              
              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Customer Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    ref={(el) => { inputRefs.current['customerName'] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, 'customerName', 'customerPhone')}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Phone Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    ref={(el) => { inputRefs.current['customerPhone'] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, 'customerPhone', 'doctorName')}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 9826012345"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1 font-medium">Doctor Name</label>
                <div className="relative">
                  <Stethoscope className="w-4 h-4 absolute left-3.5 top-3 text-emerald-600" />
                  <input
                    type="text"
                    ref={(el) => { inputRefs.current['doctorName'] = el; }}
                    onKeyDown={(e) => handleKeyDown(e, 'doctorName', 'address')}
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Sharma"
                    className="w-full bg-emerald-50/60 border border-emerald-200 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-medium">Payment Mode</label>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { id: 'CASH', label: 'Cash', icon: Banknote },
                    { id: 'UPI', label: 'UPI', icon: Smartphone },
                    { id: 'CARD', label: 'Card', icon: CreditCard },
                    { id: 'CREDIT', label: 'Credit', icon: Clock },
                    { id: 'SPLIT', label: 'Split', icon: Plus },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`py-2 rounded-xl text-[10px] font-bold transition flex flex-col items-center gap-1 ${
                        paymentMethod === m.id ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Split Payment Breakdown Inputs */}
                {paymentMethod === 'SPLIT' && (
                  <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-xs">
                    <div className="font-extrabold text-emerald-900 text-[11px] uppercase tracking-wider">
                      Multi-Mode Split Breakdown
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Cash Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={cashAmount || ''}
                          onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">UPI Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={upiAmount || ''}
                          onChange={(e) => setUpiAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Card Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={cardAmount || ''}
                          onChange={(e) => setCardAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Credit Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={creditAmount || ''}
                          onChange={(e) => setCreditAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-emerald-200 flex justify-between items-center text-[11px] font-bold">
                      <span>Total Allocated:</span>
                      <span className={`font-mono ${
                        (cashAmount + upiAmount + cardAmount + creditAmount) === grandTotal
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}>
                        ₹{(cashAmount + upiAmount + cardAmount + creditAmount).toFixed(2)} / ₹{grandTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Totals Summary Card */}
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-3">
              <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">Invoice Summary</h2>
              
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
                    <span className="text-slate-700 font-bold">Bill Discount</span>
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
                  <span>Estimated Tax / GST</span>
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
                <p className="text-xs text-slate-400">Scan or search inventory medicine items instantly</p>
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
                              placeholder="Search medicine stock instantly (0ms)..."
                              className="w-full bg-slate-50 border-2 border-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white focus:ring-3 focus:ring-emerald-500/20"
                            />
                          </div>

                          {/* Search Dropdown Popover */}
                          {activeSearchIndex === idx && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                              {products.length === 0 ? (
                                <div className="p-4 text-center text-slate-400 text-xs font-sans">
                                  {search.trim() ? 'No matching stock found' : 'Start typing to search inventory...'}
                                </div>
                              ) : (
                                products.map((inv) => {
                                  const prod = inv.product || inv;
                                  const batch = inv.batches?.[0] || prod.batches?.[0] || {};
                                  return (
                                    <div
                                      key={inv.id}
                                      onClick={() => selectProductForItem(idx, inv)}
                                      className="p-3 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition font-sans"
                                    >
                                      <div>
                                        <div className="font-bold text-slate-900 text-sm">{prod.name}</div>
                                        <div className="text-xs text-slate-400">
                                          Batch: {batch.batchNumber || 'DEF-001'} · Stock: {inv.systemStock || 10} {prod.contentUnit || 'Units'}
                                        </div>
                                      </div>
                                      <span className="text-xs font-mono font-bold text-emerald-600">₹{batch.mrp || prod.mrp || 0}</span>
                                    </div>
                                  );
                                })
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
                      {item.batches && item.batches.length > 1 ? (
                        <select
                          value={item.batchId}
                          onChange={(e) => {
                            const b = item.batches.find((x: any) => x.id === e.target.value);
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
                          className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none cursor-pointer"
                        >
                          {item.batches.map((b: any) => (
                            <option key={b.id} value={b.id}>{b.batchNumber} (MRP: ₹{b.mrp})</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          readOnly
                          value={item.batchNumber || 'DEF-001'}
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600"
                        />
                      )}
                    </div>

                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Expiry (MM/YY)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={item.expiryDate || '07/27'}
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600"
                      />
                    </div>

                    {/* Row 2: Qty Strips & Qty Loose */}
                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Qty (Strips/Packs) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        ref={(el) => { inputRefs.current[`strips-${idx}`] = el; }}
                        value={item.quantityStrips}
                        onChange={(e) => updateItem(idx, 'quantityStrips', parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        Qty (Loose Units)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.quantityLoose}
                        onChange={(e) => updateItem(idx, 'quantityLoose', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Row 3: MRP/Pack (₹) & Discount % */}
                    <div className="relative">
                      <label className="text-[11px] font-bold text-slate-600 bg-white px-1.5 absolute -top-2.5 left-3.5 z-10">
                        MRP/Pack (₹)
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
                        Discount %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.discountPercent || ''}
                        onChange={(e) => updateItem(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                        placeholder="0 %"
                        className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 4: Line Total Bar */}
                  <div className="bg-emerald-100/70 border border-emerald-200/80 rounded-xl px-5 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-800 block">Line Total</span>
                      <span className="text-[10px] text-emerald-600 font-medium">Includes MRP rate & discounts</span>
                    </div>
                    <span className="text-lg font-black text-emerald-900 font-mono">
                      ₹{getItemLineTotal(item).toFixed(2)}
                    </span>
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
              <h3 className="text-base font-bold text-slate-900">Unsaved Sales Invoice</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You have entered unsaved sales items or customer details. If you leave now, all your entered billing data will be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition"
              >
                Continue Billing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  router.push('/sales');
                }}
                className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm"
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Print Modal Popup after save */}
      {createdBillForPrint && (
        <InvoicePrintModal bill={createdBillForPrint} onClose={() => { setCreatedBillForPrint(null); router.push('/sales'); }} />
      )}

      <BottomNav />
    </div>
  );
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-medium text-slate-500">Loading Billing Counter...</div>}>
      <NewSalePageContent />
    </Suspense>
  );
}
