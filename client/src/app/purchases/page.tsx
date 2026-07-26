'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import PurchasePrintModal from '@/components/invoice/PurchasePrintModal';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  Plus, 
  Printer, 
  Trash2, 
  X, 
  Eye, 
  FileText, 
  RefreshCw,
  Building2,
  Package,
  ShoppingBag,
  Edit3
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function PurchasesPage() {
  const router = useRouter();
  const { purchases: cachedPurchases, parties: cachedParties, loading, refreshData } = useErpData();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<any>(null);

  useEffect(() => {
    setIsMounted(true);
    setPurchases(cachedPurchases);
  }, [cachedPurchases]);

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this purchase bill?')) return;
    try {
      await api.delete(`/purchases/${id}`);
      await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete purchase bill');
    }
  };

  // Header KPI Statistics
  const stats = useMemo(() => {
    let totalProcurement = 0;
    let paidTotal = 0;
    let pendingCredit = 0;
    let paidCount = 0;
    let creditCount = 0;

    purchases.forEach((p) => {
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
      totalBills: purchases.length,
      totalProcurement,
      paidTotal,
      pendingCredit,
      paidCount,
      creditCount,
    };
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter((p) => {
        const q = search.toLowerCase();
        const partyName = p.party?.name || '';
        const matchesSearch =
          (p.invoiceNumber || '').toLowerCase().includes(q) ||
          partyName.toLowerCase().includes(q);

        if (!matchesSearch) return false;

        if (statusFilter === 'PAID') return p.isPaid;
        if (statusFilter === 'CREDIT') return !p.isPaid;

        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.purchaseDate || a.createdAt).getTime();
        const dateB = new Date(b.purchaseDate || b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [purchases, search, statusFilter]);

  const getPaymentBadge = (p: any) => {
    const isPaid = p.isPaid;
    if (isPaid) return { label: '🟢 PAID', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    return { label: '🟡 CREDIT (UNPAID)', cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
  };

  return (
    <div className="flex bg-[#F8FAFC] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6 overflow-y-auto max-w-[1600px] mx-auto w-full space-y-4">
        {/* COMPACT PAGE HEADER & SUMMARY KPI STRIP */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Supplier Purchase Bills</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600">
                {stats.totalBills} Bills Received
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 mt-1.5">
              <span className="flex items-center gap-1 text-slate-900 font-extrabold">
                <span className="text-slate-400 font-normal">Procurement:</span>
                <span className="font-mono text-slate-900">₹{(stats.totalProcurement / 100000).toFixed(2)}L</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 font-extrabold">Paid: ₹{stats.paidTotal.toFixed(0)} ({stats.paidCount})</span>
              <span className="text-slate-300">•</span>
              <span className="text-amber-700 font-extrabold">Pending Credit: ₹{stats.pendingCredit.toFixed(0)} ({stats.creditCount})</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs"
              title="Refresh Purchases"
            >
              <RefreshCw className={`w-4 h-4 ${isMounted && loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            <Link
              href="/purchases/new"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Purchase Entry</span>
            </Link>
          </div>
        </div>

        {/* SEARCH BAR & SEGMENTED STATUS FILTER BUTTONS */}
        <div className="bg-white border border-slate-200/80 p-2.5 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purchase entry by invoice # or supplier name..."
              className="w-full bg-slate-50 border border-slate-200/90 rounded-xl pl-10 pr-4 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-600 transition"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Purchases' },
              { id: 'PAID', label: 'Paid' },
              { id: 'CREDIT', label: 'Pending Credit' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* HIGH-DENSITY LINEAR PURCHASES TABLE */}
        {!isMounted || loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : filteredPurchases.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            No purchase bills match your search query.
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-3">Purchase Date</th>
                    <th className="py-2.5 px-3">Supplier Party</th>
                    <th className="py-2.5 px-3">Payment Status</th>
                    <th className="py-2.5 px-3 text-right">Bill Total (₹)</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPurchases.map((p) => {
                    const badge = getPaymentBadge(p);
                    const stripeClass = p.isPaid ? 'stripe-emerald' : 'stripe-amber';

                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setInspectBill(p)}
                        className={`linear-row ${stripeClass} group cursor-pointer`}
                      >
                        <td className="py-2 px-4 font-mono font-normal text-slate-400 text-xs">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition" />
                            <span>{p.invoiceNumber || p.id.slice(0, 8)}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-slate-500 font-semibold">
                          {formatDate(p.purchaseDate || p.createdAt)}
                        </td>

                        <td className="py-2 px-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{toTitleCase(p.party?.name || 'Supplier Party')}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3">
                          <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900 text-[15px]">
                          ₹{(p.grandTotal || 0).toFixed(2)}
                        </td>

                        <td className="py-2 px-4 text-right">
                          <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/purchases/new?id=${p.id}`)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                              title="Edit Purchase Bill"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setInspectBill(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
                              title="Inspect Bill Items"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedPurchaseForPrint(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
                              title="Print Purchase Bill"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(p.id, e)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Purchase Bill"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* INSPECT PURCHASE DETAILS MODAL */}
      <AnimatePresence>
        {inspectBill && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white border border-slate-200/90 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-indigo-50 rounded-xl border border-indigo-200">
                      <ShoppingBag className="w-5 h-5 text-indigo-600" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        Purchase Invoice #{inspectBill.invoiceNumber || inspectBill.id.slice(0, 8)}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold">
                        Received on {formatDate(inspectBill.purchaseDate || inspectBill.createdAt)} • Supplier: {inspectBill.party?.name}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setInspectBill(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Supplier Party</div>
                  <div className="font-extrabold text-slate-900 mt-1">
                    {toTitleCase(inspectBill.party?.name || 'Supplier')}
                  </div>
                  {inspectBill.party?.phone && (
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">📞 {inspectBill.party.phone}</div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">GSTIN / DL Number</div>
                  <div className="font-mono font-extrabold text-slate-900 mt-1">
                    {inspectBill.party?.gstNumber || inspectBill.party?.gstin || inspectBill.party?.dlNumber || '—'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Payment Status</div>
                  <div className="font-extrabold text-slate-900 mt-1">{inspectBill.isPaid ? 'PAID' : 'CREDIT (UNPAID)'}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Taxable Subtotal</div>
                  <div className="font-mono font-bold text-slate-900 mt-1">
                    ₹{(inspectBill.subtotal || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Input GST Tax</div>
                  <div className="font-mono font-bold text-indigo-600 mt-1">
                    ₹{(inspectBill.taxTotal || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Grand Total</div>
                  <div className="font-mono font-extrabold text-indigo-700 text-sm mt-1">
                    ₹{(inspectBill.grandTotal || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {inspectBill.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Purchase Entry Notes / Remarks:</span>
                  <span className="font-medium text-slate-800">{inspectBill.notes}</span>
                </div>
              )}

              {/* Items List */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Received Inventory Items & Batches</h4>
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase">
                        <th className="py-2.5 px-3">Medicine Item</th>
                        <th className="py-2.5 px-3">Batch #</th>
                        <th className="py-2.5 px-3">Expiry</th>
                        <th className="py-2.5 px-3 text-center">Qty Rec. (Free)</th>
                        <th className="py-2.5 px-3 text-right">P. Rate</th>
                        <th className="py-2.5 px-3 text-right">MRP</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {(inspectBill.items || []).map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {toTitleCase(item.product?.name || item.productName || 'Medicine')}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {item.batchNumber || item.batch?.batchNumber || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {formatDate(item.expiryDate || item.batch?.expiryDate)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold font-mono text-indigo-700">
                            {item.quantity} {item.freeQuantity ? `(+${item.freeQuantity} free)` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            ₹{(item.purchaseRate || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            ₹{(item.mrp || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-indigo-800">
                            ₹{(item.totalAmount || (item.quantity * item.purchaseRate) || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      router.push(`/purchases/new?id=${inspectBill.id}`);
                      setInspectBill(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Purchase Entry
                  </button>
                  <button
                    onClick={() => setSelectedPurchaseForPrint(inspectBill)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                  >
                    <Printer className="w-4 h-4" /> Print Purchase Memo
                  </button>
                </div>
                <button
                  onClick={() => setInspectBill(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT PURCHASE DETAILS MODAL */}
      <AnimatePresence>
        {editingPurchase && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Edit Purchase Bill</h3>
                <button onClick={() => setEditingPurchase(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-slate-500 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={editingPurchase.invoiceNumber || ''}
                    onChange={(e) => setEditingPurchase({ ...editingPurchase, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Grand Total (₹)</label>
                  <input
                    type="number"
                    value={editingPurchase.grandTotal || 0}
                    onChange={(e) => setEditingPurchase({ ...editingPurchase, grandTotal: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Payment Status</label>
                  <select
                    value={editingPurchase.isPaid ? 'PAID' : 'CREDIT'}
                    onChange={(e) => setEditingPurchase({ ...editingPurchase, isPaid: e.target.value === 'PAID' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="PAID">🟢 PAID (Cash/Bank)</option>
                    <option value="CREDIT">🟡 CREDIT (Unpaid)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Notes / Remarks</label>
                  <textarea
                    rows={2}
                    value={editingPurchase.notes || ''}
                    onChange={(e) => setEditingPurchase({ ...editingPurchase, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setEditingPurchase(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/purchases/${editingPurchase.id}`, {
                        invoiceNumber: editingPurchase.invoiceNumber,
                        grandTotal: editingPurchase.grandTotal,
                        isPaid: editingPurchase.isPaid,
                        notes: editingPurchase.notes,
                      });
                      setEditingPurchase(null);
                      refreshData();
                    } catch (err) {
                      alert('Failed to update purchase bill');
                    }
                  }}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {selectedPurchaseForPrint && (
        <PurchasePrintModal purchase={selectedPurchaseForPrint} onClose={() => setSelectedPurchaseForPrint(null)} />
      )}

      <BottomNav />
    </div>
  );
}
