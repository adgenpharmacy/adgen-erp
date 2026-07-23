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
  Edit2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PurchasesPage() {
  const router = useRouter();
  const { purchases: cachedPurchases, parties: cachedParties, loading, refreshData } = useErpData();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<any>(null);

  useEffect(() => {
    setPurchases(cachedPurchases);
    setParties(cachedParties);
  }, [cachedPurchases, cachedParties]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase bill?')) return;
    try {
      await api.delete(`/purchases/${id}`);
      await refreshData();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to delete purchase bill');
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

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Purchase Entry Bills</h1>
            <p className="text-xs text-slate-500 mt-0.5">{filteredPurchases.length} total purchase bills</p>
          </div>
          <Link
            href="/purchases/new"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase</span>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice # or supplier name..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Table / Cards */}
        {filteredPurchases.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Loading purchase bills...' : 'No purchase bills found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Supplier Party</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4 text-right">Grand Total</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredPurchases.map((p) => (
                    <tr key={p.id} className="hover:bg-emerald-50/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setInspectBill(p)}
                          className="hover:text-emerald-600 hover:underline"
                        >
                          {p.invoiceNumber || p.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {formatDate(p.purchaseDate || p.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {p.party?.name || 'Supplier'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          p.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.isPaid ? 'CASH' : 'CREDIT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900">
                        ₹{(p.grandTotal || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedPurchaseForPrint(p)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Print Purchase Memo"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/purchases/new?id=${p.id}`)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Purchase Entry"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Purchase Entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Inspect Purchase Modal */}
      {inspectBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Purchase Bill: {inspectBill.invoiceNumber}</h3>
              <button onClick={() => setInspectBill(null)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div><span className="font-bold text-slate-700">Supplier:</span> {inspectBill.party?.name || 'Supplier'}</div>
              <div><span className="font-bold text-slate-700">Date:</span> {formatDate(inspectBill.purchaseDate || inspectBill.createdAt)}</div>
              <div><span className="font-bold text-slate-700">Grand Total:</span> <span className="font-mono font-bold text-emerald-600">₹{(inspectBill.grandTotal || 0).toFixed(2)}</span></div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setInspectBill(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Print Modal */}
      {selectedPurchaseForPrint && (
        <PurchasePrintModal purchase={selectedPurchaseForPrint} onClose={() => setSelectedPurchaseForPrint(null)} />
      )}

      <BottomNav />
    </div>
  );
}
