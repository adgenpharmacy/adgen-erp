'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
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
  const [metrics, setMetrics] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const [metricsRes, salesRes, purchasesRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get('/sales'),
        api.get('/purchases')
      ]);
      setMetrics(metricsRes.data);

      const sales = salesRes.data || [];
      const purchases = purchasesRes.data || [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayTotals = days.map((d) => ({ name: d, sales: 0, purchases: 0 }));

      sales.forEach((s: any) => {
        const d = new Date(s.saleDate || s.createdAt).getDay();
        dayTotals[d].sales += s.grandTotal || 0;
      });

      purchases.forEach((p: any) => {
        const d = new Date(p.purchaseDate || p.createdAt).getDay();
        dayTotals[d].purchases += p.grandTotal || 0;
      });

      setChartData(dayTotals);
    } catch (e) {
      console.error('Failed to load dashboard metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const statCards = [
    {
      label: "Today's Sales",
      value: `₹${metrics?.todaySalesTotal?.toLocaleString('en-IN') || '0'}`,
      sub: `${metrics?.todaySalesCount || 0} invoices`,
      icon: TrendingUp,
      trend: 'up' as const,
    },
    {
      label: "Today's Purchases",
      value: `₹${metrics?.todayPurchasesTotal?.toLocaleString('en-IN') || '0'}`,
      sub: `${metrics?.todayPurchasesCount || 0} bills`,
      icon: ShoppingBag,
      trend: 'neutral' as const,
    },
    {
      label: 'Stock Valuation',
      value: `₹${metrics?.totalStockValuation?.toLocaleString('en-IN') || '0'}`,
      sub: `${metrics?.totalProducts || 0} products`,
      icon: PackageCheck,
      trend: 'neutral' as const,
    },
    {
      label: 'Low Stock',
      value: metrics?.lowStockCount || 0,
      sub: 'need reorder',
      icon: AlertTriangle,
      trend: (metrics?.lowStockCount || 0) > 0 ? 'danger' as const : 'neutral' as const,
    },
  ];

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">Revenue, inventory & financial overview</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchMetrics}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Quick Actions — inline bar, not floating pills */}
          <div className="px-6 pb-3 flex items-center gap-2">
            <Link
              href="/billing"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Sale
            </Link>
            <Link
              href="/purchases/new"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-md text-xs border border-gray-200 hover:border-gray-300 transition"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              New Purchase
            </Link>
            <Link
              href="/products/new"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-md text-xs border border-gray-200 hover:border-gray-300 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Medicine
            </Link>
            <Link
              href="/reports"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-md text-xs border border-gray-200 hover:border-gray-300 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Reports
            </Link>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden mb-6">
            {statCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={i} className="bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{card.label}</span>
                    <Icon className={`w-4 h-4 ${card.trend === 'danger' ? 'text-red-500' : 'text-gray-400'}`} />
                  </div>
                  <div className={`text-2xl font-bold font-mono tracking-tight ${card.trend === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>
                    {card.value}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 font-medium">{card.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Chart */}
            <div className="lg:col-span-2 border border-gray-200 rounded-lg bg-white">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Weekly Revenue vs Procurement</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Sales and purchase comparison by day</p>
              </div>
              <div className="px-4 py-4">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6b7280" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#6b7280" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb', 
                          borderRadius: '6px', 
                          color: '#111827', 
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.05)' 
                        }}
                      />
                      <Area type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
                      <Area type="monotone" dataKey="purchases" stroke="#9ca3af" strokeWidth={1.5} fillOpacity={1} fill="url(#purchGrad)" strokeDasharray="4 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-3 px-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                    <span className="w-3 h-[2px] bg-emerald-600 rounded-full"></span>
                    Sales
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                    <span className="w-3 h-[2px] bg-gray-400 rounded-full" style={{borderTop: '2px dashed #9ca3af', height: 0}}></span>
                    Purchases
                  </div>
                </div>
              </div>
            </div>

            {/* Inventory Health */}
            <div className="border border-gray-200 rounded-lg bg-white flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Inventory Health</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Stock status overview</p>
              </div>
              <div className="flex-1 p-4 space-y-0">
                {/* Metric rows — not cards, just clean rows */}
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-sm text-gray-700 font-medium">Active SKUs</span>
                  </div>
                  <span className="text-sm font-semibold font-mono text-gray-900">{metrics?.totalSKUs || 0}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span className="text-sm text-gray-700 font-medium">Low Stock Warnings</span>
                  </div>
                  <span className="text-sm font-semibold font-mono text-amber-600">{metrics?.lowStockCount || 0}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    <span className="text-sm text-gray-700 font-medium">Out of Stock</span>
                  </div>
                  <span className="text-sm font-semibold font-mono text-red-600">{metrics?.outOfStockCount || 0}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                    <span className="text-sm text-gray-700 font-medium">Total Products</span>
                  </div>
                  <span className="text-sm font-semibold font-mono text-gray-900">{metrics?.totalProducts || 0}</span>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 mt-auto">
                <Link
                  href="/billing"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md flex items-center justify-center gap-2 transition text-sm"
                >
                  Open Billing POS
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
