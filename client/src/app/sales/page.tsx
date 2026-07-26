'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import InvoicePrintModal from '@/components/invoice/InvoicePrintModal';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  Plus, 
  Printer, 
  Trash2, 
  X, 
  Receipt, 
  Eye, 
  FileText, 
  RefreshCw,
  Phone,
  User,
  CreditCard,
  Edit3
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function SalesPage() {
  const router = useRouter();
  const { sales: cachedSales, customers: cachedCustomers, loading, refreshData } = useErpData();
  const [sales, setSales] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<any>(null);

  useEffect(() => {
    setIsMounted(true);
    setSales(cachedSales);
  }, [cachedSales]);

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this sales bill?')) return;
    try {
      await api.delete(`/sales/${id}`);
      await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete sale');
    }
  };

  // Header KPI Statistics
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let cashTotal = 0;
    let upiTotal = 0;
    let creditTotal = 0;

    sales.forEach((s) => {
      const total = s.grandTotal || 0;
      totalRevenue += total;
      const m = (s.paymentMethod || 'CASH').toUpperCase();
      if (m === 'CASH') cashTotal += total;
      else if (m === 'UPI') upiTotal += total;
      else if (m === 'CREDIT') creditTotal += total;
      else if (m === 'SPLIT') {
        cashTotal += (s.cashAmount || 0);
        upiTotal += (s.upiAmount || 0);
        creditTotal += (s.creditAmount || 0);
      }
    });

    return {
      totalInvoices: sales.length,
      totalRevenue,
      cashTotal,
      upiTotal,
      creditTotal,
    };
  }, [sales]);

  const filteredSales = useMemo(() => {
    return sales
      .filter((s) => {
        const q = search.toLowerCase();
        const matchesSearch =
          (s.invoiceNumber || '').toLowerCase().includes(q) ||
          (s.customerName || s.customer?.name || '').toLowerCase().includes(q) ||
          (s.customerPhone || s.customer?.phone || '').includes(q);

        const m = (s.paymentMethod || 'CASH').toUpperCase();
        const matchesMethod = methodFilter === 'ALL' || m === methodFilter;

        return matchesSearch && matchesMethod;
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.saleDate).getTime();
        const dateB = new Date(b.createdAt || b.saleDate).getTime();
        return dateB - dateA;
      });
  }, [sales, search, methodFilter]);

  const getPaymentBadge = (method?: string) => {
    const m = (method || 'CASH').toUpperCase();
    if (m === 'UPI') return { label: '🔵 UPI', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
    if (m === 'CREDIT') return { label: '🟡 CREDIT', cls: 'bg-amber-50 text-amber-700 border border-amber-200' };
    if (m === 'CARD') return { label: '💳 CARD', cls: 'bg-blue-50 text-blue-700 border border-blue-200' };
    if (m === 'SPLIT') return { label: '🟣 SPLIT', cls: 'bg-purple-50 text-purple-700 border border-purple-200' };
    return { label: '🟢 CASH', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  };

  return (
    <div className="flex bg-[#F8FAFC] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6 overflow-y-auto max-w-[1600px] mx-auto w-full space-y-4">
        {/* COMPACT PAGE HEADER & SUMMARY KPI STRIP */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sales Invoices & Counter POS Memos</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600">
                {stats.totalInvoices} Bills Issued
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 mt-1.5">
              <span className="flex items-center gap-1 text-slate-900 font-extrabold">
                <span className="text-slate-400 font-normal">Gross Sales:</span>
                <span className="font-mono text-emerald-700">₹{(stats.totalRevenue / 100000).toFixed(2)}L</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-700 font-extrabold">Cash: ₹{stats.cashTotal.toFixed(0)}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-700 font-extrabold">UPI: ₹{stats.upiTotal.toFixed(0)}</span>
              <span className="text-slate-300">•</span>
              <span className="text-amber-700 font-extrabold">Credit Unpaid: ₹{stats.creditTotal.toFixed(0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs"
              title="Refresh Sales"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            <Link
              href="/billing"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Sale (POS)</span>
            </Link>
          </div>
        </div>

        {/* SEARCH BAR & SEGMENTED PAYMENT FILTER BUTTONS */}
        <div className="bg-white border border-slate-200/80 p-2.5 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sales invoice by Invoice #, Customer Name, or Phone..."
              className="w-full bg-slate-50 border border-slate-200/90 rounded-xl pl-10 pr-4 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600 transition"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Invoices' },
              { id: 'CASH', label: 'Cash' },
              { id: 'UPI', label: 'UPI' },
              { id: 'SPLIT', label: 'Split' },
              { id: 'CREDIT', label: 'Credit (Unpaid)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMethodFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition whitespace-nowrap ${
                  methodFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* HIGH-DENSITY LINEAR SALES TABLE */}
        {!isMounted || loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : filteredSales.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            No sales bills match your search query.
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-3">Sale Date</th>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3">Payment Method</th>
                    <th className="py-2.5 px-3 text-right">Grand Total (₹)</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredSales.map((s) => {
                    const badge = getPaymentBadge(s.paymentMethod);
                    const isCredit = (s.paymentMethod || '').toUpperCase() === 'CREDIT';
                    const stripeClass = isCredit ? 'stripe-yellow' : 'stripe-emerald';

                    return (
                      <tr 
                        key={s.id} 
                        onClick={() => setInspectBill(s)}
                        className={`linear-row ${stripeClass} group cursor-pointer`}
                      >
                        <td className="py-2 px-4 font-mono font-normal text-slate-400 text-xs">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition" />
                            <span>INV-{s.invoiceNumber || s.id.slice(0, 8)}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-slate-500 font-semibold">
                          {formatDate(s.saleDate || s.createdAt)}
                        </td>

                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">
                            {toTitleCase(s.customerName || s.customer?.name || 'Walk-in Customer')}
                          </div>
                          {(s.customerPhone || s.customer?.phone) && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              📞 {s.customerPhone || s.customer?.phone}
                            </div>
                          )}
                        </td>

                        <td className="py-2 px-3">
                          <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-black text-emerald-800 text-[15px]">
                          ₹{(s.grandTotal || 0).toFixed(2)}
                        </td>

                        <td className="py-2 px-4 text-right">
                          <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/billing?id=${s.id}`)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                              title="Edit Sales Bill (POS View)"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setInspectBill(s)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                              title="Inspect Full Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSelectedInvoiceForPrint(s)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                              title="Print Sales Memo"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(s.id, e)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Sales Bill"
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

      {/* INSPECT SALES DETAILS MODAL */}
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
                    <span className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                      <Receipt className="w-5 h-5 text-emerald-600" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        Sales Invoice #{inspectBill.invoiceNumber || inspectBill.id.slice(0, 8)}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold">
                        Issued on {formatDate(inspectBill.saleDate || inspectBill.createdAt)} • Mode: {inspectBill.paymentMethod}
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
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Customer Name</div>
                  <div className="font-extrabold text-slate-900 mt-1">
                    {toTitleCase(inspectBill.customerName || inspectBill.customer?.name || 'Walk-in Customer')}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Customer Phone</div>
                  <div className="font-mono font-extrabold text-slate-900 mt-1">
                    {inspectBill.customerPhone || inspectBill.customer?.phone || '—'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Prescribed Doctor</div>
                  <div className="font-bold text-slate-900 mt-1">
                    {inspectBill.doctorName ? `Dr. ${inspectBill.doctorName}` : '—'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Payment Mode</div>
                  <div className="font-extrabold text-slate-900 mt-1">{inspectBill.paymentMethod}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Subtotal (Excl. Tax)</div>
                  <div className="font-mono font-bold text-slate-900 mt-1">
                    ₹{(inspectBill.subtotal || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">GST Tax Collected</div>
                  <div className="font-mono font-bold text-indigo-600 mt-1">
                    ₹{(inspectBill.taxTotal || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Discount Allowed</div>
                  <div className="font-mono font-bold text-rose-600 mt-1">
                    -₹{(inspectBill.discount || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Grand Total</div>
                  <div className="font-mono font-extrabold text-emerald-700 text-sm mt-1">
                    ₹{(inspectBill.grandTotal || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {inspectBill.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Billing Notes / Remarks:</span>
                  <span className="font-medium text-slate-800">{inspectBill.notes}</span>
                </div>
              )}

              {/* Items List */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Itemized Medicines Sold</h4>
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase">
                        <th className="py-2.5 px-3">Medicine Name</th>
                        <th className="py-2.5 px-3">Batch Number</th>
                        <th className="py-2.5 px-3">Expiry</th>
                        <th className="py-2.5 px-3 text-center">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Unit MRP</th>
                        <th className="py-2.5 px-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {(inspectBill.items || []).map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {toTitleCase(item.product?.name || item.productName || 'Medicine')}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {item.batch?.batchNumber || item.batchNumber || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {item.batch?.expiryDate || item.expiryDate ? formatDate(item.batch?.expiryDate || item.expiryDate) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold font-mono">
                            {item.quantity} Units
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            ₹{(item.unitPrice || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            ₹{((item.quantity || 1) * (item.unitPrice || 0)).toFixed(2)}
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
                      router.push(`/billing?id=${inspectBill.id}`);
                      setInspectBill(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Sales Bill (POS View)
                  </button>
                  <button
                    onClick={() => setSelectedInvoiceForPrint(inspectBill)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Printer className="w-4 h-4" /> Print Tax Memo
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

      {/* EDIT SALES DETAILS MODAL */}
      <AnimatePresence>
        {editingSale && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Edit Sales Bill</h3>
                <button onClick={() => setEditingSale(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs font-semibold text-slate-700">
                <div>
                  <label className="block text-slate-500 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={editingSale.customerName || ''}
                    onChange={(e) => setEditingSale({ ...editingSale, customerName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Customer Phone</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={editingSale.customerPhone || ''}
                    onChange={(e) => setEditingSale({ ...editingSale, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Doctor Name</label>
                  <input
                    type="text"
                    value={editingSale.doctorName || ''}
                    onChange={(e) => setEditingSale({ ...editingSale, doctorName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Payment Method</label>
                  <select
                    value={editingSale.paymentMethod || 'CASH'}
                    onChange={(e) => setEditingSale({ ...editingSale, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="CASH">💵 Cash</option>
                    <option value="UPI">📱 UPI Digital</option>
                    <option value="CARD">💳 Card</option>
                    <option value="SPLIT">🔀 Split (Cash + UPI)</option>
                    <option value="CREDIT">🟡 Credit (Unpaid)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Grand Total (₹)</label>
                  <input
                    type="number"
                    value={editingSale.grandTotal || 0}
                    onChange={(e) => setEditingSale({ ...editingSale, grandTotal: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Notes / Remarks</label>
                  <textarea
                    rows={2}
                    value={editingSale.notes || ''}
                    onChange={(e) => setEditingSale({ ...editingSale, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setEditingSale(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/sales/${editingSale.id}`, {
                        customerName: editingSale.customerName,
                        customerPhone: editingSale.customerPhone,
                        doctorName: editingSale.doctorName,
                        paymentMethod: editingSale.paymentMethod,
                        grandTotal: editingSale.grandTotal,
                        notes: editingSale.notes,
                      });
                      setEditingSale(null);
                      refreshData();
                    } catch (err) {
                      alert('Failed to update sales bill');
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

      {selectedInvoiceForPrint && (
        <InvoicePrintModal invoice={selectedInvoiceForPrint} onClose={() => setSelectedInvoiceForPrint(null)} />
      )}

      <BottomNav />
    </div>
  );
}
