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
  Snowflake
} from 'lucide-react';

export default function InventoryPage() {
  const { inventory: cachedInventory, loading, refreshData } = useErpData();
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'EXPIRING' | 'OUT'>('IN_STOCK');
  const [sortBy, setSortBy] = useState<'NAME' | 'STOCK_HIGH' | 'STOCK_LOW' | 'VALUATION'>('STOCK_HIGH');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

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

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stock & Batch Inventory</h1>
            <p className="text-xs text-slate-500 mt-0.5">{filteredInventory.length} medicines in stock view</p>
          </div>
          <button
            onClick={() => refreshData()}
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-2xs self-start sm:self-auto"
            title="Refresh Stock"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs mb-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stock by brand name, generic salt, or manufacturer..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
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
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            >
              <option value="STOCK_HIGH">Highest Stock First</option>
              <option value="NAME">Sort by Name A-Z</option>
              <option value="STOCK_LOW">Lowest Stock First</option>
              <option value="VALUATION">Highest Value (₹)</option>
            </select>
          </div>
        </div>

        {/* Inventory List Table */}
        {filteredInventory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Loading inventory stock...' : 'No inventory stock matches found.'}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Medicine Name</th>
                    <th className="py-3.5 px-4">Manufacturer</th>
                    <th className="py-3.5 px-4 text-center">Active Batches</th>
                    <th className="py-3.5 px-4 text-right">System Stock</th>
                    <th className="py-3.5 px-4 text-right">MRP (₹)</th>
                    <th className="py-3.5 px-4 text-right">Stock Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredInventory.slice(0, 300).map((inv) => {
                    const isExpanded = expandedProduct === inv.id;
                    const stock = inv.systemStock || 0;
                    const isLow = stock <= (inv.lowStockThreshold || 5) && stock > 0;

                    return (
                      <tbody key={inv.id} className="divide-y divide-slate-100">
                        <tr
                          onClick={() => setExpandedProduct(isExpanded ? null : inv.id)}
                          className="hover:bg-emerald-50/40 cursor-pointer transition"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            <span>{inv.productName || inv.name}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500">
                            {inv.companyName || 'Generic'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700">
                              {(inv.batches || []).length} Batches
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded-md ${
                              stock === 0 ? 'bg-rose-100 text-rose-700' :
                              isLow ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {stock} {inv.contentUnit || 'Units'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                            ₹{(inv.mrp || 0).toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
                            ₹{(inv.totalMrpValue || (stock * (inv.mrp || 0))).toFixed(2)}
                          </td>
                        </tr>

                        {/* Expanded Batches Breakdown Row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={6} className="p-4">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                <h4 className="font-bold text-slate-900 text-xs border-b border-slate-100 pb-1">Batch Breakdown</h4>
                                {(inv.batches || []).length === 0 ? (
                                  <div className="text-[11px] text-slate-400">No active batches</div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {(inv.batches || []).map((b: any, bIdx: number) => (
                                      <div key={bIdx} className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-[11px] space-y-1">
                                        <div className="font-bold text-slate-900 flex justify-between">
                                          <span>Batch: {b.batchNumber}</span>
                                          <span className="font-mono text-emerald-600">Qty: {b.quantity}</span>
                                        </div>
                                        <div className="text-slate-500 text-[10px] flex justify-between">
                                          <span>Exp: {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : 'N/A'}</span>
                                          <span>MRP: ₹{b.mrp}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
