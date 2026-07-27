'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import {
  Search,
  Plus,
  Edit2,
  Snowflake,
  Trash2,
  Boxes,
  Eye,
  RefreshCw,
} from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import type { Product, InventoryItem, InventoryBatch, ProductType } from '@/types';
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
  StatusChip,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  TableSkeleton,
  useToast,
  useConfirm,
  Pagination,
} from '@/components/ui';

const EMPTY_FORM = {
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
  lowStockThreshold: 5,
};

const TYPE_TABS = [
  { id: 'ALL', label: 'All Forms' },
  { id: 'TABLET', label: 'Tablets' },
  { id: 'CAPSULE', label: 'Capsules' },
  { id: 'SYRUP', label: 'Syrups' },
  { id: 'INJECTION', label: 'Injections' },
  { id: 'COLD', label: 'Cold Storage' },
];

export default function ProductsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { products: cachedProducts, inventory: cachedInventory, loading, refreshData } = useErpData();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [inspectProduct, setInspectProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  useEffect(() => {
    setIsMounted(true);
    setProducts(cachedProducts);
    setInventory(cachedInventory);
  }, [cachedProducts, cachedInventory]);

  // Helper for Title Case
  const toTitleCase = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (m) => m.toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setShowAddModal(false);
      toast.success(editingProduct ? 'Medicine updated' : 'Medicine added');
      setEditingProduct(null);
      await refreshData();
    } catch (err) {
      toast.error('Failed to save product', getApiErrorMessage(err));
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this medicine?',
      message: 'The product will be removed from the catalogue. Existing bills that reference it are not affected.',
      confirmLabel: 'Delete medicine',
    });
    if (!ok) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success('Medicine deleted');
      await refreshData();
    } catch (err) {
      toast.error('Failed to delete product', getApiErrorMessage(err));
    }
  };

  const openEdit = (p: Product) => {
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
      lowStockThreshold: p.lowStockThreshold || 5,
    });
    setShowAddModal(true);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (p.name || '').toLowerCase().includes(q) ||
        (p.genericName || '').toLowerCase().includes(q) ||
        (p.companyName || '').toLowerCase().includes(q);
      const matchesType = typeFilter === 'ALL' || p.productType === typeFilter || (typeFilter === 'COLD' && p.requiresColdStorage);
      return matchesSearch && matchesType;
    });
  }, [products, search, typeFilter]);

  // Any change to the result set should return the operator to the first page.
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  /**
   * The inventory endpoint returns ONE row per product, each carrying its own `batches` array.
   * This previously returned those product-level rows and the modal rendered them as batches,
   * so Batch / Expiry / Available Stock were all `undefined` on screen. Return the real batches.
   */
  const getProductBatches = (productId: string): InventoryBatch[] => {
    const entry = inventory.find((inv) => inv.productId === productId);
    return entry?.batches ?? [];
  };

  const coldCount = products.filter((p) => p.requiresColdStorage).length;
  const visibleRows = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  return (
    <PageMain>
      <PageHeader
        title="Medicine Master Catalog"
        subtitle={`${products.length.toLocaleString('en-IN')} products · ${filteredProducts.length.toLocaleString('en-IN')} listed · ${coldCount} need cold storage (2–8°C)`}
        action={
          <>
            <Button
              variant="outline"
              iconOnly
              onClick={() => refreshData()}
              title="Refresh catalog"
              aria-label="Refresh catalog"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin text-brand')} />
            </Button>
            <Button
              onClick={() => {
                setEditingProduct(null);
                setFormData(EMPTY_FORM);
                setShowAddModal(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add Medicine
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            icon={Search}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by brand name, generic composition, or company…"
            className="flex-1"
            aria-label="Search products"
          />
          <div className="flex items-center gap-1 rounded-md bg-sunken p-1 overflow-x-auto">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                aria-pressed={typeFilter === tab.id}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold whitespace-nowrap transition-colors',
                  typeFilter === tab.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                )}
              >
                {tab.id === 'COLD' ? <Snowflake className="h-3.5 w-3.5 text-info" aria-hidden /> : null}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        {!isMounted || loading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No medicines found"
            message={
              search
                ? `Nothing matches “${search}” in this category.`
                : 'No products in this category yet.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Link
                  href="/products/new"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Medicine
                </Link>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Medicine Brand Name &amp; Salt</TH>
                  <TH className="hidden lg:table-cell">Manufacturer</TH>
                  <TH>Dosage Form</TH>
                  <TH className="hidden md:table-cell">Pack Rule</TH>
                  <TH align="right">MRP</TH>
                  <TH align="right">GST %</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {visibleRows.map((p) => (
                  <TR key={p.id} onClick={() => setInspectProduct(p)} className="group cursor-pointer">
                    <TD>
                      <span className="flex items-center gap-1.5 font-semibold leading-tight transition-colors group-hover:text-brand-hover">
                        {toTitleCase(p.name)}
                        {p.requiresColdStorage ? (
                          <Snowflake className="h-3.5 w-3.5 shrink-0 text-info" aria-label="Cold storage (2–8°C)" />
                        ) : null}
                      </span>
                      <span className="block text-xs text-fg-subtle leading-tight mt-0.5">
                        {p.genericName ? toTitleCase(p.genericName) : 'General Salt'}
                        <span className="font-mono text-[11px] ml-1.5">HSN: {p.hsnCode || '3004'}</span>
                      </span>
                    </TD>

                    <TD className="hidden lg:table-cell text-fg-muted">
                      {toTitleCase(p.companyName || 'Generic')}
                    </TD>

                    <TD>
                      <StatusChip tone="neutral" small>{p.productType}</StatusChip>
                    </TD>

                    <TD className="hidden md:table-cell font-mono text-xs text-fg-muted">
                      1 {p.packUnit || 'Strip'} = {p.packSize || 10} {p.contentUnit || 'Units'}
                    </TD>

                    <TD align="right" className="font-mono font-bold">
                      {formatCurrency(p.mrp || 0)}
                    </TD>

                    <TD align="right" className="font-mono text-fg-muted">
                      {p.gstPercent}%
                    </TD>

                    <TD align="right">
                      <span
                        className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setInspectProduct(p)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                          title="Inspect batches"
                          aria-label={`Inspect batches for ${p.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-info-subtle hover:text-info"
                          title="Edit product"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(p.id, e)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                          title="Delete product"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {filteredProducts.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filteredProducts.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </Card>

      {/* INSPECT PRODUCT MODAL */}
      <Modal
        open={!!inspectProduct}
        onClose={() => setInspectProduct(null)}
        title={inspectProduct ? toTitleCase(inspectProduct.name) : ''}
        subtitle={inspectProduct ? toTitleCase(inspectProduct.companyName || 'Generic') : undefined}
        size="lg"
      >
        {inspectProduct ? (
          <div className="p-5 space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">Generic Salt</dt>
                <dd className="mt-0.5 text-sm font-bold text-fg truncate">
                  {toTitleCase(inspectProduct.genericName || 'General')}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">Manufacturer</dt>
                <dd className="mt-0.5 text-sm font-bold text-fg truncate">
                  {toTitleCase(inspectProduct.companyName || 'Generic')}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-raised px-3 py-2.5">
                <dt className="text-xs font-semibold text-fg-subtle">MRP / Pack</dt>
                <dd className="mt-0.5 text-sm font-bold text-brand font-mono">
                  {formatCurrency(inspectProduct.mrp || 0)}
                </dd>
              </div>
            </dl>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-fg-muted mb-2">
                Active Inventory Stock Batches
              </h4>
              {getProductBatches(inspectProduct.id).length > 0 ? (
                <div className="rounded-md border border-line overflow-hidden">
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Batch</TH>
                          <TH>Expiry</TH>
                          <TH align="right">MRP</TH>
                          <TH align="right">Available Stock</TH>
                        </tr>
                      </THead>
                      <tbody>
                        {getProductBatches(inspectProduct.id).map((b, idx) => (
                          <TR key={idx}>
                            <TD className="font-mono font-bold">{b.batchNumber}</TD>
                            <TD className="text-fg-muted">{formatDate(b.expiryDate)}</TD>
                            <TD align="right" className="font-mono">{formatCurrency(b.mrp)}</TD>
                            <TD align="right" className="font-mono font-bold text-brand">
                              {b.quantity} Units
                            </TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                </div>
              ) : (
                <p className="rounded-md border border-line bg-raised px-3 py-6 text-center text-sm text-fg-subtle">
                  No active stock batches in inventory.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ADD / EDIT MODAL */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingProduct ? 'Edit Medicine' : 'Add New Medicine'}
        subtitle={editingProduct ? editingProduct.name : 'Create a catalogue entry'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="product-form">
              Save Product
            </Button>
          </div>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Brand Name" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. SINAREST TABLET"
              className="font-semibold"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Generic Composition">
              <Input
                type="text"
                value={formData.genericName}
                onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                placeholder="Paracetamol, Phenylephrine"
              />
            </Field>
            <Field label="Company / Manufacturer">
              <Input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                placeholder="Centaur Pharma"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Default MRP / Pack (₹)">
              <Input
                type="number"
                step="any"
                min="0"
                value={formData.mrp || ''}
                onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="font-mono font-semibold"
              />
            </Field>
            <Field label="Default Purchase Rate / Pack (₹)">
              <Input
                type="number"
                step="any"
                min="0"
                value={formData.purchaseRate || ''}
                onChange={(e) => setFormData({ ...formData, purchaseRate: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="font-mono font-semibold"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Dosage Form">
              <Select
                value={formData.productType}
                onChange={(e) => setFormData({ ...formData, productType: e.target.value as ProductType })}
              >
                <option value="TABLET">Tablet</option>
                <option value="CAPSULE">Capsule</option>
                <option value="SYRUP">Syrup</option>
                <option value="INJECTION">Injection</option>
                <option value="CREAM">Cream</option>
                <option value="DROPS">Drops</option>
                <option value="OINTMENT">Ointment</option>
                <option value="POWDER">Powder</option>
                <option value="OTHERS">Others</option>
              </Select>
            </Field>
            <Field label="HSN Code">
              <Input
                type="text"
                value={formData.hsnCode}
                onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                placeholder="3004"
                className="font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Pack Size" required>
              <Input
                type="number"
                min="1"
                value={formData.packSize}
                onChange={(e) => setFormData({ ...formData, packSize: parseInt(e.target.value, 10) || 1 })}
                className="font-mono font-semibold"
              />
            </Field>
            <Field label="Pack Unit">
              <Input
                type="text"
                value={formData.packUnit}
                onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                placeholder="Strip"
              />
            </Field>
            <Field label="Content Unit">
              <Input
                type="text"
                value={formData.contentUnit}
                onChange={(e) => setFormData({ ...formData, contentUnit: e.target.value })}
                placeholder="Tablet"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="GST Tax Rate">
              <Select
                value={formData.gstPercent}
                onChange={(e) => setFormData({ ...formData, gstPercent: parseFloat(e.target.value) })}
              >
                <option value={0}>0% GST</option>
                <option value={5}>5% GST</option>
                <option value={12}>12% GST</option>
                <option value={18}>18% GST</option>
                <option value={28}>28% GST</option>
              </Select>
            </Field>
            <Field label="Low Stock Alert Threshold">
              <Input
                type="number"
                min="1"
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseFloat(e.target.value) || 5 })}
                className="font-mono font-semibold"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 rounded-md border border-line bg-raised px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requiresColdStorage}
              onChange={(e) => setFormData({ ...formData, requiresColdStorage: e.target.checked })}
              className="h-4 w-4 accent-brand cursor-pointer"
            />
            <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Snowflake className="h-4 w-4 text-info" aria-hidden />
              Requires cold storage refrigeration
              <span className="font-normal text-fg-subtle">(2–8°C)</span>
            </span>
          </label>
        </form>
      </Modal>
    </PageMain>
  );
}
