'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { 
  Search, 
  Plus, 
  Edit2, 
  Snowflake, 
  Trash2
} from 'lucide-react';
import Link from 'next/link';

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const fetchProducts = async (queryStr = '') => {
    try {
      setLoading(true);
      const res = await api.get('/products', { params: { q: queryStr } });
      setProducts(res.data);
    } catch (e) {
      console.error('Failed to fetch products catalog:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(search.trim());
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '', genericName: '', companyName: '', hsnCode: '3004', gstPercent: 12,
      mrp: 0, purchaseRate: 0, productType: 'TABLET', packSize: 10,
      packUnit: 'Strip', contentUnit: 'Tablet', requiresColdStorage: false, division: 'GENERAL',
    });
    setShowAddModal(true);
  };

  const openEditModal = (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(p);
    setFormData({
      name: p.name || '', genericName: p.genericName || '', companyName: p.companyName || '',
      hsnCode: p.hsnCode || '3004', gstPercent: p.gstPercent || 12, mrp: p.mrp || 0,
      purchaseRate: p.purchaseRate || 0, productType: p.productType || 'TABLET',
      packSize: p.packSize || 10, packUnit: p.packUnit || 'Strip',
      contentUnit: p.contentUnit || 'Tablet', requiresColdStorage: p.requiresColdStorage || false,
      division: p.division || 'GENERAL',
    });
    setShowAddModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setShowAddModal(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDeleteProduct = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this medicine?')) {
      try {
        await api.delete(`/products/${id}`);
        fetchProducts();
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed to delete product');
      }
    }
  };

  const filtered = products.filter((p) => {
    const matchesType = typeFilter === 'ALL' || p.productType === typeFilter;
    return matchesType;
  });

  const types = ['ALL', 'TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'POWDER'];

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Products</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} medicines cataloged</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/products/new"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-md text-xs border border-gray-200 hover:border-gray-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Full Form
              </Link>
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Quick Add
              </button>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="px-6 pb-3 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, salt, or manufacturer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${
                    typeFilter === type 
                      ? 'bg-gray-900 text-white' 
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No products found.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Medicine</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Manufacturer</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Pack</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">MRP</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((p) => {
                    const latestMrp = p.batches?.[0]?.mrp || p.mrp || 0;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="text-sm font-medium text-gray-900">{p.name}</div>
                            {p.requiresColdStorage && (
                              <Snowflake className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Cold Storage" />
                            )}
                          </div>
                          {p.genericName && (
                            <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[240px]">{p.genericName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {p.productType}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-gray-500">{p.companyName || '—'}</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-gray-500 font-mono">{p.packSize || 1} {p.contentUnit || 'units'}/{p.packUnit || 'pack'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold font-mono text-gray-900">
                            {latestMrp > 0 ? `₹${latestMrp.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5 justify-end">
                            <button
                              onClick={(e) => openEditModal(p, e)}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-gray-100 transition"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteProduct(p.id, e)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border border-gray-200 p-6 rounded-lg max-w-lg w-full shadow-lg my-8">
              <h2 className="text-base font-semibold text-gray-900 mb-4">{editingProduct ? 'Edit Medicine' : 'Add New Medicine'}</h2>
              <form onSubmit={handleSave} className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Brand / Trade Name *</label>
                  <input type="text" required value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Type *</label>
                    <select value={formData.productType}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500">
                      <option value="TABLET">Tablet</option>
                      <option value="CAPSULE">Capsule</option>
                      <option value="SYRUP">Syrup</option>
                      <option value="INJECTION">Injection</option>
                      <option value="CREAM">Cream / Ointment</option>
                      <option value="DROPS">Drops</option>
                      <option value="POWDER">Powder</option>
                      <option value="OTHERS">Others</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Pack Size</label>
                    <input type="number" value={formData.packSize}
                      onChange={(e) => setFormData({ ...formData, packSize: parseInt(e.target.value) || 1 })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-right font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Generic Salt Composition</label>
                  <input type="text" placeholder="e.g. Paracetamol 650mg" value={formData.genericName}
                    onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Manufacturer</label>
                    <input type="text" placeholder="e.g. Micro Labs" value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">HSN Code</label>
                    <input type="text" value={formData.hsnCode}
                      onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">MRP ₹</label>
                    <input type="number" step="0.01" value={formData.mrp}
                      onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Cost Price ₹</label>
                    <input type="number" step="0.01" value={formData.purchaseRate}
                      onChange={(e) => setFormData({ ...formData, purchaseRate: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">GST %</label>
                    <select value={formData.gstPercent}
                      onChange={(e) => setFormData({ ...formData, gstPercent: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500">
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Division</label>
                    <select value={formData.division}
                      onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500">
                      <option value="GENERAL">General</option>
                      <option value="SCHEDULE_H">Schedule H</option>
                      <option value="SCHEDULE_H1">Schedule H1</option>
                      <option value="SCHEDULE_X">Schedule X</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="cold" checked={formData.requiresColdStorage}
                    onChange={(e) => setFormData({ ...formData, requiresColdStorage: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300" />
                  <label htmlFor="cold" className="text-xs text-gray-700 font-medium">
                    Requires Cold Storage (2-8°C)
                  </label>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm">
                    Cancel
                  </button>
                  <button type="submit"
                    className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm">
                    {editingProduct ? 'Update' : 'Save'}
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
