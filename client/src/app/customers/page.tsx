'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { Search, Plus, Edit2 } from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', doctorName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (e) {
      console.error('Failed to fetch customers:', e);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

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
      if (editingCustomer) { await api.put(`/customers/${editingCustomer.id}`, formData); }
      else { await api.post('/customers', formData); }
      setShowAddModal(false);
      fetchCustomers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save customer');
    } finally { setIsSubmitting(false); }
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search))
  );

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Customers</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} customers</p>
            </div>
            <button onClick={openAddModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition">
              <Plus className="w-3.5 h-3.5" /> Add Customer
            </button>
          </div>
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition" />
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No customers found.</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Doctor</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Email</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Credit</th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((cust) => (
                    <tr key={cust.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{cust.name}</div>
                        {cust.address && <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">{cust.address}</div>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs font-mono text-gray-600">{cust.phone || '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-500">{cust.doctorName ? `Dr. ${cust.doctorName}` : '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-500">{cust.email || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold font-mono ${cust.creditBalance > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                          ₹{cust.creditBalance?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEditModal(cust)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-gray-100 transition" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-gray-200 p-6 rounded-lg max-w-md w-full shadow-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              <form onSubmit={handleSubmit} className="space-y-3 text-sm">
                {[
                  { label: 'Name *', key: 'name', required: true },
                  { label: 'Phone', key: 'phone' },
                  { label: 'Email', key: 'email', type: 'email' },
                  { label: 'Doctor', key: 'doctorName', placeholder: 'e.g. Dr. Verma' },
                  { label: 'Address', key: 'address' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-gray-500 font-medium block mb-1">{field.label}</label>
                    <input type={field.type || 'text'} required={field.required} placeholder={field.placeholder}
                      value={(formData as any)[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                ))}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm">
                    {isSubmitting ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
