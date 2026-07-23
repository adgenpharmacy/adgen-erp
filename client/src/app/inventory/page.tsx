'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { formatDate } from '@/lib/utils';
import { 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Package,
  Boxes,
  Calendar,
  AlertTriangle,
  X,
  TrendingUp,
  Clock,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InventoryPage() {
  const { inventory: cachedInventory, loading, refreshData } = useErpData();
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'EXPIRING' | 'OUT'>('IN_STOCK');
  const [sortBy, setSortBy] = useState<'NAME' | 'STOCK_HIGH' | 'STOCK_LOW' | 'VALUATION'>('STOCK_HIGH');
  const [inspectInventory, setInspectInventory] = useState<any>(null);

  useEffect(() => {
    setInventory(cachedInventory);
  }, [cachedInventory]);

  const now = new Date();

  const filteredInventory = inventory
    .filter((inv) => {
      const q = search.toLowerCase();
      const prodName = inv.productName || inv.name || '';
      const matchesSearch =
        prodName.toLowerCase().includes(q) ||
        (inv.genericName || '').toLowerCase().includes(q) ||
        (inv.companyName || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const stock = inv.systemStock || 0;
      const lowThreshold = inv.lowStockThreshold || 5;

      if (filterType === 'IN_STOCK') return stock > 0;
      if (filterType === 'LOW') return stock > 0 && stock <= lowThreshold;
      if (filterType === 'OUT') return stock === 0;
      if (filterType === 'EXPIRING') {
        return (inv.batches || []).some((b: any) => {
          if (!b.expiryDate) return false;
          const daysLeft = (new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
          return daysLeft > 0 && daysLeft <= 90;
        });
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'NAME') return (a.productName || a.name || '').localeCompare(b.productName || b.name || '');
      if (sortBy === 'STOCK_HIGH') return (b.systemStock || 0) - (a.systemStock || 0);
      if (sortBy === 'STOCK_LOW') return (a.systemStock || 0) - (b.systemStock || 0);
      if (sortBy === 'VALUATION') return (b.totalMrpValue || 0) - (a.totalMrpValue || 0);
      return 0;
    });

  const calculateProfitMargin = (purchaseRate: number, mrp: number) => {
    if (!purchaseRate || purchaseRate === 0) return 0;
    return (((mrp - purchaseRate) / purchaseRate) * 100).toFixed(1);
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6 text-emerald-600" />
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Stock & Batch Inventory</h1>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              FEFO batch tracking, expiry alerts & warehouse valuation ({filteredInventory.length} total)
            </p>
          </div>
          <button
            onClick={() => refreshData()}
            className="p-2.5 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs self-start sm:self-auto"
            title="Refresh Stock Counts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-slate-200/90 p-3 rounded-2xl shadow-xs mb-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stock by brand name, generic composition, or manufacturer..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 transition"
            >
              <option value="IN_STOCK">In Stock (&gt;0)</option>
              <option value="ALL">All Items</option>
              <option value="LOW">Low Stock Alerts</option>
              <option value="EXPIRING">Expiring &lt; 90 Days</option>
              <option value="OUT">Out of Stock</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 transition"
            >
              <option value="STOCK_HIGH">Highest Stock First</option>
              <option value="NAME">Sort by Name A-Z</option>
              <option value="STOCK_LOW">Lowest Stock First</option>
              <option value="VALUATION">Highest Value (₹)</option>
            </select>
          </div>
        </div>

        {/* Table List */}
        {filteredInventory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            {loading ? 'Loading inventory stock...' : 'No inventory stock matches found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Medicine Product</th>
                    <th className="py-3.5 px-4">Manufacturer</th>
                    <th className="py-3.5 px-4 text-center">Active Batches</th>
                    <th className="py-3.5 px-4 text-right">System Stock</th>
                    <th className="py-3.5 px-4 text-right">MRP (₹)</th>
                    <th className="py-3.5 px-4 text-right">Stock Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredInventory.slice(0, 300).map((inv) => {
                    const stock = inv.systemStock || 0;
                    const isLow = stock <= (inv.lowStockThreshold || 5) && stock > 0;

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setInspectInventory(inv)}
                        className="hover:bg-emerald-50/50 cursor-pointer transition group"
                      >
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 group-hover:text-emerald-700">
                          {inv.productName || inv.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-bold">
                          {inv.companyName || 'Generic'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                            {(inv.batches || []).length} Active Batches
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-extrabold shadow-2xs ${
                            stock === 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            isLow ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {stock} {inv.contentUnit || 'Units'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{(inv.mrp || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-700">
                          ₹{(inv.totalMrpValue || (stock * (inv.mrp || 0))).toFixed(2)}
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

      {/* INSPECT INVENTORY BATCH DETAILS MODAL */}
      <AnimatePresence>
        {inspectInventory && (
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
                      <Package className="w-5 h-5 text-emerald-600" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        {inspectInventory.productName || inspectInventory.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold">
                        {inspectInventory.companyName || 'Generic'} • Stock Valuation: ₹{(inspectInventory.totalMrpValue || (inspectInventory.systemStock * (inspectInventory.mrp || 0))).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setInspectInventory(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Warehouse Stock</div>
                  <div className="font-mono font-extrabold text-slate-900 text-lg mt-1">
                    {inspectInventory.systemStock || 0} Units
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">MRP / Unit</div>
                  <div className="font-mono font-extrabold text-slate-900 text-lg mt-1">
                    ₹{(inspectInventory.mrp || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl">
                  <div className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider">Active Batches</div>
                  <div className="font-mono font-extrabold text-slate-900 text-lg mt-1">
                    {(inspectInventory.batches || []).length} Batches
                  </div>
                </div>
              </div>

              {/* FEFO Batches List */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>FEFO Batch Breakdown & Expiry Countdowns</span>
                </h4>

                {(inspectInventory.batches || []).length > 0 ? (
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Batch Number</th>
                          <th className="py-2.5 px-3">Expiry Date</th>
                          <th className="py-2.5 px-3 text-right">P.Rate</th>
                          <th className="py-2.5 px-3 text-right">MRP</th>
                          <th className="py-2.5 px-3 text-right">Profit Margin</th>
                          <th className="py-2.5 px-3 text-center">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {(inspectInventory.batches || []).map((b: any, idx: number) => {
                          const daysLeft = b.expiryDate ? Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24)) : 999;
                          const isExpired = daysLeft <= 0;
                          const isExpiringSoon = daysLeft > 0 && daysLeft <= 90;
                          const margin = calculateProfitMargin(b.purchaseRate, b.mrp);

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3 font-mono font-extrabold text-slate-900">
                                {b.batchNumber}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-700">{formatDate(b.expiryDate)}</span>
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                                    isExpired ? 'bg-rose-100 text-rose-800' :
                                    isExpiringSoon ? 'bg-amber-100 text-amber-800' :
                                    'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {isExpired ? 'Expired' : `${daysLeft} days left`}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                                ₹{(b.purchaseRate || 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                ₹{(b.mrp || 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-700">
                                +{margin}%
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px]">
                                  {b.quantity} Units
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400 font-medium">
                    No batch records present for this inventory item.
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setInspectInventory(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
