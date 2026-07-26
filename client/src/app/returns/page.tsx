'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { 
  RotateCcw, 
  Search, 
  Plus, 
  RefreshCw, 
  X, 
  Check, 
  FileText, 
  Banknote, 
  Smartphone, 
  CreditCard, 
  ArrowLeftRight,
  PackageCheck,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals state
  const [showSalesReturnModal, setShowSalesReturnModal] = useState(false);
  const [showPurchaseReturnModal, setShowPurchaseReturnModal] = useState(false);

  // Sales Return Form State
  const [srCustomerName, setSrCustomerName] = useState('');
  const [srRefundMethod, setSrRefundMethod] = useState<'CASH' | 'UPI' | 'CREDIT_NOTE'>('CASH');
  const [srNotes, setSrNotes] = useState('');
  const [srItems, setSrItems] = useState<any[]>([
    { productId: '', productName: '', batchNumber: '', quantity: 1, unitPrice: 0, condition: 'RESTOCK', reason: 'Customer Changed Mind' }
  ]);

  // Purchase Return Form State
  const [prPartyName, setPrPartyName] = useState('');
  const [prRefundMethod, setPrRefundMethod] = useState<'CASH' | 'UPI' | 'DEBIT_NOTE'>('DEBIT_NOTE');
  const [prNotes, setPrNotes] = useState('');
  const [prItems, setPrItems] = useState<any[]>([
    { productId: '', productName: '', batchNumber: '', quantity: 1, purchaseRate: 0, reason: 'Damaged Packaging' }
  ]);

  const [productsList, setProductsList] = useState<any[]>([]);

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
        alert(`Medicine "${item.productName}" not found in catalog. Please select a valid medicine.`);
        return;
      }
      itemsToSubmit.push({
        productId: matchedId,
        batchNumber: item.batchNumber || 'DEFAULT',
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        condition: item.condition,
        reason: item.reason,
      });
    }

    try {
      await api.post('/returns/sales', {
        refundMethod: srRefundMethod,
        notes: `${srCustomerName ? 'Customer: ' + srCustomerName + ' • ' : ''}${srNotes}`,
        items: itemsToSubmit,
      });

      alert('Sales Return Credit Note created & inventory updated!');
      setShowSalesReturnModal(false);
      fetchReturnsData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create sales return');
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
        alert(`Medicine "${item.productName}" not found in catalog. Please select a valid medicine.`);
        return;
      }
      itemsToSubmit.push({
        productId: matchedId,
        batchNumber: item.batchNumber || 'DEFAULT',
        quantity: parseFloat(item.quantity),
        purchaseRate: parseFloat(item.purchaseRate),
        reason: item.reason,
      });
    }

    try {
      await api.post('/returns/purchases', {
        refundMethod: prRefundMethod,
        notes: `${prPartyName ? 'Supplier: ' + prPartyName + ' • ' : ''}${prNotes}`,
        items: itemsToSubmit,
      });

      alert('Purchase Return Debit Note created & inventory stock deducted!');
      setShowPurchaseReturnModal(false);
      fetchReturnsData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create purchase return');
    }
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-6 h-6 text-emerald-600" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sales & Purchase Returns</h1>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Issue Credit Notes (Customer Returns) & Debit Notes (Supplier Returns) with automated stock adjustments
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchReturnsData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs"
              title="Refresh Returns"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {activeTab === 'SALES' ? (
              <button
                onClick={() => setShowSalesReturnModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>+ Sales Return (Credit Note)</span>
              </button>
            ) : (
              <button
                onClick={() => setShowPurchaseReturnModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>+ Purchase Return (Debit Note)</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className="flex bg-white border border-slate-200 p-1.5 rounded-2xl shadow-xs mb-6 w-fit">
          <button
            onClick={() => setActiveTab('SALES')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'SALES'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Sales Returns (Credit Notes)</span>
          </button>

          <button
            onClick={() => setActiveTab('PURCHASE')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${
              activeTab === 'PURCHASE'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Purchase Returns (Debit Notes)</span>
          </button>
        </div>

        {/* Content Section */}
        {loading ? (
          <LoadingSkeleton type="table" rows={6} />
        ) : activeTab === 'SALES' ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            {salesReturns.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-bold">
                No Sales Returns / Credit Notes created yet. Click "+ Sales Return" to issue a credit memo.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                    <th className="py-3.5 px-4">Credit Note #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Refund Mode</th>
                    <th className="py-3.5 px-4">Items Returned</th>
                    <th className="py-3.5 px-4 text-right">Return Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-800">
                  {salesReturns.map((sr) => (
                    <tr key={sr.id} className="hover:bg-emerald-50/40 transition">
                      <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-700">
                        {sr.returnNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{formatDate(sr.createdAt)}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase border border-emerald-200">
                          {sr.refundMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-bold">
                        {(sr.items || []).length} Medicine Items
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                        ₹{(sr.totalReturnAmount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            {purchaseReturns.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-bold">
                No Purchase Returns / Debit Notes created yet. Click "+ Purchase Return" to issue a debit memo.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase">
                    <th className="py-3.5 px-4">Debit Note #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Refund Mode</th>
                    <th className="py-3.5 px-4">Items Returned</th>
                    <th className="py-3.5 px-4 text-right">Return Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-800">
                  {purchaseReturns.map((pr) => (
                    <tr key={pr.id} className="hover:bg-indigo-50/40 transition">
                      <td className="py-3.5 px-4 font-mono font-extrabold text-indigo-700">
                        {pr.returnNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{formatDate(pr.createdAt)}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-indigo-100 text-indigo-800 uppercase border border-indigo-200">
                          {pr.refundMethod || 'DEBIT_NOTE'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-bold">
                        {(pr.items || []).length} Medicine Items
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                        ₹{(pr.totalReturnAmount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* CREATE SALES RETURN MODAL */}
      <AnimatePresence>
        {showSalesReturnModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-emerald-700 font-extrabold">
                  <RotateCcw className="w-5 h-5" />
                  <h3>Create Customer Sales Return (Credit Note)</h3>
                </div>
                <button onClick={() => setShowSalesReturnModal(false)} className="text-slate-400 hover:text-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSalesReturn} className="space-y-4 text-xs font-medium">
                <div>
                  <label className="text-slate-600 block mb-1 font-bold">Customer Name (Optional)</label>
                  <input
                    type="text"
                    value={srCustomerName}
                    onChange={(e) => setSrCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1 font-bold">Refund Method</label>
                  <select
                    value={srRefundMethod}
                    onChange={(e) => setSrRefundMethod(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
                  >
                    <option value="CASH">Refund Cash to Customer</option>
                    <option value="UPI">Refund via UPI Transfer</option>
                    <option value="CREDIT_NOTE">Store Credit Note Balance</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-slate-700 font-bold block">Return Medicine Item</label>
                  {srItems.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Medicine Name</label>
                          <input
                            type="text"
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
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Batch Number</label>
                          <input
                            type="text"
                            value={item.batchNumber}
                            onChange={(e) => {
                              const copy = [...srItems];
                              copy[idx].batchNumber = e.target.value;
                              setSrItems(copy);
                            }}
                            placeholder="e.g. BATCH-123"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Return Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const copy = [...srItems];
                              copy[idx].quantity = parseFloat(e.target.value) || 1;
                              setSrItems(copy);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Unit Price (₹)</label>
                          <input
                            type="number"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const copy = [...srItems];
                              copy[idx].unitPrice = parseFloat(e.target.value) || 0;
                              setSrItems(copy);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Stock Action</label>
                          <select
                            value={item.condition}
                            onChange={(e) => {
                              const copy = [...srItems];
                              copy[idx].condition = e.target.value;
                              setSrItems(copy);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          >
                            <option value="RESTOCK">Restock into Inventory</option>
                            <option value="DAMAGED">Discard as Damaged</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowSalesReturnModal(false)}
                    className="px-4 py-2 text-slate-600 bg-slate-100 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold shadow-md shadow-emerald-600/20"
                  >
                    Issue Credit Note
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE PURCHASE RETURN MODAL */}
      <AnimatePresence>
        {showPurchaseReturnModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-indigo-700 font-extrabold">
                  <ArrowLeftRight className="w-5 h-5" />
                  <h3>Create Supplier Purchase Return (Debit Note)</h3>
                </div>
                <button onClick={() => setShowPurchaseReturnModal(false)} className="text-slate-400 hover:text-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePurchaseReturn} className="space-y-4 text-xs font-medium">
                <div>
                  <label className="text-slate-600 block mb-1 font-bold">Supplier Party Name</label>
                  <input
                    type="text"
                    value={prPartyName}
                    onChange={(e) => setPrPartyName(e.target.value)}
                    placeholder="e.g. A TO Z Wholesale"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1 font-bold">Refund Method</label>
                  <select
                    value={prRefundMethod}
                    onChange={(e) => setPrRefundMethod(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                  >
                    <option value="DEBIT_NOTE">Supplier Debit Note (Adjust Payables)</option>
                    <option value="CASH">Cash Refund from Supplier</option>
                    <option value="UPI">Bank Refund</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-slate-700 font-bold block">Return Medicine Item</label>
                  {prItems.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Medicine Name</label>
                          <input
                            type="text"
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
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Batch Number</label>
                          <input
                            type="text"
                            value={item.batchNumber}
                            onChange={(e) => {
                              const copy = [...prItems];
                              copy[idx].batchNumber = e.target.value;
                              setPrItems(copy);
                            }}
                            placeholder="e.g. BATCH-456"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Return Quantity (Deducted from Stock)</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const copy = [...prItems];
                              copy[idx].quantity = parseFloat(e.target.value) || 1;
                              setPrItems(copy);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold">Purchase Rate (₹)</label>
                          <input
                            type="number"
                            step="any"
                            value={item.purchaseRate}
                            onChange={(e) => {
                              const copy = [...prItems];
                              copy[idx].purchaseRate = parseFloat(e.target.value) || 0;
                              setPrItems(copy);
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowPurchaseReturnModal(false)}
                    className="px-4 py-2 text-slate-600 bg-slate-100 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold shadow-md shadow-indigo-600/20"
                  >
                    Issue Debit Note
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
