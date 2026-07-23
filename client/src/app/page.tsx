'use client';

import { useEffect, useState } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { 
  TrendingUp, 
  ShoppingBag, 
  PackageCheck, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowRight,
  RefreshCw,
  Plus,
  Receipt,
  FileText
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';

export default function Dashboard() {
  const { sales, purchases, inventory, products, loading, refreshData } = useErpData();
  const [metrics, setMetrics] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    // Compute metrics instantly from cached global state
    const todayStr = new Date().toISOString().split('T')[0];
    
    const todaySales = sales.filter((s: any) => 
      (s.saleDate || s.createdAt || '').toString().startsWith(todayStr)
    );
    const todaySalesTotal = todaySales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);

    const monthSalesTotal = sales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);

    const lowStockCount = inventory.filter((inv: any) => 
      (inv.systemStock || 0) <= (inv.lowStockThreshold || 5)
    ).length;

    setMetrics({
      todaySales: todaySalesTotal,
      todayBillsCount: todaySales.length,
      monthlySales: monthSalesTotal,
      lowStockItemsCount: lowStockCount,
      totalInventoryItems: inventory.length || products.length,
      recentSales: sales.slice(0, 5),
    });

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayTotals = days.map((d) => ({ name: d, sales: 0, purchases: 0 }));

    sales.forEach((s: any) => {
      const d = new Date(s.saleDate || s.createdAt).getDay();
      if (!isNaN(d)) dayTotals[d].sales += s.grandTotal || 0;
    });

    purchases.forEach((p: any) => {
      const d = new Date(p.purchaseDate || p.createdAt).getDay();
      if (!isNaN(d)) dayTotals[d].purchases += p.grandTotal || 0;
    });

    setChartData(dayTotals);
  }, [sales, purchases, inventory, products]);

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-[1600px] mx-auto w-full">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pharmacy Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">Real-time overview of sales, stock alerts, and financial performance</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => refreshData()}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            <Link
              href="/billing"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Sale (POS)</span>
            </Link>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Sales</span>
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold font-mono text-slate-900">
                ₹{(metrics?.todaySales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">
                {metrics?.todayBillsCount || 0} Bills Generated Today
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Monthly Revenue</span>
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold font-mono text-slate-900">
                ₹{(metrics?.monthlySales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">Total Revenue Recorded</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Catalog</span>
              <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
                <PackageCheck className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold font-mono text-slate-900">
                {(metrics?.totalInventoryItems || 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">Total Active Medicines</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock Alerts</span>
              <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold font-mono text-amber-600">
                {metrics?.lowStockItemsCount || 0}
              </div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">Medicines needing reorder</div>
            </div>
          </div>
        </div>

        {/* Chart & Recent Sales Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Revenue Chart */}
          <div className="lg:col-span-8 bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm">Weekly Sales & Purchases Trend</h2>
              <span className="text-xs text-slate-400 font-medium">Last 7 Days</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }} 
                    formatter={(val: any) => [`₹${Number(val).toFixed(2)}`, '']}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Sales List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-900 text-sm">Recent Sales</h2>
              <Link href="/sales" className="text-xs text-emerald-600 font-bold hover:underline">View All</Link>
            </div>
            <div className="space-y-3">
              {(metrics?.recentSales || []).length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No recent sales invoices</div>
              ) : (
                (metrics?.recentSales || []).map((sale: any) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-emerald-50/50 transition">
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{sale.customerName || 'Walk-in Customer'}</div>
                      <div className="text-[10px] text-slate-400">{new Date(sale.saleDate || sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span className="font-mono font-bold text-emerald-600 text-xs">
                      ₹{(sale.grandTotal || 0).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
