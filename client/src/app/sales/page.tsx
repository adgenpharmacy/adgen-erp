'use client';

import { useState, useEffect } from 'react';
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
  const [sales, setSales] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [inspectBill, setInspectBill] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ customerId: '', paymentMethod: 'CASH' });
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const [sRes, cRes] = await Promise.all([
        api.get('/sales'),
        api.get('/customers')
      ]);
      setSales(sRes.data);
      setCustomers(cRes.data);
    } catch (e) {
      console.error('Failed to fetch sales bills:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleDeleteSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sales invoice? Item stock will be automatically restored.')) return;
    try {
      await api.delete(`/sales/${id}`);
      setInspectBill(null);
      fetchSales();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete sale invoice');
    }
  };

  const openEditModal = (s: any, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/billing?id=${s.id}`);
  };

  const handleUpdateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    try {
      await api.put(`/sales/${editingSale.id}`, editFormData);
      setEditingSale(null);
      fetchSales();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update sale invoice');
    }
  };

  const filtered = sales.filter((s) => {
    const term = search.toLowerCase();
    const invNum = (s.invoiceNumber || '').toString().toLowerCase();
    const custName = (s.customerName || s.customer?.name || '').toLowerCase();
    const custPhone = (s.customerPhone || s.customer?.phone || '').toLowerCase();
    return invNum.includes(term) || custName.includes(term) || custPhone.includes(term);
  });

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Sales</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} invoices</p>
            </div>
            <Link
              href="/billing"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Sale
            </Link>
          </div>

          {/* Search */}
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by invoice #, customer name, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {/* Sales Table */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No sales invoices found.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Payment</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((s) => {
                    const displayName = s.customer?.name || s.customerName || 'Walk-in';
                    const displayPhone = s.customer?.phone || s.customerPhone || '';
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setInspectBill(s)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono font-semibold text-gray-900">#{s.invoiceNumber}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{displayName}</div>
                          {displayPhone && (
                            <div className="text-[11px] text-gray-400 font-mono mt-0.5">{displayPhone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-gray-500">{formatDate(s.saleDate || s.createdAt)}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{s.paymentMethod}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold font-mono text-gray-900">₹{s.grandTotal?.toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={(e) => openEditModal(s, e)}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-gray-100 transition"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Sale Modal */}
        {editingSale && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-gray-200 p-6 rounded-lg max-w-md w-full shadow-lg space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Edit Invoice #{editingSale.invoiceNumber}</h2>
              <form onSubmit={handleUpdateSale} className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Customer</label>
                  <select
                    value={editFormData.customerId}
                    onChange={(e) => setEditFormData({ ...editFormData, customerId: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Walk-in Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No Phone'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Payment Method</label>
                  <select
                    value={editFormData.paymentMethod}
                    onChange={(e) => setEditFormData({ ...editFormData, paymentMethod: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI / Online</option>
                    <option value="CARD">Card</option>
                    <option value="CREDIT">Credit Ledger</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditingSale(null)}
                    className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm"
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
                      <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Sales Invoice</div>
                      <h2 className="text-lg font-bold text-gray-900 font-mono">#{inspectBill.invoiceNumber}</h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setSelectedInvoiceForPrint(inspectBill); setInspectBill(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print
                      </button>
                      <button
                        onClick={() => handleDeleteSale(inspectBill.id)}
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

                  {/* Invoice Details */}
                  <div className="p-6 space-y-6 flex-1">
                    {/* Meta */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Customer</div>
                        <div className="text-sm font-medium text-gray-900">{inspectBill.customerName || inspectBill.customer?.name || 'Walk-in'}</div>
                        {(inspectBill.customerPhone || inspectBill.customer?.phone) && (
                          <div className="text-xs text-gray-500 font-mono mt-0.5">{inspectBill.customerPhone || inspectBill.customer?.phone}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Date</div>
                        <div className="text-sm text-gray-900">{formatDate(inspectBill.saleDate || inspectBill.createdAt)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1">Payment</div>
                        <div className="text-sm font-medium text-gray-900">{inspectBill.paymentMethod}</div>
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
                            const totalUnits = item.quantity || 1;
                            return (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="py-2 px-3 font-medium text-gray-900">{item.productName || item.product?.name}</td>
                                <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">{item.batch?.batchNumber || item.batchNumber || '—'}</td>
                                <td className="py-2 px-3 text-right font-mono font-medium text-gray-900">{totalUnits}</td>
                                <td className="py-2 px-3 text-right font-mono text-gray-600">₹{item.unitPrice?.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-gray-900">₹{(totalUnits * item.unitPrice).toFixed(2)}</td>
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
                      {inspectBill.discount > 0 && (
                        <div className="flex justify-between text-gray-500">
                          <span>Discount</span>
                          <span className="font-mono font-medium text-red-600">−₹{inspectBill.discount.toFixed(2)}</span>
                        </div>
                      )}
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

        {/* Invoice Print Modal */}
        {selectedInvoiceForPrint && (
          <InvoicePrintModal invoice={selectedInvoiceForPrint} onClose={() => setSelectedInvoiceForPrint(null)} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
