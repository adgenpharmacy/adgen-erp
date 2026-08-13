'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { invalidateCatalogCache } from '@/lib/catalog-cache';
import type { Product } from '@/types';
import { getApiErrorMessage } from '@/types';
import { Button, Field, Input, Select, Modal, useToast } from '@/components/ui';

/**
 * Category options, matching the ProductType enum in the Prisma schema exactly.
 *
 * The full Products form offers only eight of the nine and folds OINTMENT into the CREAM label,
 * which leaves imported OINTMENT rows describing themselves as something the form cannot express.
 * Listed in full here.
 */
const PRODUCT_TYPES = [
  { value: 'TABLET', label: 'Tablet' },
  { value: 'CAPSULE', label: 'Capsule' },
  { value: 'SYRUP', label: 'Syrup' },
  { value: 'INJECTION', label: 'Injection' },
  { value: 'CREAM', label: 'Cream' },
  { value: 'OINTMENT', label: 'Ointment' },
  { value: 'DROPS', label: 'Drops' },
  { value: 'POWDER', label: 'Powder' },
  { value: 'OTHERS', label: 'Others' },
] as const;

/**
 * The pack and content units that go with a dosage form.
 *
 * Picking "Syrup" and leaving the units reading "Strip of Tablet" describes a bottle of medicine
 * as a strip of tablets, and that is what the stock screens and the invoice then print. Changing
 * the category moves the units with it; either can still be overridden underneath.
 */
const UNITS_FOR_TYPE: Record<string, { packUnit: string; contentUnit: string }> = {
  TABLET: { packUnit: 'Strip', contentUnit: 'Tablet' },
  CAPSULE: { packUnit: 'Strip', contentUnit: 'Capsule' },
  SYRUP: { packUnit: 'Bottle', contentUnit: 'ml' },
  INJECTION: { packUnit: 'Vial', contentUnit: 'ml' },
  CREAM: { packUnit: 'Tube', contentUnit: 'gm' },
  OINTMENT: { packUnit: 'Tube', contentUnit: 'gm' },
  DROPS: { packUnit: 'Bottle', contentUnit: 'Drop' },
  POWDER: { packUnit: 'Packet', contentUnit: 'gm' },
  OTHERS: { packUnit: 'Packet', contentUnit: 'Unit' },
};

/**
 * Create a medicine without leaving the bill being entered.
 *
 * Six lines into a purchase, the seventh medicine turns out not to be in the catalogue. The only
 * way out was to abandon the bill, add the product on the Products screen, come back and start
 * again — so this creates it in place and hands it straight back to the caller to be selected.
 *
 * Short form, but not shorter than the catalogue needs. Category and division used to be missing
 * from it entirely, and since the server falls back to the column defaults for anything it is not
 * sent, every medicine added mid-purchase was filed as a TABLET on GENERAL OTC — a syrup created
 * this way sat under the Tablets filter and printed as one. They are asked for here instead.
 */
export default function QuickAddProductModal({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  /*
   * Seeded from the search text that came up empty. Read once at mount rather than synced from
   * the prop by an effect — the caller mounts this fresh each time it opens, so the initial
   * value is always current and the operator's typing is never overwritten mid-edit.
   */
  const [form, setForm] = useState(() => ({
    name: initialName?.trim() || '',
    genericName: '',
    companyName: '',
    productType: 'TABLET',
    division: 'GENERAL',
    packSize: 10,
    packUnit: 'Strip',
    contentUnit: 'Tablet',
    gstPercent: 5,
    mrp: 0,
    purchaseRate: 0,
    hsnCode: '3004',
  }));

  useEffect(() => {
    const id = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Category carries its usual units along with it; both remain editable below. */
  const setProductType = (value: string) => {
    const units = UNITS_FOR_TYPE[value] ?? UNITS_FOR_TYPE.OTHERS;
    setForm((f) => ({ ...f, productType: value, packUnit: units.packUnit, contentUnit: units.contentUnit }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name required', 'Enter the medicine name.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<Product>('/products', {
        ...form,
        name: form.name.trim(),
        genericName: form.genericName.trim() || null,
        companyName: form.companyName.trim() || null,
      });
      // The catalogue cache is what the search box reads, so it has to drop or the new
      // medicine stays invisible for up to its TTL — exactly when it is needed.
      invalidateCatalogCache();
      toast.success('Medicine added', `${res.data.name} is now in the catalogue.`);
      onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error('Could not add the medicine', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a new medicine"
      subtitle="It is added to the catalogue and selected on this line"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Add &amp; select</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        <Field label="Medicine name" required className="sm:col-span-2">
          <Input
            ref={nameRef}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="e.g. DOLO 650"
          />
        </Field>

        <Field label="Generic salt composition" className="sm:col-span-2">
          <Input
            value={form.genericName}
            onChange={(e) => set('genericName', e.target.value)}
            placeholder="e.g. Paracetamol 650mg"
          />
        </Field>

        <Field label="Product form / category" required>
          <Select value={form.productType} onChange={(e) => setProductType(e.target.value)}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Division schedule">
          <Select value={form.division} onChange={(e) => set('division', e.target.value)}>
            <option value="GENERAL">General OTC</option>
            <option value="SCHEDULE_H">Schedule H (Rx)</option>
            <option value="SCHEDULE_H1">Schedule H1 (Rx)</option>
            <option value="SCHEDULE_X">Schedule X (Rx)</option>
          </Select>
        </Field>

        <Field label="Company">
          <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Manufacturer" />
        </Field>

        <Field label="HSN code">
          <Input value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className="font-mono" />
        </Field>

        <Field label="Pack size" hint="Units in one strip or bottle">
          <Input
            type="number" min="1" step="1"
            value={form.packSize || ''}
            onChange={(e) => set('packSize', parseInt(e.target.value, 10) || 1)}
            className="font-mono"
          />
        </Field>

        <Field label="GST %">
          <Select
            value={form.gstPercent}
            onChange={(e) => {
              // Not `|| 5`: that would turn a genuine 0% (exempt) selection into 5%.
              const chosen = parseFloat(e.target.value);
              set('gstPercent', Number.isFinite(chosen) ? chosen : 5);
            }}
          >
            <option value={0}>0% (Exempt)</option>
            <option value={5}>5%</option>
            <option value={12}>12%</option>
            <option value={18}>18%</option>
            <option value={28}>28%</option>
          </Select>
        </Field>

        <Field label="MRP per pack">
          <Input
            type="number" min="0" step="any"
            value={form.mrp || ''}
            onChange={(e) => set('mrp', parseFloat(e.target.value) || 0)}
            placeholder="₹ 0.00"
            className="font-mono"
          />
        </Field>

        <Field label="Purchase rate per pack" hint="Before GST">
          <Input
            type="number" min="0" step="any"
            value={form.purchaseRate || ''}
            onChange={(e) => set('purchaseRate', parseFloat(e.target.value) || 0)}
            placeholder="₹ 0.00"
            className="font-mono"
          />
        </Field>

        <Field label="Pack unit">
          <Select value={form.packUnit} onChange={(e) => set('packUnit', e.target.value)}>
            {['Strip', 'Bottle', 'Box', 'Tube', 'Vial', 'Packet'].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>

        <Field label="Content unit">
          <Select value={form.contentUnit} onChange={(e) => set('contentUnit', e.target.value)}>
            {['Tablet', 'Capsule', 'ml', 'gm', 'Drop', 'Sachet', 'Unit'].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
