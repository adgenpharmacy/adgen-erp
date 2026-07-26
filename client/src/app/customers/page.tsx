'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { Search, Plus, Edit2, X } from 'lucide-react';

export default function CustomersPage() {
  const { customers: cachedCustomers, loading, refreshData } = useErpData();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', doctorName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCustomers(cachedCustomers);
  }, [cachedCustomers]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', email: '', address: '', gstNumber: '', doctorName: '' });
    setShowAddModal(true);
  };

  const openEditModal = (cust: any) => {
    setEditingCustomer(cust);
    setFormData({ name: cust.name || '', phone: cust.phone || '', email: cust.email || '', address: cust.address || '', gstNumber: cust.gstNumber || '', doctorName: cust.doctorName || '' });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
      } else {
        await api.post('/customers', formData);
      }
      setShowAddModal(false);
      await refreshData();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.doctorName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Directory</h1>
            <p className="text-xs text-slate-500 mt-0.5">{filteredCustomers.length} registered customer accounts</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Customer Name, Phone, or Doctor..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Loading customers...' : 'No customers found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Customer Name</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Doctor</th>
                    <th className="py-3.5 px-4">Address</th>
                    <th className="py-3.5 px-4">GSTIN / Email</th>
                    <th className="py-3.5 px-4 text-right">Outstanding Credit</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-emerald-50/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3.5 px-4 font-mono">{c.phone || '—'}</td>
                      <td className="py-3.5 px-4">{c.doctorName || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-500 truncate max-w-[180px]">{c.address || '—'}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {c.gstNumber || c.email || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-amber-700">
                        ₹{(c.creditBalance || c.outstandingBalance || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit Customer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    placeholder="9826012345"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="customer@email.com"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Prescribed Doctor</label>
                  <input
                    type="text"
                    value={formData.doctorName}
                    onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                    placeholder="Dr. Verma"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                    placeholder="27ABCDE1234F1Z5"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street, City, Pincode"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Save Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
