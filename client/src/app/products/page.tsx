'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  Plus, 
  Edit2, 
  Snowflake, 
  Trash2,
  X,
  Boxes,
  Package,
  Eye,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProductsPage() {
  const { products: cachedProducts, inventory: cachedInventory, loading, refreshData } = useErpData();
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [inspectProduct, setInspectProduct] = useState<any>(null);

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
    setIsMounted(true);
    setProducts(cachedProducts);
    setInventory(cachedInventory);
  }, [cachedProducts, cachedInventory]);

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this medicine product?')) return;
    try {
      await api.delete(`/products/${id}`);
      await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete product');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (p.name || '').toLowerCase().includes(q) ||
        (p.genericName || '').toLowerCase().includes(q) ||
        (p.companyName || '').toLowerCase().includes(q);
      const matchesType = typeFilter === 'ALL' || p.productType === typeFilter || (typeFilter === 'COLD' && p.requiresColdStorage);
      return matchesSearch && matchesType;
    });
  }, [products, search, typeFilter]);

  const getProductBatches = (productId: string) => {
    return inventory.filter((b) => b.productId === productId || b.product?.id === productId);
  };

  return (
    <div className="flex bg-[#F8FAFC] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6 overflow-y-auto max-w-[1600px] mx-auto w-full space-y-4">
        {/* COMPACT PAGE HEADER & SUMMARY STATS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Medicine Master Catalog</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600">
                {products.length} Products Formulated
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 mt-1.5">
              <span>Formulations: <strong className="text-slate-900 font-mono">{filteredProducts.length} Listed</strong></span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-blue-600 font-bold">
                <Snowflake className="w-3.5 h-3.5" />
                <span>{products.filter(p => p.requiresColdStorage).length} Cold Storage (2-8°C)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs"
              title="Refresh Catalog"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

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
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Medicine</span>
            </button>
          </div>
        </div>

        {/* SEARCH BAR & SEGMENTED DOSAGE FORM CONTROLS */}
        <div className="bg-white border border-slate-200/80 p-2.5 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand name, generic composition, or company..."
              className="w-full bg-slate-50 border border-slate-200/90 rounded-xl pl-10 pr-4 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600 transition"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Forms' },
              { id: 'TABLET', label: 'Tablets' },
              { id: 'CAPSULE', label: 'Capsules' },
              { id: 'SYRUP', label: 'Syrups' },
              { id: 'INJECTION', label: 'Injections' },
              { id: 'COLD', label: '❄ Cold Storage' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition whitespace-nowrap ${
                  typeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* HIGH-DENSITY LINEAR CATALOG TABLE */}
        {!isMounted || loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            No medicines match your search criteria.
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Medicine Brand Name & Salt</th>
                    <th className="py-2.5 px-3">Manufacturer</th>
                    <th className="py-2.5 px-3">Dosage Form</th>
                    <th className="py-2.5 px-3">Pack Rule</th>
                    <th className="py-2.5 px-3 text-right">MRP (₹)</th>
                    <th className="py-2.5 px-3 text-right">GST %</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredProducts.slice(0, 300).map((p) => (
                    <tr 
                      key={p.id} 
                      onClick={() => setInspectProduct(p)}
                      className="linear-row group cursor-pointer"
                    >
                      <td className="py-2 px-4">
                        <div className="font-semibold text-slate-900 text-sm leading-tight group-hover:text-emerald-700 transition flex items-center gap-1.5">
                          <span>{toTitleCase(p.name)}</span>
                          {p.requiresColdStorage && (
                            <span title="Cold Storage (2-8°C)">
                              <Snowflake className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-normal leading-tight mt-0.5">
                          {p.genericName ? toTitleCase(p.genericName) : 'General Salt'}
                          <span className="text-slate-400 font-mono text-[10px] ml-1.5">HSN: {p.hsnCode || '3004'}</span>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-slate-600 font-medium">
                        {toTitleCase(p.companyName || 'Generic')}
                      </td>

                      <td className="py-2 px-3">
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                          {p.productType}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                        1 {p.packUnit || 'Strip'} = {p.packSize || 10} {p.contentUnit || 'Units'}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-900 text-sm">
                        ₹{(p.mrp || 0).toFixed(2)}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-600">
                        {p.gstPercent}%
                      </td>

                      <td className="py-2 px-4 text-right">
                        <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setInspectProduct(p)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title="Inspect Batches"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(p.id, e)}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
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

      {/* INSPECT PRODUCT MODAL */}
      <AnimatePresence>
        {inspectProduct && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-slate-900 text-base">{toTitleCase(inspectProduct.name)}</h3>
                </div>
                <button onClick={() => setInspectProduct(null)} className="p-1 text-slate-400 hover:text-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Generic Salt:</span>
                  <span className="font-bold text-slate-900">{toTitleCase(inspectProduct.genericName || 'General')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Manufacturer:</span>
                  <span className="font-bold text-slate-900">{toTitleCase(inspectProduct.companyName || 'Generic')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">MRP / Pack:</span>
                  <span className="font-mono font-bold text-emerald-700">₹{(inspectProduct.mrp || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Active Inventory Stock Batches</h4>
                {getProductBatches(inspectProduct.id).length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="p-2.5">Batch</th>
                          <th className="p-2.5">Expiry</th>
                          <th className="p-2.5 text-right">MRP</th>
                          <th className="p-2.5 text-right">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {getProductBatches(inspectProduct.id).map((b: any, idx: number) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-mono font-bold text-slate-900">{b.batchNumber}</td>
                            <td className="p-2.5 text-slate-500">{formatDate(b.expiryDate)}</td>
                            <td className="p-2.5 text-right font-mono">₹{b.mrp}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{b.quantity} Units</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                    No active stock batches in inventory.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADD / EDIT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">{editingProduct ? 'Edit Medicine' : 'Add New Medicine'}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-900">
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
