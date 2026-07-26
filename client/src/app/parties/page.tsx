'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { Search, Plus, Edit2 } from 'lucide-react';

export default function PartiesPage() {
  const { parties: cachedParties, refreshData } = useErpData();
  const [parties, setParties] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', dlNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (cachedParties && cachedParties.length > 0) {
      setParties(cachedParties);
    }
  }, [cachedParties]);

  const fetchParties = async () => {
    try { 
      const res = await api.get('/parties'); 
      setParties(res.data);
      refreshData();
    } catch (e) { 
      console.error('Failed to fetch suppliers:', e); 
    }
  };

  useEffect(() => { 
    fetchParties(); 
  }, []);

  const openAddModal = () => {
    setEditingParty(null);
    setFormData({ name: '', phone: '', email: '', address: '', gstNumber: '', dlNumber: '' });
    setShowAddModal(true);
  };

  const openEditModal = (party: any) => {
    setEditingParty(party);
    setFormData({ name: party.name || '', phone: party.phone || '', email: party.email || '', address: party.address || '', gstNumber: party.gstNumber || '', dlNumber: party.dlNumber || '' });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingParty) { await api.put(`/parties/${editingParty.id}`, formData); }
      else { await api.post('/parties', formData); }
      setShowAddModal(false);
      fetchParties();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save supplier');
    } finally { setIsSubmitting(false); }
  };

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone && p.phone.includes(search))
  );

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Suppliers</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} suppliers</p>
            </div>
            <button onClick={openAddModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition">
              <Plus className="w-3.5 h-3.5" /> Add Supplier
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
            <div className="py-16 text-center text-gray-400 text-sm">No suppliers found.</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Phone</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">DL Number</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">GST</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Outstanding</th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((party) => (
                    <tr key={party.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{party.name}</div>
                        {party.address && <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">{party.address}</div>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs font-mono text-gray-600">{party.phone || '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-mono text-gray-500">{party.dlNumber || '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs font-mono text-gray-500">{party.gstNumber || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold font-mono ${party.outstandingBalance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          ₹{party.outstandingBalance?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEditModal(party)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-gray-100 transition" title="Edit">
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
              <h2 className="text-base font-semibold text-gray-900 mb-4">{editingParty ? 'Edit Supplier' : 'Add Supplier'}</h2>
              <form onSubmit={handleSubmit} className="space-y-3 text-sm">
                {[
                  { label: 'Name *', key: 'name', required: true },
                  { label: 'Phone', key: 'phone' },
                  { label: 'Email', key: 'email', type: 'email' },
                  { label: 'DL Number', key: 'dlNumber', placeholder: 'e.g. 20B/5441/12/2024' },
                  { label: 'GST Number', key: 'gstNumber' },
                  { label: 'Address', key: 'address' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-gray-500 font-medium block mb-1">{field.label}</label>
                    <input 
                      type={field.key === 'phone' ? 'tel' : field.type || 'text'}
                      maxLength={field.key === 'phone' ? 10 : undefined}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={(formData as any)[field.key]}
                      onChange={(e) => setFormData({
                        ...formData,
                        [field.key]: field.key === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value
                      })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                ))}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm">
                    {isSubmitting ? 'Saving...' : editingParty ? 'Update' : 'Create'}
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
