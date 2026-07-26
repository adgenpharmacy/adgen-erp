'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatDate, formatPackQuantity } from '@/lib/utils';
import { 
  Search, 
  RefreshCw, 
  Package, 
  Clock, 
  AlertTriangle, 
  X, 
  Eye, 
  Edit, 
  CheckCircle2, 
  Boxes,
  TrendingUp,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InventoryPage() {
  const { inventory: cachedInventory, loading, refreshData } = useErpData();
  const [inventory, setInventory] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'EXPIRING' | 'OUT'>('IN_STOCK');
  const [sortBy, setSortBy] = useState<'NAME' | 'STOCK_HIGH' | 'STOCK_LOW' | 'VALUATION'>('STOCK_HIGH');
  const [inspectInventory, setInspectInventory] = useState<any>(null);

  useEffect(() => {
    setIsMounted(true);
    setInventory(cachedInventory);
  }, [cachedInventory]);

  const now = new Date();

  // Helper for Title Case conversion
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  // Header Summary Stats Calculation
  const stats = useMemo(() => {
    let totalMrpValue = 0;
    let totalCostValue = 0;
    let expiringCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    inventory.forEach((inv) => {
      const stock = inv.systemStock || 0;
      const lowThreshold = inv.lowStockThreshold || 5;
      const mrp = inv.mrp || 0;
      const prate = inv.purchaseRate || 0;

      totalMrpValue += (inv.totalMrpValue || (stock * mrp));
      totalCostValue += (inv.totalCostValue || (stock * prate));

      if (stock === 0) outOfStockCount++;
      else if (stock <= lowThreshold) lowStockCount++;

      const isExp = (inv.batches || []).some((b: any) => {
        if (!b.expiryDate) return false;
        const daysLeft = (new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
        return daysLeft > 0 && daysLeft <= 90;
      });
      if (isExp) expiringCount++;
    });

    return {
      totalProducts: inventory.length,
      totalMrpValue,
      totalCostValue,
      expiringCount,
      lowStockCount,
      outOfStockCount,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory
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
  }, [inventory, search, filterType, sortBy]);

  return (
    <div className="flex bg-[#F8FAFC] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6 overflow-y-auto max-w-[1600px] mx-auto w-full space-y-4">
        {/* COMPACT PAGE HEADER & SUMMARY STATS STRIP */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stock & Batch Inventory</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-600">
                {stats.totalProducts} Total Items
              </span>
            </div>
            
            {/* Inline 1-Line KPI Metrics */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 mt-1.5">
              <span className="flex items-center gap-1 text-slate-900 font-extrabold" title="Gross Stock Value if sold at MRP">
                <span className="text-slate-400 font-normal">MRP Value:</span>
                <span className="font-mono text-emerald-700">₹{(stats.totalMrpValue / 100000).toFixed(2)}L</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-slate-900 font-extrabold" title="Capital Invested based on Purchase Rate">
                <span className="text-slate-400 font-normal">Cost Value:</span>
                <span className="font-mono text-blue-700">₹{(stats.totalCostValue / 100000).toFixed(2)}L</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-rose-700 font-extrabold">
                <span>🔴 {stats.expiringCount} Expiring</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-amber-700 font-extrabold">
                <span>🟡 {stats.lowStockCount} Low Stock</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs"
              title="Refresh Stock Counts"
            >
              <RefreshCw className={`w-4 h-4 ${isMounted && loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* SEARCH BAR & SEGMENTED FILTER PILLS */}
        <div className="bg-white border border-slate-200/80 p-2.5 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Instant Search Bar */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicines by brand name, generic composition, or manufacturer..."
              className="w-full bg-slate-50 border border-slate-200/90 rounded-xl pl-10 pr-4 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600 transition"
            />
          </div>

          {/* Segmented Control Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            {[
              { id: 'IN_STOCK', label: 'In Stock (>0)' },
              { id: 'ALL', label: 'All' },
              { id: 'LOW', label: 'Low Stock' },
              { id: 'EXPIRING', label: 'Expiring <90d' },
              { id: 'OUT', label: 'Out of Stock' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* HIGH-DENSITY LINEAR TABLE */}
        {!isMounted || loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : filteredInventory.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs font-bold shadow-xs">
            No stock records matching "{search}"
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Medicine Product & Salt</th>
                    <th className="py-2.5 px-3">Stock & Progress</th>
                    <th className="py-2.5 px-3">Expiry Countdown</th>
                    <th className="py-2.5 px-3 text-center">Batches</th>
                    <th className="py-2.5 px-3">Manufacturer</th>
                    <th className="py-2.5 px-3 text-right">Valuation (₹)</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredInventory.slice(0, 300).map((inv) => {
                    const stock = inv.systemStock || 0;
                    const lowThreshold = inv.lowStockThreshold || 5;
                    const isOut = stock === 0;
                    const isLow = stock > 0 && stock <= lowThreshold;
                    
                    const batches = inv.batches || [];
                    const firstExp = batches[0]?.expiryDate ? new Date(batches[0].expiryDate) : null;
                    const daysLeft = firstExp ? Math.ceil((firstExp.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 999;
                    const isExpired = daysLeft <= 0;
                    const isExpiringSoon = daysLeft > 0 && daysLeft <= 90;

                    // Urgency Stripe Color Assignment
                    const stripeClass = isOut || isExpired
                      ? 'stripe-rose'
                      : isExpiringSoon
                      ? 'stripe-amber'
                      : isLow
                      ? 'stripe-yellow'
                      : 'stripe-emerald';

                    return (
                      <tr
                        key={inv.id}
                        className={`linear-row ${stripeClass} group cursor-pointer`}
                        onClick={() => setInspectInventory(inv)}
                      >
                        {/* Medicine Product Name & Generic Composition */}
                        <td className="py-2 px-4">
                          <div className="font-semibold text-slate-900 text-sm leading-tight group-hover:text-emerald-700 transition">
                            {toTitleCase(inv.productName || inv.name)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-normal leading-tight mt-0.5">
                            {inv.genericName ? toTitleCase(inv.genericName) : 'General Composition'}
                            <span className="text-slate-400 font-mono text-[10px] ml-1.5">SKU: {inv.hsnCode || '3004'}</span>
                          </div>
                        </td>

                        {/* Stock Quantity & Visual Progress Bar */}
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold font-mono ${
                              isOut ? 'bg-rose-100 text-rose-800' :
                              isLow ? 'bg-amber-100 text-amber-800' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {formatPackQuantity(stock, inv.packSize, inv.packUnit, inv.contentUnit)}
                            </span>
                          </div>
                          {/* Compact Progress Indicator */}
                          <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${
                                isOut ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (stock / 50) * 100)}%` }}
                            ></div>
                          </div>
                        </td>

                        {/* Expiry Countdown Badge */}
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                            isExpired ? 'bg-rose-100 text-rose-800' :
                            isExpiringSoon ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {isExpired ? '🔴 Expired' : isExpiringSoon ? `🟠 ${daysLeft}d left` : `🟢 ${daysLeft}d left`}
                          </span>
                        </td>

                        {/* Active Batches Compact Pill */}
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                            batches.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {batches.length > 0 ? `🟢 ${batches.length} Batch` : 'No Batch'}
                          </span>
                        </td>

                        {/* Manufacturer */}
                        <td className="py-2 px-3 text-slate-500 font-medium text-xs">
                          {toTitleCase(inv.companyName || 'Generic')}
                        </td>

                        {/* Stock Valuation (MRP & Cost) */}
                        <td className="py-2 px-3 text-right font-mono text-sm">
                          <div className="font-extrabold text-slate-900" title="MRP Valuation">
                            ₹{(inv.totalMrpValue || (stock * (inv.mrp || 0))).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold" title="Purchase Cost Valuation">
                            Cost: ₹{(inv.totalCostValue || (stock * (inv.purchaseRate || 0))).toFixed(2)}
                          </div>
                        </td>

                        {/* Hover Action Buttons */}
                        <td className="py-2 px-4 text-right">
                          <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectInventory(inv);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-bold rounded-lg text-[11px] transition flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Batches
                            </button>
                          </div>
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

      {/* INSPECT INVENTORY MODAL */}
      <AnimatePresence>
        {inspectInventory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {toTitleCase(inspectInventory.productName || inspectInventory.name)}
                  </h3>
                </div>
                <button onClick={() => setInspectInventory(null)} className="p-1 text-slate-400 hover:text-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Manufacturer:</span>
                  <span className="font-bold text-slate-900">{toTitleCase(inspectInventory.companyName || 'Generic')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Total Stock:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatPackQuantity(inspectInventory.systemStock, inspectInventory.packSize, inspectInventory.packUnit, inspectInventory.contentUnit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Stock Valuation:</span>
                  <span className="font-mono font-bold text-slate-900">₹{(inspectInventory.totalMrpValue || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Active Batches</h4>
                {(inspectInventory.batches || []).map((b: any, bIdx: number) => (
                  <div key={bIdx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold font-mono text-slate-900">Batch: {b.batchNumber}</div>
                      <div className="text-[10px] text-slate-500">Exp: {formatDate(b.expiryDate)}</div>
                    </div>
                    <div className="text-right font-mono font-bold">
                      <div className="text-emerald-700">
                        {formatPackQuantity(b.quantity, inspectInventory.packSize, inspectInventory.packUnit, inspectInventory.contentUnit)}
                      </div>
                      <div className="text-slate-600">MRP: ₹{b.mrp}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
