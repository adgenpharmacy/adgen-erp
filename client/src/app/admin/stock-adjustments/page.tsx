'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { formatDate, cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/types';
import PageMain from '@/components/layout/PageMain';
import {
  ArrowLeft,
  ShieldAlert,
  History,
  TrendingDown,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusChip,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import type { ChipTone } from '@/components/ui/StatusChip';

type AdjustmentSource = 'MANUAL' | 'LEGACY_IMPORT' | 'RECONCILIATION' | 'PHYSICAL_COUNT';

interface StockAdjustment {
  id: string;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  source: AdjustmentSource;
  createdAt: string;
  product: { name: string; packSize: number; contentUnit?: string | null };
  batch: { batchNumber: string; expiryDate: string; purchaseRate: number };
  user: { name: string; role: string } | null;
}

/** Plain-language labels; the enum names mean nothing to a pharmacist. */
const SOURCE_LABEL: Record<AdjustmentSource, string> = {
  MANUAL: 'Manual correction',
  PHYSICAL_COUNT: 'Physical count',
  RECONCILIATION: 'Rebuilt from bills',
  LEGACY_IMPORT: 'From old app',
};

const SOURCE_TONE: Record<AdjustmentSource, ChipTone> = {
  MANUAL: 'warning',
  PHYSICAL_COUNT: 'success',
  RECONCILIATION: 'info',
  LEGACY_IMPORT: 'neutral',
};

const FILTERS: { id: 'ALL' | AdjustmentSource; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'MANUAL', label: 'Manual' },
  { id: 'PHYSICAL_COUNT', label: 'Physical count' },
  { id: 'RECONCILIATION', label: 'Rebuilt from bills' },
  { id: 'LEGACY_IMPORT', label: 'From old app' },
];

export default function StockAdjustmentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';

  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | AdjustmentSource>('ALL');

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stock-adjustments?limit=1000');
      setRows(res.data || []);
    } catch (err) {
      toast.error('Could not load adjustments', getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const visible = useMemo(
    () => (filter === 'ALL' ? rows : rows.filter((r) => r.source === filter)),
    [rows, filter]
  );

  const stats = useMemo(() => {
    const added = rows.filter((r) => r.quantityDelta > 0);
    const removed = rows.filter((r) => r.quantityDelta < 0);
    return {
      total: rows.length,
      added: added.reduce((s, r) => s + r.quantityDelta, 0),
      removed: removed.reduce((s, r) => s + Math.abs(r.quantityDelta), 0),
      // Legacy rows count too: they are the owner's own corrections, just made in the old
      // app. Excluding them reported "0 done by hand" while ten such rows sat in the table.
      byHand: rows.filter(
        (r) => r.source === 'MANUAL' || r.source === 'PHYSICAL_COUNT' || r.source === 'LEGACY_IMPORT'
      ).length,
    };
  }, [rows]);

  if (!isOwner) {
    return (
      <PageMain>
        <PageHeader title="Stock Adjustments" subtitle="Audit trail" />
        <Card className="p-6 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div>
            <h2 className="text-sm font-bold text-fg">Owner access required</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Stock adjustment history is limited to the pharmacy owner.
            </p>
          </div>
        </Card>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Every change to stock that was not a purchase or a sale"
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Admin
              </Button>
            </Link>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card className="p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">
            Total adjustments
          </span>
          <div className="mt-1 text-2xl font-black font-mono text-fg">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">
            Units added
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black font-mono text-brand">
            <TrendingUp className="h-4 w-4" aria-hidden />
            {stats.added.toLocaleString('en-IN')}
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">
            Units removed
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black font-mono text-danger">
            <TrendingDown className="h-4 w-4" aria-hidden />
            {stats.removed.toLocaleString('en-IN')}
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-subtle">
            Done by hand
          </span>
          <div className="mt-1 text-2xl font-black font-mono text-fg">{stats.byHand}</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => {
          const count = f.id === 'ALL' ? rows.length : rows.filter((r) => r.source === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors',
                filter === f.id
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'bg-surface text-fg-muted border-line hover:bg-hover hover:text-fg'
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={History}
          title="No adjustments recorded"
          message="Stock has only ever changed through purchases and sales."
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Medicine</TH>
                <TH>Batch</TH>
                <TH className="text-right">Before</TH>
                <TH className="text-right">After</TH>
                <TH className="text-right">Change</TH>
                <TH>Why</TH>
                <TH>By</TH>
              </TR>
            </THead>
            <tbody>
              {visible.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-fg-muted">{formatDate(r.createdAt)}</TD>
                  <TD className="font-semibold text-fg">{r.product.name}</TD>
                  <TD className="font-mono text-xs text-fg-muted">
                    {r.batch.batchNumber || 'DEFAULT'}
                    <span className="block text-[10px] text-fg-subtle">
                      exp {new Date(r.batch.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' })}
                    </span>
                  </TD>
                  <TD className="text-right font-mono">{r.previousQuantity}</TD>
                  <TD className="text-right font-mono">{r.newQuantity}</TD>
                  <TD
                    className={cn(
                      'text-right font-mono font-bold',
                      r.quantityDelta < 0 ? 'text-danger' : 'text-brand'
                    )}
                  >
                    {r.quantityDelta > 0 ? '+' : ''}
                    {r.quantityDelta}
                  </TD>
                  <TD className="max-w-88">
                    <StatusChip tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</StatusChip>
                    <span className="mt-1 block text-xs text-fg-muted">{r.reason}</span>
                  </TD>
                  <TD className="text-fg-muted">{r.user?.name ?? 'System'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </PageMain>
  );
}
