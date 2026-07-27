'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useErpData } from '@/context/ErpDataContext';
import {
  TrendingUp,
  ShoppingBag,
  PackageCheck,
  AlertTriangle,
  RefreshCw,
  Plus,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button, Card, CardHeader, StatCard, EmptyState, PageHeader, StatCardSkeleton } from '@/components/ui';
import PageMain from '@/components/layout/PageMain';
import type { Sale } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { SERIES, AXIS, TOOLTIP_STYLE, compactINR } from '@/lib/chart';

interface DashboardMetrics {
  todaySales: number;
  todayBillsCount: number;
  monthlySales: number;
  lowStockItemsCount: number;
  outOfStockCount: number;
  inStockCount: number;
  totalInventoryItems: number;
  recentSales: Sale[];
}

interface ChartBucket {
  key: string;
  name: string;
  sales: number;
  purchases: number;
}

export default function Dashboard() {
  const { sales, purchases, inventory, products, loading, refreshData } = useErpData();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<ChartBucket[]>([]);

  useEffect(() => {
    // Compute metrics instantly from cached global state
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // SalesBill has no `saleDate` column — createdAt is the only timestamp.
    const saleDateOf = (s: Sale) => new Date(s.createdAt);

    const todaySales = sales.filter((s) => saleDateOf(s) >= startOfToday);
    const todaySalesTotal = todaySales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);

    // Revenue for the current calendar month — not all history.
    const monthSalesTotal = sales
      .filter((s) => saleDateOf(s) >= startOfMonth)
      .reduce((acc, s) => acc + (s.grandTotal || 0), 0);

    // Separate "needs reordering" from "never stocked". The imported catalog carries thousands of
    // products with no batches at all; counting those as low stock buried the genuine reorder list.
    const lowStockCount = inventory.filter((inv) => {
      const stock = inv.systemStock || 0;
      return stock > 0 && stock <= (inv.lowStockThreshold || 5);
    }).length;

    const outOfStockCount = inventory.filter((inv) => (inv.systemStock || 0) <= 0).length;

    setMetrics({
      todaySales: todaySalesTotal,
      todayBillsCount: todaySales.length,
      monthlySales: monthSalesTotal,
      lowStockItemsCount: lowStockCount,
      outOfStockCount,
      inStockCount: inventory.filter((inv) => (inv.systemStock || 0) > 0).length,
      totalInventoryItems: inventory.length || products.length,
      recentSales: [...sales]
        .sort((a, b) => saleDateOf(b).getTime() - saleDateOf(a).getTime())
        .slice(0, 5),
    });

    // Build the trailing 7 calendar days, so the chart matches its "Last 7 Days" label.
    // Bucketing by day-of-week folded every past week into the same seven columns.
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets: ChartBucket[] = [];
    const indexByKey = new Map<string, number>();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(startOfToday.getDate() - i);
      const key = d.toDateString();
      indexByKey.set(key, buckets.length);
      buckets.push({ key, name: dayLabels[d.getDay()], sales: 0, purchases: 0 });
    }

    const addTo = (raw: string, field: 'sales' | 'purchases', amount: number) => {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);
      const idx = indexByKey.get(d.toDateString());
      if (idx !== undefined) buckets[idx][field] += amount;
    };

    sales.forEach((s) => addTo(s.createdAt, 'sales', s.grandTotal || 0));
    purchases.forEach((p) => addTo(p.purchaseDate || p.createdAt, 'purchases', p.grandTotal || 0));

    setChartData(buckets);
  }, [sales, purchases, inventory, products]);

  // Week totals double as the chart's direct labels, so identity never rests on colour alone.
  const weekTotals = useMemo(
    () =>
      chartData.reduce(
        (acc, d) => ({ sales: acc.sales + d.sales, purchases: acc.purchases + d.purchases }),
        { sales: 0, purchases: 0 }
      ),
    [chartData]
  );

  const showSkeleton = loading && !metrics;

  return (
    <PageMain>
      <PageHeader
        title="Pharmacy Dashboard"
        subtitle="Real-time overview of sales, stock alerts, and financial performance"
        action={
          <>
            <Button
              variant="outline"
              size="md"
              iconOnly
              onClick={() => refreshData()}
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin text-brand' : 'h-4 w-4'} />
            </Button>
            <Link
              href="/billing"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Sale
            </Link>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Today's Sales"
              value={formatCurrency(metrics?.todaySales || 0)}
              sublabel={`${metrics?.todayBillsCount || 0} bills generated today`}
              icon={TrendingUp}
              tone="brand"
              href="/sales"
            />
            <StatCard
              label="Monthly Revenue"
              value={formatCurrency(metrics?.monthlySales || 0)}
              sublabel={new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              icon={ShoppingBag}
              tone="info"
              href="/sales"
            />
            <StatCard
              label="Stock Catalog"
              value={(metrics?.totalInventoryItems || 0).toLocaleString('en-IN')}
              sublabel={`${(metrics?.inStockCount || 0).toLocaleString('en-IN')} in stock`}
              icon={PackageCheck}
              tone="accent"
              href="/inventory"
            />
            <StatCard
              label="Low Stock Alerts"
              value={metrics?.lowStockItemsCount || 0}
              sublabel={`Running low · ${(metrics?.outOfStockCount || 0).toLocaleString('en-IN')} out of stock`}
              icon={AlertTriangle}
              tone="warn"
              emphasizeValue
              href="/inventory"
            />
          </>
        )}
      </div>

      {/* Trend + recent activity */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader
            title="Sales & Purchases Trend"
            subtitle="Last 7 days"
            action={
              <div className="flex items-center gap-4">
                {(
                  [
                    ['Sales', SERIES.sales, weekTotals.sales],
                    ['Purchases', SERIES.purchases, weekTotals.purchases],
                  ] as const
                ).map(([name, color, total]) => (
                  <span key={name} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    <span className="text-xs font-semibold text-fg-muted">{name}</span>
                    <span className="text-xs font-bold text-fg tabular-nums">{compactINR(total)}</span>
                  </span>
                ))}
              </div>
            }
          />
          <div className="h-64 w-full p-4 pr-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.sales} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={SERIES.sales} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillPurchases" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.purchases} stopOpacity={0.16} />
                    <stop offset="95%" stopColor={SERIES.purchases} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={AXIS.grid} />
                <XAxis
                  dataKey="name"
                  stroke={AXIS.stroke}
                  fontSize={AXIS.fontSize}
                  tickLine={false}
                  axisLine={false}
                  dy={4}
                />
                <YAxis
                  stroke={AXIS.stroke}
                  fontSize={AXIS.fontSize}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={compactINR}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  cursor={{ stroke: AXIS.stroke, strokeWidth: 1, strokeDasharray: '3 3' }}
                  formatter={(val, name) => [formatCurrency(Number(val ?? 0)), String(name)]}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke={SERIES.sales}
                  strokeWidth={2}
                  fill="url(#fillSales)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="purchases"
                  name="Purchases"
                  stroke={SERIES.purchases}
                  strokeWidth={2}
                  fill="url(#fillPurchases)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title="Recent Sales"
            action={
              <Link
                href="/sales"
                className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-hover"
              >
                View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          {(metrics?.recentSales || []).length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No sales yet"
              message="Invoices raised at the counter will appear here."
              action={
                <Link
                  href="/billing"
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-xs font-semibold text-brand-fg hover:bg-brand-hover"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  New Sale
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line-light">
              {(metrics?.recentSales || []).map((sale) => (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">
                      {sale.customerName || 'Walk-in Customer'}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {new Date(sale.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-brand">
                    {formatCurrency(sale.grandTotal || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageMain>
  );
}
