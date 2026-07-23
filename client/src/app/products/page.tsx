'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
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
  Layers,
  Building2,
  Tag,
  Eye,
  Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProductsPage() {
  const { products: cachedProducts, inventory: cachedInventory, loading, refreshData } = useErpData();
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
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
    setProducts(cachedProducts);
    setInventory(cachedInventory);
  }, [cachedProducts, cachedInventory]);

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

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (p.name || '').toLowerCase().includes(q) ||
      (p.genericName || '').toLowerCase().includes(q) ||
      (p.companyName || '').toLowerCase().includes(q);
    const matchesType = typeFilter === 'ALL' || p.productType === typeFilter;
    return matchesSearch && matchesType;
  });

  const getProductBatches = (productId: string) => {
    return inventory.filter((b) => b.productId === productId || b.product?.id === productId);
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="w-6 h-6 text-emerald-600" />
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Medicine Master Catalog</h1>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Pharmaceutical formulations, generic compositions & pack rules ({filteredProducts.length} total)
            </p>
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
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Medicine</span>
          </button>
        </div>

        {/* Controls Bar */}
        <div className="bg-white border border-slate-200/90 p-3 rounded-2xl shadow-xs mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand name, generic salt, or company..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 transition"
          >
            <option value="ALL">All Dosage Forms</option>
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

        {/* Table List */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            {loading ? 'Loading medicine catalog...' : 'No medicines match your search criteria.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Medicine Product</th>
                    <th className="py-3.5 px-4">Generic Composition</th>
                    <th className="py-3.5 px-4">Company</th>
                    <th className="py-3.5 px-4">Dosage Form</th>
                    <th className="py-3.5 px-4 text-right">MRP (₹)</th>
                    <th className="py-3.5 px-4 text-right">GST %</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredProducts.slice(0, 300).map((p) => (
                    <tr 
                      key={p.id} 
                      onClick={() => setInspectProduct(p)}
                      className="hover:bg-emerald-50/50 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-extrabold text-slate-900 group-hover:text-emerald-700 flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.requiresColdStorage && (
                          <span title="Requires Cold Storage (2-8°C)">
                            <Snowflake className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-semibold truncate max-w-[200px]">
                        {p.genericName || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-bold">
                        {p.companyName || 'Generic'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                          {p.productType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900">
                        ₹{(p.mrp || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-600">
                        {p.gstPercent}%
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setInspectProduct(p)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Inspect Product & Stock Batches"
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
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(p.id, e)}
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

      {/* INSPECT PRODUCT & STOCK BATCHES MODAL */}
      <AnimatePresence>
        {inspectProduct && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white border border-slate-200/90 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                      <Boxes className="w-5 h-5 text-emerald-600" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        {inspectProduct.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold">
                        {inspectProduct.genericName || 'No composition listed'} • {inspectProduct.companyName || 'Generic'}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setInspectProduct(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Dosage Form</div>
                  <div className="font-extrabold text-slate-900 mt-1">{inspectProduct.productType}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Pack Rule</div>
                  <div className="font-extrabold text-slate-900 mt-1">
                    1 {inspectProduct.packUnit || 'Strip'} = {inspectProduct.packSize || 10} {inspectProduct.contentUnit || 'Units'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">HSN & GST</div>
                  <div className="font-mono font-extrabold text-slate-900 mt-1">
                    {inspectProduct.hsnCode || '3004'} ({inspectProduct.gstPercent}%)
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Cold Storage</div>
                  <div className="font-extrabold mt-1">
                    {inspectProduct.requiresColdStorage ? (
                      <span className="text-blue-600 font-bold flex items-center gap-1">
                        <Snowflake className="w-3.5 h-3.5" /> Yes (2-8°C)
                      </span>
                    ) : (
                      <span className="text-slate-500">Normal Storage</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Batches Table */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>Active Stock Batches in Inventory ({getProductBatches(inspectProduct.id).length})</span>
                </h4>

                {getProductBatches(inspectProduct.id).length > 0 ? (
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Batch #</th>
                          <th className="py-2.5 px-3">Expiry Date</th>
                          <th className="py-2.5 px-3 text-right">P.Rate</th>
                          <th className="py-2.5 px-3 text-right">MRP</th>
                          <th className="py-2.5 px-3 text-center">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {getProductBatches(inspectProduct.id).map((b: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 px-3 font-mono font-extrabold text-slate-900">
                              {b.batchNumber}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-semibold">
                              {formatDate(b.expiryDate)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                              ₹{(b.purchaseRate || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              ₹{(b.mrp || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px]">
                                {b.quantity} {inspectProduct.packUnit || 'Strips'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400 font-medium">
                    No active stock batches currently present in inventory for this medicine.
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setInspectProduct(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
