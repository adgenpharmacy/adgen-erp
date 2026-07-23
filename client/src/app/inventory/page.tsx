'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
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
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'EXPIRING' | 'OUT'>('IN_STOCK');
  const [sortBy, setSortBy] = useState<'NAME' | 'STOCK_HIGH' | 'STOCK_LOW' | 'VALUATION'>('STOCK_HIGH');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inventory');
      setInventory(res.data);
    } catch (e) {
      console.error('Failed to load inventory stock:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const now = new Date();
  const NinetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const counts = {
    inStock: inventory.filter((i) => i.totalStock > 0).length,
    low: inventory.filter((i) => i.isLowStock).length,
    out: inventory.filter((i) => i.isOutOfStock).length,
    all: inventory.length,
  };

  const filtered = inventory
    .filter((item) => {
      const matchesSearch =
        item.productName.toLowerCase().includes(search.toLowerCase()) ||
        (item.batches && item.batches.some((b: any) => b.batchNumber.toLowerCase().includes(search.toLowerCase())));

      const isExpiringSoon = item.batches && item.batches.some((b: any) => {
        const exp = new Date(b.expiryDate);
        return exp <= NinetyDaysFromNow;
      });

      if (filterType === 'IN_STOCK') return matchesSearch && item.totalStock > 0;
      if (filterType === 'LOW') return matchesSearch && item.isLowStock;
      if (filterType === 'EXPIRING') return matchesSearch && isExpiringSoon;
      if (filterType === 'OUT') return matchesSearch && item.isOutOfStock;
      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'STOCK_HIGH') return b.totalStock - a.totalStock;
      if (sortBy === 'STOCK_LOW') return a.totalStock - b.totalStock;
      if (sortBy === 'VALUATION') return (b.totalMrpValue || 0) - (a.totalMrpValue || 0);
      return a.productName.localeCompare(b.productName);
    });

  const filters = [
    { key: 'IN_STOCK' as const, label: 'In Stock', count: counts.inStock },
    { key: 'LOW' as const, label: 'Low', count: counts.low },
    { key: 'EXPIRING' as const, label: 'Expiring', count: null },
    { key: 'OUT' as const, label: 'Out', count: counts.out },
    { key: 'ALL' as const, label: 'All', count: counts.all },
  ];

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Inventory</h1>
              <p className="text-xs text-gray-500 mt-0.5">Batch stock, FEFO tracking & expiry alerts</p>
            </div>
            <button
              onClick={fetchInventory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Search + Filters */}
          <div className="px-6 pb-3 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by medicine or batch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilterType(f.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${
                      filterType === f.key
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {f.label}{f.count !== null ? ` (${f.count})` : ''}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-white border border-gray-200 rounded-md px-2 py-1 text-xs font-medium text-gray-600 focus:outline-none"
              >
                <option value="STOCK_HIGH">Highest Stock</option>
                <option value="STOCK_LOW">Lowest Stock</option>
                <option value="NAME">Name A-Z</option>
                <option value="VALUATION">Highest Value</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No items match your filter.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Medicine</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Stock</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell text-right">Value</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item) => {
                    const isExpanded = expandedProduct === item.productId;
                    const prod = item.product || {};
                    const packSize = item.packSize || 1;
                    const packUnit = prod.packUnit || item.packUnit || 'Pack';
                    const contentUnit = prod.contentUnit || item.contentUnit || 'Unit';
                    const numPacks = packSize > 1 ? Math.floor(item.totalStock / packSize) : item.totalStock;
                    const numLoose = packSize > 1 ? (item.totalStock % packSize) : 0;

                    return (
                      <tbody key={item.productId}>
                        <tr
                          onClick={() => setExpandedProduct(isExpanded ? null : item.productId)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-900">{item.productName}</span>
                              {prod.requiresColdStorage && (
                                <Snowflake className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {packSize} {contentUnit}s/{packUnit}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                              {item.productType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-sm font-semibold font-mono text-gray-900">
                              {numPacks.toLocaleString('en-IN')}
                              <span className="text-[11px] text-gray-400 font-normal ml-1">{packUnit}s</span>
                            </div>
                            {numLoose > 0 && (
                              <div className="text-[11px] text-gray-400 font-mono">+{numLoose} loose</div>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-right">
                            <span className="text-xs font-mono text-gray-500">
                              ₹{(item.totalMrpValue || 0).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.isOutOfStock ? (
                              <span className="text-[11px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">Out</span>
                            ) : item.isLowStock ? (
                              <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Low</span>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">OK</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isExpanded 
                              ? <ChevronUp className="w-4 h-4 text-gray-400 inline" /> 
                              : <ChevronDown className="w-4 h-4 text-gray-400 inline" />
                            }
                          </td>
                        </tr>

                        {/* Expanded batch rows */}
                        {isExpanded && item.batches?.map((b: any) => {
                          const exp = new Date(b.expiryDate);
                          const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
                          let expiryColor = 'text-gray-500';
                          if (daysLeft < 0) expiryColor = 'text-red-600 font-semibold';
                          else if (daysLeft <= 30) expiryColor = 'text-red-500';
                          else if (daysLeft <= 90) expiryColor = 'text-amber-500';

                          return (
                            <tr key={b.id} className="bg-gray-50 border-t border-gray-100">
                              <td className="px-4 py-2 pl-8">
                                <span className="text-xs font-mono text-gray-600">Batch: {b.batchNumber || '—'}</span>
                              </td>
                              <td className="px-4 py-2 hidden md:table-cell">
                                <span className={`text-xs ${expiryColor}`}>
                                  Exp: {formatDate(b.expiryDate)}
                                  {daysLeft < 0 ? ' (EXPIRED)' : daysLeft <= 90 ? ` (${daysLeft}d)` : ''}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className="text-xs font-mono font-medium text-gray-900">{b.quantity} units</span>
                              </td>
                              <td className="px-4 py-2 hidden sm:table-cell text-right">
                                <span className="text-xs font-mono text-gray-500">MRP ₹{b.mrp?.toFixed(2)}</span>
                              </td>
                              <td className="px-4 py-2" colSpan={2}></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
