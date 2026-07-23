'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { 
  Search, 
  Plus, 
  Edit2, 
  Snowflake, 
  Trash2,
  X
} from 'lucide-react';

export default function ProductsPage() {
  const { products: cachedProducts, loading, refreshData } = useErpData();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    genericName: '',
    companyName: '',
    hsnCode: '',
    gstPercent: 12,
    mrp: 0,
    purchaseRate: 0,
    productType: 'TABLET',
    packSize: 10,
    packUnit: 'Strip',
    contentUnit: 'Tablet',
    requiresColdStorage: false,
    division: 'GENERAL',
  });

  useEffect(() => {
    setProducts(cachedProducts);
  }, [cachedProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setShowAddModal(false);
      setEditingProduct(null);
      await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this medicine product?')) return;
    try {
      await api.delete(`/products/${id}`);
      await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete product');
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (p.name || '').toLowerCase().includes(q) ||
      (p.genericName || '').toLowerCase().includes(q) ||
      (p.companyName || '').toLowerCase().includes(q);
    const matchesType = typeFilter === 'ALL' || p.productType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Medicine Master Catalog</h1>
            <p className="text-xs text-slate-500 mt-0.5">{filteredProducts.length} medicines listed</p>
          </div>
          <button
            onClick={() => {
              setEditingProduct(null);
              setFormData({
                name: '',
                genericName: '',
                companyName: '',
                hsnCode: '',
                gstPercent: 12,
                mrp: 0,
                purchaseRate: 0,
                productType: 'TABLET',
                packSize: 10,
                packUnit: 'Strip',
                contentUnit: 'Tablet',
                requiresColdStorage: false,
                division: 'GENERAL',
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Medicine</span>
          </button>
        </div>

        {/* Controls Bar */}
        <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand name, generic salt, or company..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
          >
            <option value="ALL">All Types</option>
            <option value="TABLET">Tablet</option>
            <option value="CAPSULE">Capsule</option>
            <option value="SYRUP">Syrup</option>
            <option value="INJECTION">Injection</option>
            <option value="CREAM">Cream/Ointment</option>
            <option value="DROPS">Drops</option>
            <option value="POWDER">Powder</option>
            <option value="OTHERS">Others</option>
          </select>
        </div>

        {/* Table / Cards */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Loading medicine catalog...' : 'No medicines found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Medicine Name</th>
                    <th className="py-3.5 px-4">Generic Composition</th>
                    <th className="py-3.5 px-4">Company</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4 text-right">MRP (₹)</th>
                    <th className="py-3.5 px-4 text-right">GST %</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredProducts.slice(0, 300).map((p) => (
                    <tr key={p.id} className="hover:bg-emerald-50/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.requiresColdStorage && (
                          <span title="Cold Storage Required">
                            <Snowflake className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 truncate max-w-[200px]">
                        {p.genericName || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {p.companyName || 'Generic'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">
                          {p.productType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        ₹{(p.mrp || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-600">
                        {p.gstPercent}%
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setFormData({
                                name: p.name || '',
                                genericName: p.genericName || '',
                                companyName: p.companyName || '',
                                hsnCode: p.hsnCode || '3004',
                                gstPercent: p.gstPercent || 12,
                                mrp: p.mrp || 0,
                                purchaseRate: p.purchaseRate || 0,
                                productType: p.productType || 'TABLET',
                                packSize: p.packSize || 10,
                                packUnit: p.packUnit || 'Strip',
                                contentUnit: p.contentUnit || 'Tablet',
                                requiresColdStorage: Boolean(p.requiresColdStorage),
                                division: p.division || 'GENERAL',
                              });
                              setShowAddModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Product"
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

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">{editingProduct ? 'Edit Medicine' : 'Add New Medicine'}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. SINAREST TABLET"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Generic Composition</label>
                  <input
                    type="text"
                    value={formData.genericName}
                    onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                    placeholder="Paracetamol, Phenylephrine"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Company / Manufacturer</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Centaur Pharma"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.mrp}
                    onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.purchaseRate}
                    onChange={(e) => setFormData({ ...formData, purchaseRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">GST %</label>
                  <select
                    value={formData.gstPercent}
                    onChange={(e) => setFormData({ ...formData, gstPercent: parseFloat(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
