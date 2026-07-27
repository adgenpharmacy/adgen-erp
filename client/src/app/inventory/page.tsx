'use client';

import { useState, useEffect, useMemo } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { formatDate, formatPackQuantity, formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Package,
  AlertTriangle,
  Eye,
  Edit,
  Boxes,
  IndianRupee,
  Clock,
  FileText,
  ExternalLink,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import PageMain from '@/components/layout/PageMain';
import type { InventoryItem, InventoryBatch } from '@/types';
import { getApiErrorMessage } from '@/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Modal,
  PageHeader,
  StatCard,
  StatusChip,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  TableSkeleton,
  useToast,
  Pagination,
} from '@/components/ui';
import { compactINR } from '@/lib/chart';

const FILTER_TABS = [
  { id: 'IN_STOCK', label: 'In Stock' },
  { id: 'ALL', label: 'All' },
  { id: 'LOW', label: 'Low Stock' },
  { id: 'EXPIRING', label: 'Expiring <90d' },
  { id: 'OUT', label: 'Out of Stock' },
] as const;

export default function InventoryPage() {
  const toast = useToast();
  const { inventory: cachedInventory, loading, refreshData } = useErpData();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'IN_STOCK' | 'LOW' | 'EXPIRING' | 'OUT'>('IN_STOCK');
  const [sortBy, setSortBy] = useState<'NAME' | 'STOCK_HIGH' | 'STOCK_LOW' | 'VALUATION'>('STOCK_HIGH');
  const [inspectInventory, setInspectInventory] = useState<InventoryItem | null>(null);

  // Manual Stock Adjustment State
  const [adjustModalItem, setAdjustModalItem] = useState<{ inv: InventoryItem; batch?: InventoryBatch } | null>(null);
  const [adjType, setAdjType] = useState<'SET_QUANTITY' | 'ADD_STOCK' | 'SUBTRACT_STOCK'>('SET_QUANTITY');
  const [adjUnitType, setAdjUnitType] = useState<'LOOSE_UNITS' | 'PACKS'>('PACKS');
  const [adjVal, setAdjVal] = useState<string>('');
  const [adjReason, setAdjReason] = useState<string>('PHYSICAL_AUDIT_COUNT');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  useEffect(() => {
    setIsMounted(true);
    setInventory(cachedInventory);
  }, [cachedInventory]);

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalItem || !adjVal || isNaN(parseFloat(adjVal))) return;

    try {
      setIsSubmittingAdj(true);
      const packSize = adjustModalItem.inv.packSize || 1;
      const numInput = parseFloat(adjVal);
      const contentUnits = adjUnitType === 'PACKS' ? numInput * packSize : numInput;

      await api.put('/inventory/adjust', {
        batchId: adjustModalItem.batch?.id,
        productId: adjustModalItem.inv.id || adjustModalItem.inv.productId,
        newQuantity: contentUnits,
        adjustmentType: adjType,
        reason: adjReason,
      });

      invalidateCatalogCache();
      await refreshData();
      setAdjustModalItem(null);
      setInspectInventory(null);
      setAdjVal('');
      toast.success('Stock adjusted');
    } catch (err) {
      toast.error('Failed to adjust stock', getApiErrorMessage(err));
    } finally {
      setIsSubmittingAdj(false);
    }
  };

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

      const isExp = (inv.batches || []).some((b) => {
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
          return (inv.batches || []).some((b) => {
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

  // Any change to the result set should return the operator to the first page.
  useEffect(() => { setPage(1); }, [search, filterType, sortBy]);

  const visibleRows = filteredInventory.slice((page - 1) * pageSize, page * pageSize);

  return (
    <PageMain>
      <PageHeader
        title="Stock & Batch Inventory"
        subtitle={`${stats.totalProducts.toLocaleString('en-IN')} catalogue items · showing ${visibleRows.length.toLocaleString('en-IN')} of ${filteredInventory.length.toLocaleString('en-IN')} matches`}
        action={
          <Button
            variant="outline"
            iconOnly
            onClick={() => refreshData()}
            title="Refresh stock counts"
            aria-label="Refresh stock counts"
          >
            <RefreshCw className={cn('h-4 w-4', isMounted && loading && 'animate-spin text-brand')} />
          </Button>
        }
      />

      {/* Valuation & alert summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRP Value"
          value={compactINR(stats.totalMrpValue)}
          sublabel="Gross value if sold at MRP"
          icon={IndianRupee}
          tone="brand"
        />
        <StatCard
          label="Cost Value"
          value={compactINR(stats.totalCostValue)}
          sublabel="Capital invested at purchase rate"
          icon={Boxes}
          tone="info"
        />
        <StatCard
          label="Expiring < 90d"
          value={stats.expiringCount}
          sublabel="Batches nearing expiry"
          icon={Clock}
          tone="danger"
          emphasizeValue
        />
        <StatCard
          label="Low Stock"
          value={stats.lowStockCount}
          sublabel={`${stats.outOfStockCount.toLocaleString('en-IN')} out of stock`}
          icon={AlertTriangle}
          tone="warn"
          emphasizeValue
        />
      </div>

      {/* Filters */}
      <Card className="mt-4 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            icon={Search}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by brand name, generic composition, or manufacturer…"
            className="flex-1"
            aria-label="Search inventory"
          />

          <div className="flex items-center gap-1 rounded-md bg-sunken p-1 overflow-x-auto">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                aria-pressed={filterType === tab.id}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-xs font-bold whitespace-nowrap transition-colors',
                  filterType === tab.id
                    ? 'bg-surface text-fg shadow-card'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort inventory"
            className="lg:w-48"
          >
            <option value="STOCK_HIGH">Stock: high → low</option>
            <option value="STOCK_LOW">Stock: low → high</option>
            <option value="NAME">Name: A → Z</option>
            <option value="VALUATION">Valuation: high → low</option>
          </Select>
        </div>
      </Card>

      {/* Stock table */}
      <Card className="mt-4 overflow-hidden">
        {!isMounted || loading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : filteredInventory.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No stock records found"
            message={
              search
                ? `Nothing matches “${search}” in this filter.`
                : 'No products match the selected filter.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setFilterType('ALL')}>
                  Show all items
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Medicine Product &amp; Salt</TH>
                  <TH>Stock</TH>
                  <TH>Expiry</TH>
                  <TH align="center">Batches</TH>
                  <TH className="hidden lg:table-cell">Manufacturer</TH>
                  <TH align="right">Valuation</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {visibleRows.map((inv) => {
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
                    <TR
                      key={inv.id}
                      className={cn(stripeClass, 'group cursor-pointer')}
                      onClick={() => setInspectInventory(inv)}
                    >
                      <TD>
                        <span className="block font-semibold leading-tight transition-colors group-hover:text-brand-hover">
                          {toTitleCase(inv.productName || inv.name)}
                        </span>
                        <span className="block text-xs text-fg-subtle leading-tight mt-0.5">
                          {inv.genericName ? toTitleCase(inv.genericName) : 'General Composition'}
                          <span className="font-mono text-[11px] ml-1.5">
                            {inv.packSize} {inv.contentUnit}/{inv.packUnit}
                          </span>
                        </span>
                      </TD>

                      <TD>
                        <StatusChip tone={isOut ? 'error' : isLow ? 'warning' : 'success'} small className="font-mono">
                          {formatPackQuantity(stock, inv.packSize, inv.packUnit, inv.contentUnit)}
                        </StatusChip>
                        <span className="mt-1.5 block h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              isOut ? 'bg-danger' : isLow ? 'bg-warn' : 'bg-brand'
                            )}
                            style={{ width: `${Math.min(100, (stock / 50) * 100)}%` }}
                          />
                        </span>
                      </TD>

                      <TD>
                        <StatusChip tone={isExpired ? 'error' : isExpiringSoon ? 'warning' : 'neutral'} small>
                          {isExpired ? 'Expired' : `${daysLeft}d left`}
                        </StatusChip>
                      </TD>

                      <TD align="center">
                        <StatusChip tone={batches.length > 0 ? 'success' : 'neutral'} small>
                          {batches.length > 0 ? `${batches.length} batch` : 'No batch'}
                        </StatusChip>
                      </TD>

                      <TD className="hidden lg:table-cell text-fg-muted">
                        {toTitleCase(inv.companyName || 'Generic')}
                      </TD>

                      <TD align="right" className="font-mono">
                        <span className="block font-bold" title="MRP valuation">
                          {formatCurrency(inv.totalMrpValue || stock * (inv.mrp || 0))}
                        </span>
                        <span className="block text-xs text-fg-subtle" title="Purchase cost valuation">
                          Cost: {formatCurrency(inv.totalCostValue || stock * (inv.purchaseRate || 0))}
                        </span>
                      </TD>

                      <TD align="right">
                        <span className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectInventory(inv);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            Batches
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              const firstBatch = (inv.batches || [])[0];
                              setAdjustModalItem({ inv, batch: firstBatch });
                              setAdjVal('');
                            }}
                          >
                            <Edit className="h-3.5 w-3.5 text-warn" aria-hidden />
                            Adjust
                          </Button>
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {filteredInventory.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filteredInventory.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </Card>

      {/* INSPECT INVENTORY MODAL */}
      <Modal
        open={!!inspectInventory}
        onClose={() => setInspectInventory(null)}
        title={inspectInventory ? toTitleCase(inspectInventory.productName || inspectInventory.name) : ''}
        subtitle={inspectInventory ? toTitleCase(inspectInventory.companyName || 'Generic') : undefined}
        size="lg"
      >
        {inspectInventory ? (
          <div className="p-5 space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">Manufacturer</dt>
                <dd className="mt-0.5 text-sm font-bold text-fg truncate">
                  {toTitleCase(inspectInventory.companyName || 'Generic')}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">Total Stock</dt>
                <dd className="mt-0.5 text-sm font-bold text-brand font-mono">
                  {formatPackQuantity(inspectInventory.systemStock, inspectInventory.packSize, inspectInventory.packUnit, inspectInventory.contentUnit)}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">Stock Valuation</dt>
                <dd className="mt-0.5 text-sm font-bold text-fg font-mono">
                  {formatCurrency(inspectInventory.totalMrpValue || 0)}
                </dd>
              </div>
            </dl>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">Active Batches</h4>
              {(inspectInventory.batches || []).length === 0 ? (
                <p className="rounded-md border border-line bg-raised px-3 py-6 text-center text-sm text-fg-subtle">
                  No active batches for this product.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(inspectInventory.batches || []).map((b, bIdx) => (
                    <li
                      key={bIdx}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-raised px-3 py-2.5"
                    >
                      <div>
                        <span className="block font-mono text-sm font-bold text-fg">Batch {b.batchNumber}</span>
                        <span className="block text-xs text-fg-subtle">Expires {formatDate(b.expiryDate)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono">
                          <span className="block text-sm font-bold text-brand">
                            {formatPackQuantity(b.quantity, inspectInventory.packSize, inspectInventory.packUnit, inspectInventory.contentUnit)}
                          </span>
                          <span className="block text-xs text-fg-muted">MRP {formatCurrency(b.mrp)}</span>
                        </div>
                        {/* Every batch is created by a purchase bill, so jump straight to the
                            bill that brought this stock in — useful for checking a rate or expiry
                            against what the supplier actually invoiced. */}
                        {b.purchaseBillId ? (
                          <Link
                            href={`/purchases?bill=${b.purchaseBillId}`}
                            title="Open the purchase bill this batch came from"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-hover"
                          >
                            <FileText className="h-3.5 w-3.5 text-info" aria-hidden />
                            Bill
                            <ExternalLink className="h-3 w-3 text-fg-subtle" aria-hidden />
                          </Link>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAdjustModalItem({ inv: inspectInventory, batch: b });
                            setAdjVal('');
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 text-warn" aria-hidden />
                          Adjust
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* MANUAL STOCK ADJUSTMENT MODAL */}
      <Modal
        open={!!adjustModalItem}
        onClose={() => setAdjustModalItem(null)}
        title={adjustModalItem ? `Adjust Stock — ${toTitleCase(adjustModalItem.inv.productName || adjustModalItem.inv.name)}` : ''}
        subtitle={
          adjustModalItem?.batch
            ? `Batch ${adjustModalItem.batch.batchNumber} · current ${formatPackQuantity(adjustModalItem.batch.quantity, adjustModalItem.inv.packSize, adjustModalItem.inv.packUnit, adjustModalItem.inv.contentUnit)}`
            : undefined
        }
        size="md"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setAdjustModalItem(null)}>
              Cancel
            </Button>
            <Button type="submit" form="adjust-form" className="flex-1" loading={isSubmittingAdj}>
              Confirm Adjustment
            </Button>
          </div>
        }
      >
        {adjustModalItem ? (
          <form id="adjust-form" onSubmit={handleStockAdjustment} className="p-5 space-y-4">
            <Field label="Adjustment Action">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['SET_QUANTITY', 'Set exact', 'bg-warn text-white border-warn'],
                    ['ADD_STOCK', '+ Add', 'bg-brand text-brand-fg border-brand'],
                    ['SUBTRACT_STOCK', '− Subtract', 'bg-danger text-white border-danger'],
                  ] as const
                ).map(([value, label, activeClass]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAdjType(value)}
                    aria-pressed={adjType === value}
                    className={cn(
                      'h-10 rounded-md border text-xs font-bold transition-colors',
                      adjType === value ? activeClass : 'bg-raised border-line text-fg-muted hover:bg-hover'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Unit Designation">
                <Select
                  value={adjUnitType}
                  onChange={(e) => setAdjUnitType(e.target.value as 'LOOSE_UNITS' | 'PACKS')}
                >
                  <option value="PACKS">
                    {adjustModalItem.inv.packUnit || 'Strips / Packs'} (×{adjustModalItem.inv.packSize || 1})
                  </option>
                  <option value="LOOSE_UNITS">{adjustModalItem.inv.contentUnit || 'Loose Units (Tablets)'}</option>
                </Select>
              </Field>

              <Field label="Quantity Value" required>
                <Input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 10"
                  value={adjVal}
                  onChange={(e) => setAdjVal(e.target.value)}
                  className="font-mono font-semibold"
                />
              </Field>
            </div>

            <Field label="Adjustment Reason">
              <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>
                <option value="PHYSICAL_AUDIT_COUNT">Physical Audit Count Verification</option>
                <option value="DAMAGED_EXPIRED">Damaged / Expired Removal</option>
                <option value="FOUND_EXTRA">Unrecorded Supplier Sample / Found Extra</option>
                <option value="CORRECTION">General Inventory Correction</option>
              </Select>
            </Field>
          </form>
        ) : null}
      </Modal>
    </PageMain>
  );
}
