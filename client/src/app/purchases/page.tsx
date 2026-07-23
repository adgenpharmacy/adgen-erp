'use client';

import { useState, useEffect } from 'react';
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
  Edit2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const [pRes, partyRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/parties')
      ]);
      setPurchases(pRes.data);
      setParties(partyRes.data);
    } catch (e) {
      console.error('Failed to fetch purchases:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const handleDeleteBill = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase bill? Inventory stock will be adjusted.')) return;
    try {
      await api.delete(`/purchases/${id}`);
      setInspectBill(null);
      fetchPurchases();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete purchase bill');
    }
  };

  const openEditModal = (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/purchases/new?id=${p.id}`);
  };

  const filtered = purchases.filter((p) => {
    const term = search.toLowerCase();
    const invNum = (p.invoiceNumber || '').toString().toLowerCase();
    const partyName = (p.party?.name || '').toLowerCase();
    return invNum.includes(term) || partyName.includes(term);
  });

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Purchases</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} purchase bills</p>
            </div>
            <Link
              href="/purchases/new"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Purchase
            </Link>
          </div>

          {/* Search */}
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by invoice # or supplier name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No purchase bills found.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Status</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setInspectBill(p)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono font-semibold text-gray-900">{p.invoiceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{p.party?.name || 'Supplier'}</div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-500">{formatDate(p.purchaseDate || p.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          p.isPaid 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {p.isPaid ? 'Paid' : 'Credit'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold font-mono text-gray-900">₹{p.grandTotal?.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={(e) => openEditModal(p, e)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-gray-100 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inspector Drawer */}
        <AnimatePresence>
          {inspectBill && (
            <div className="fixed inset-0 z-50 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setInspectBill(null)}
                className="absolute inset-0 bg-black/20"
              />

              <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="w-screen max-w-lg bg-white border-l border-gray-200 flex flex-col overflow-y-auto"
                >
                  {/* Drawer Header */}
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                      <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Purchase Bill</div>
                      <h2 className="text-lg font-bold text-gray-900 font-mono">{inspectBill.invoiceNumber}</h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setSelectedPurchaseForPrint(inspectBill); setInspectBill(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      <button
                        onClick={() => handleDeleteBill(inspectBill.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setInspectBill(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-6 space-y-6 flex-1">
                    {/* Meta */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Supplier</div>
                        <div className="text-sm font-medium text-gray-900">{inspectBill.party?.name || 'Unknown'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Date</div>
                        <div className="text-sm text-gray-900">{formatDate(inspectBill.purchaseDate || inspectBill.createdAt)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Status</div>
                        <div className={`text-sm font-medium ${inspectBill.isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {inspectBill.isPaid ? 'Paid' : 'Credit'}
                        </div>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase">Item</th>
                            <th className="py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase">Batch</th>
                            <th className="py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase text-right">Qty</th>
                            <th className="py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase text-right">Rate</th>
                            <th className="py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {inspectBill.items?.map((item: any, idx: number) => {
                            const rawBatch = item.batchNumber || '—';
                            const cleanBatch = rawBatch.replace(/\(.*\)/g, '').trim();
                            return (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="py-2 px-3 font-medium text-gray-900">{item.productName || item.product?.name}</td>
                                <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">{cleanBatch}</td>
                                <td className="py-2 px-3 text-right font-mono font-medium text-gray-900">{item.quantity}</td>
                                <td className="py-2 px-3 text-right font-mono text-gray-600">₹{item.purchaseRate?.toFixed(2) || item.unitPrice?.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900">₹{(item.quantity * (item.purchaseRate || item.unitPrice)).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span className="font-mono font-medium text-gray-900">₹{(inspectBill.subtotal || inspectBill.grandTotal || 0).toFixed(2)}</span>
                      </div>
                      {inspectBill.taxTotal > 0 && (
                        <div className="flex justify-between text-gray-500">
                          <span>GST</span>
                          <span className="font-mono font-medium text-gray-900">₹{inspectBill.taxTotal.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-bold text-gray-900">
                        <span>Total</span>
                        <span className="font-mono">₹{(inspectBill.grandTotal || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Purchase Print Modal */}
        {selectedPurchaseForPrint && (
          <PurchasePrintModal purchase={selectedPurchaseForPrint} onClose={() => setSelectedPurchaseForPrint(null)} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
