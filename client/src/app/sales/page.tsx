'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import InvoicePrintModal from '@/components/invoice/InvoicePrintModal';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  Plus, 
  Printer, 
  Trash2, 
  Edit2,
  X,
  Phone
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function SalesPage() {
  const router = useRouter();
  const { sales: cachedSales, customers: cachedCustomers, loading, refreshData } = useErpData();
  const [sales, setSales] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ customerId: '', paymentMethod: 'CASH' });
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<any>(null);

  useEffect(() => {
    setSales(cachedSales);
    setCustomers(cachedCustomers);
  }, [cachedSales, cachedCustomers]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sales bill?')) return;
    try {
      await api.delete(`/sales/${id}`);
      await refreshData();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to delete sale');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    try {
      await api.put(`/sales/${editingSale.id}`, editFormData);
      setEditingSale(null);
      await refreshData();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to update sale');
    }
  };

  const filteredSales = sales.filter((s) => {
    const q = search.toLowerCase();
    return (
      (s.invoiceNumber || '').toLowerCase().includes(q) ||
      (s.customerName || '').toLowerCase().includes(q) ||
      (s.customerPhone || '').includes(q)
    );
  });

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales Invoices</h1>
            <p className="text-xs text-slate-500 mt-0.5">{filteredSales.length} total bills generated</p>
          </div>
          <Link
            href="/billing"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Sale (POS)</span>
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
              placeholder="Search by Invoice #, Customer Name, or Phone..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Sales Table / Cards */}
        {filteredSales.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Loading sales invoices...' : 'No sales bills found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4 text-right">Grand Total</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-emerald-50/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setInspectBill(s)}
                          className="hover:text-emerald-600 hover:underline"
                        >
                          INV-{s.invoiceNumber || s.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {formatDate(s.saleDate || s.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {s.customerName || s.customer?.name || 'Walk-in Customer'}
                        {s.customerPhone && (
                          <div className="text-[10px] text-slate-400 font-mono font-normal">{s.customerPhone}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          s.paymentMethod === 'UPI' ? 'bg-purple-100 text-purple-700' :
                          s.paymentMethod === 'CARD' ? 'bg-blue-100 text-blue-700' :
                          s.paymentMethod === 'CREDIT' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {s.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900">
                        ₹{(s.grandTotal || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedInvoiceForPrint(s)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Print Invoice"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/billing?id=${s.id}`)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Invoice"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Invoice"
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

      {/* Inspect Bill Modal */}
      {inspectBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Invoice Details: INV-{inspectBill.invoiceNumber || inspectBill.id.slice(0, 8)}</h3>
              <button onClick={() => setInspectBill(null)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div><span className="font-bold text-slate-700">Customer:</span> {inspectBill.customerName || 'Walk-in Customer'}</div>
              <div><span className="font-bold text-slate-700">Payment:</span> {inspectBill.paymentMethod}</div>
              <div><span className="font-bold text-slate-700">Grand Total:</span> <span className="font-mono font-bold text-emerald-600">₹{(inspectBill.grandTotal || 0).toFixed(2)}</span></div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setInspectBill(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {selectedInvoiceForPrint && (
        <InvoicePrintModal bill={selectedInvoiceForPrint} onClose={() => setSelectedInvoiceForPrint(null)} />
      )}

      <BottomNav />
    </div>
  );
}
