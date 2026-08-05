'use client';

import { useState } from 'react';
import { useFieldChain } from '@/lib/use-listbox-keys';
import { api } from '@/lib/api-client';
import { ArrowLeft, Save, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageMain from '@/components/layout/PageMain';
import { getApiErrorMessage } from '@/types';
import { Button, Card, CardHeader, CardBody, Field, Input, Select, PageHeader, useToast } from '@/components/ui';

export default function NewProductPage() {
  const toast = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    genericName: '',
    companyName: '',
    hsnCode: '3004',
    gstPercent: 12,
    productType: 'TABLET',
    packSize: 10,
    packUnit: 'Strip',
    contentUnit: 'Tablet',
    requiresColdStorage: false,
    division: 'GENERAL',
    // Defaults prefilled onto a purchase line when this medicine is next bought in.
    mrp: 0,
    purchaseRate: 0,
  });

  /*
   * Enter walks the form instead of submitting it. A medicine is a dozen short fields typed in
   * one run; a form that saves on the first Enter cannot be filled from the keyboard at all.
   * The last field blurs rather than wrapping, so Enter there does not jump back to the top.
   */
  const fieldChain = useFieldChain([
    'name', 'productType', 'packSize', 'genericName',
    'mrp', 'purchaseRate', 'companyName', 'hsnCode', 'gstPercent', 'division',
  ]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Brand name required', 'Enter the medicine or brand name to continue.');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.post('/products', formData);
      toast.success('Medicine created');
      router.push('/products');
    } catch (err) {
      toast.error('Failed to save product', getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageMain>
      <PageHeader
        title="Add New Medicine"
        subtitle="Add a new medicine to your pharmacy catalog"
        action={
          <Link
            href="/products"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Products
          </Link>
        }
      />

      <form onSubmit={handleSave} className="max-w-3xl">
        <Card>
          <CardHeader title="Medicine Details" subtitle="Fields marked * are required" />
          <CardBody className="space-y-5">
            <Field label="Brand / Medicine Name" required>
              <Input
                type="text"
                required
                placeholder="e.g. DOLO 650MG"
                value={formData.name}
                ref={fieldChain.register('name')}
                onKeyDown={fieldChain.onKeyDown('name')}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="font-semibold"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Product Form / Category" required>
                <Select
                  value={formData.productType}
                ref={fieldChain.register('productType')}
                onKeyDown={fieldChain.onKeyDown('productType')}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                >
                  <option value="TABLET">Tablet</option>
                  <option value="CAPSULE">Capsule</option>
                  <option value="SYRUP">Syrup</option>
                  <option value="INJECTION">Injection</option>
                  <option value="CREAM">Cream / Ointment</option>
                  <option value="DROPS">Drops</option>
                  <option value="POWDER">Powder</option>
                  <option value="OTHERS">Others</option>
                </Select>
              </Field>

              <Field label="Pack Size" hint="Units per strip or pack" required>
                <Input
                  type="number"
                  required
                  min={1}
                  value={formData.packSize}
                ref={fieldChain.register('packSize')}
                onKeyDown={fieldChain.onKeyDown('packSize')}
                  onChange={(e) => setFormData({ ...formData, packSize: parseInt(e.target.value) || 1 })}
                  className="text-right font-mono font-semibold"
                />
              </Field>
            </div>

            <Field label="Generic Salt Composition">
              <Input
                type="text"
                placeholder="e.g. Paracetamol 650mg"
                value={formData.genericName}
                ref={fieldChain.register('genericName')}
                onKeyDown={fieldChain.onKeyDown('genericName')}
                onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Default MRP / Pack (₹)" hint="Prefilled when purchasing this medicine">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={formData.mrp || ''}
                  ref={fieldChain.register('mrp')}
                  onKeyDown={fieldChain.onKeyDown('mrp')}
                  onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="font-mono font-semibold"
                />
              </Field>
              <Field label="Default Purchase Rate / Pack (₹)" hint="Also used as the COGS fallback">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={formData.purchaseRate || ''}
                  ref={fieldChain.register('purchaseRate')}
                  onKeyDown={fieldChain.onKeyDown('purchaseRate')}
                  onChange={(e) => setFormData({ ...formData, purchaseRate: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="font-mono font-semibold"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Manufacturer / Company">
                <Input
                  type="text"
                  placeholder="e.g. Micro Labs"
                  value={formData.companyName}
                ref={fieldChain.register('companyName')}
                onKeyDown={fieldChain.onKeyDown('companyName')}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </Field>

              <Field label="HSN Code">
                <Input
                  type="text"
                  value={formData.hsnCode}
                ref={fieldChain.register('hsnCode')}
                onKeyDown={fieldChain.onKeyDown('hsnCode')}
                  onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                  className="font-mono font-semibold"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="GST Tax %">
                <Select
                  value={formData.gstPercent}
                ref={fieldChain.register('gstPercent')}
                onKeyDown={fieldChain.onKeyDown('gstPercent')}
                  onChange={(e) => {
                    // Not `|| 12`: that silently turned the "0% (Exempt)" option into 12%.
                    const chosen = parseFloat(e.target.value);
                    setFormData({ ...formData, gstPercent: Number.isFinite(chosen) ? chosen : 12 });
                  }}
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12% (Standard)</option>
                  <option value={18}>18%</option>
                </Select>
              </Field>

              <Field label="Division Schedule">
                <Select
                  value={formData.division}
                ref={fieldChain.register('division')}
                onKeyDown={fieldChain.onKeyDown('division')}
                  onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                >
                  <option value="GENERAL">General OTC</option>
                  <option value="SCHEDULE_H">Schedule H (Rx)</option>
                  <option value="SCHEDULE_H1">Schedule H1 (Rx)</option>
                  <option value="SCHEDULE_X">Schedule X (Rx)</option>
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2.5 rounded-md border border-line bg-raised px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requiresColdStorage}
                onChange={(e) => setFormData({ ...formData, requiresColdStorage: e.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                <Snowflake className="h-4 w-4 text-info" aria-hidden />
                Requires cold storage
                <span className="font-normal text-fg-subtle">(refrigerated 2–8°C)</span>
              </span>
            </label>
          </CardBody>

          <div className="flex gap-3 px-5 py-4 border-t border-line bg-raised">
            <Link
              href="/products"
              className="flex-1 inline-flex h-11 items-center justify-center rounded-md border border-line bg-surface text-sm font-semibold text-fg transition-colors hover:bg-hover"
            >
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
              <Save className="h-4 w-4" aria-hidden />
              Save New Medicine
            </Button>
          </div>
        </Card>
      </form>
    </PageMain>
  );
}
