'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import PurchasePrintModal from '@/components/invoice/PurchasePrintModal';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  Plus, 
  Printer, 
  Trash2, 
  X, 
  Edit2,
  Building2,
  Calendar,
  CreditCard,
  Package,
  Receipt,
  Eye,
  FileText
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function PurchasesPage() {
  const router = useRouter();
  const { purchases: cachedPurchases, parties: cachedParties, loading, refreshData } = useErpData();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<any>(null);

  useEffect(() => {
    setPurchases(cachedPurchases);
  }, [cachedPurchases]);

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

  const filteredPurchases = purchases.filter((p) => {
    const q = search.toLowerCase();
    const partyName = p.party?.name || '';
    return (
      (p.invoiceNumber || '').toLowerCase().includes(q) ||
      partyName.toLowerCase().includes(q)
    );
  });

  const getPaymentBadge = (p: any) => {
    const method = (p.paymentMethod || (p.isPaid ? 'CASH' : 'CREDIT')).toUpperCase();
    if (method === 'CASH') return { label: 'CASH', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
    if (method === 'UPI') return { label: 'UPI', cls: 'bg-indigo-100 text-indigo-800 border border-indigo-300' };
    return { label: 'CREDIT', cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-600" />
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Purchase Invoices</h1>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Supplier bills, inventory receipts & payable records ({filteredPurchases.length} total)
            </p>
          </div>
          <Link
            href="/purchases/new"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Entry</span>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="bg-white border border-slate-200/90 p-3 rounded-2xl shadow-xs mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purchase entry by invoice # or supplier name..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition"
            />
          </div>
        </div>

        {/* Table List */}
        {filteredPurchases.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            {loading ? 'Loading purchase bills...' : 'No purchase bills match your search query.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Purchase Date</th>
                    <th className="py-3.5 px-4">Supplier Party</th>
                    <th className="py-3.5 px-4">Payment Method</th>
                    <th className="py-3.5 px-4 text-right">Grand Total</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPurchases.map((p) => {
                    const badge = getPaymentBadge(p);
                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setInspectBill(p)}
                        className="hover:bg-emerald-50/50 transition cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 group-hover:text-emerald-700">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
                            <span>{p.invoiceNumber || p.id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-semibold">
                          {formatDate(p.purchaseDate || p.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-slate-900">
                          {p.party?.name || 'Supplier'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold shadow-2xs ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                          ₹{(p.grandTotal || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setInspectBill(p)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Inspect Full Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedPurchaseForPrint(p)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Print Purchase Memo"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => router.push(`/purchases/new?id=${p.id}`)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit Purchase Entry"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(p.id, e)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Purchase Entry"
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
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                      <Receipt className="w-5 h-5 text-emerald-600" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        Invoice: {inspectBill.invoiceNumber || inspectBill.id}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold">
                        Purchased on {formatDate(inspectBill.purchaseDate || inspectBill.createdAt)}
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

              {/* Info Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Supplier Party</span>
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mt-1">
                    {inspectBill.party?.name || 'Supplier'}
                  </div>
                  {inspectBill.party?.phone && (
                    <div className="text-xs text-slate-500 font-medium">📞 {inspectBill.party.phone}</div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Payment Method</span>
                  </div>
                  <div className="mt-1.5">
                    {(() => {
                      const b = getPaymentBadge(inspectBill);
                      return (
                        <span className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${b.cls}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl">
                  <div className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider">
                    Total Bill Value
                  </div>
                  <div className="font-mono font-extrabold text-slate-900 text-xl mt-1">
                    ₹{(inspectBill.grandTotal || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Itemized Purchased Medicines Table */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>Purchased Medicine Items ({inspectBill.items?.length || 0})</span>
                </h4>

                {inspectBill.items && inspectBill.items.length > 0 ? (
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Medicine Product</th>
                          <th className="py-2.5 px-3">Batch #</th>
                          <th className="py-2.5 px-3">Expiry</th>
                          <th className="py-2.5 px-3 text-right">P.Rate</th>
                          <th className="py-2.5 px-3 text-right">MRP</th>
                          <th className="py-2.5 px-3 text-center">Qty + Free</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {inspectBill.items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {item.product?.name || item.productName || 'Medicine Item'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-600">
                              {item.batchNumber || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-semibold">
                              {item.expiryDate ? formatDate(item.expiryDate) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                              ₹{(item.purchaseRate || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              ₹{(item.mrp || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                              {item.quantity || 0} {item.freeQuantity ? `+ ${item.freeQuantity}` : ''}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                              ₹{(item.totalAmount || (item.quantity * item.purchaseRate) || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400 font-medium">
                    No itemized product details attached to this bill summary.
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setSelectedPurchaseForPrint(inspectBill)}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Memo</span>
                </button>
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

      {/* Purchase Print Modal */}
      {selectedPurchaseForPrint && (
        <PurchasePrintModal purchase={selectedPurchaseForPrint} onClose={() => setSelectedPurchaseForPrint(null)} />
      )}

      <BottomNav />
    </div>
  );
}
