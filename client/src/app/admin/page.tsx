'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Save, ShieldAlert, Users, Database, ExternalLink, History } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { useErpData } from '@/context/ErpDataContext';
import PageMain from '@/components/layout/PageMain';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  PageHeader,
  useToast,
} from '@/components/ui';
import type { PharmacyProfile } from '@/types';
import { getApiErrorMessage } from '@/types';

const EMPTY: PharmacyProfile = {
  id: 'default',
  name: '',
  tagline: '',
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  gstNumber: '',
  dlNumber: '',
  invoiceFooter: '',
};

export default function AdminPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { profile, refreshData } = useErpData();
  const [form, setForm] = useState<PharmacyProfile>(EMPTY);
  const [saving, setSaving] = useState(false);

  const isOwner = user?.role === 'OWNER';

  useEffect(() => {
    if (profile) setForm({ ...EMPTY, ...profile });
  }, [profile]);

  const set = <K extends keyof PharmacyProfile>(key: K, value: PharmacyProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Pharmacy name is required', 'It heads every invoice and receipt.');
      return;
    }
    try {
      setSaving(true);
      await api.put('/settings', form);
      await refreshData();
      toast.success('Settings saved', 'New invoices will use these details.');
    } catch (err) {
      toast.error('Could not save settings', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <PageMain>
        <PageHeader title="Admin" subtitle="Pharmacy configuration" />
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="rounded-full bg-warn-subtle p-3 text-warn">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="text-sm font-bold text-fg">Owner access required</h2>
            <p className="max-w-sm text-sm text-fg-muted">
              These settings appear on every printed tax invoice, so only an owner account can
              change them. Ask the pharmacy owner to sign in.
            </p>
          </div>
        </Card>
      </PageMain>
    );
  }

  return (
    <PageMain>
      <PageHeader
        title="Admin"
        subtitle="Details printed on every invoice, GRN and receipt"
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/stock-adjustments">
              <Button variant="outline">
                <History className="h-4 w-4" aria-hidden />
                Stock Adjustments
              </Button>
            </Link>
            <Button type="submit" form="settings-form" loading={saving}>
              <Save className="h-4 w-4" aria-hidden />
              Save Settings
            </Button>
          </div>
        }
      />

      <form id="settings-form" onSubmit={handleSave} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand" aria-hidden />
                  Pharmacy Identity
                </span>
              }
              subtitle="Shown in the letterhead of every printed document"
            />
            <CardBody className="space-y-4">
              <Field label="Pharmacy Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="AdGen Pharma"
                  className="font-semibold"
                  required
                />
              </Field>

              <Field label="Tagline" hint="Small line under the name, e.g. 'Retail Pharmacy & Clinical Supplies'">
                <Input
                  value={form.tagline ?? ''}
                  onChange={(e) => set('tagline', e.target.value)}
                  placeholder="Retail Pharmacy & Clinical Supplies"
                />
              </Field>

              <Field label="Address">
                <Input
                  value={form.addressLine ?? ''}
                  onChange={(e) => set('addressLine', e.target.value)}
                  placeholder="27-A Chandra Nagar, Barfani Dham, MR-9"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="City">
                  <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Indore" />
                </Field>
                <Field label="State">
                  <Input value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} placeholder="M.P" />
                </Field>
                <Field label="Pincode">
                  <Input
                    value={form.pincode ?? ''}
                    onChange={(e) => set('pincode', e.target.value)}
                    placeholder="452001"
                    className="font-mono"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <Input
                    value={form.phone ?? ''}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="+91 88396 40968"
                    className="font-mono"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="adgenpharmacy2024@gmail.com"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card className="border-warn-line">
            <CardHeader
              title="Statutory Numbers"
              subtitle="Legally required on a GST tax invoice — verify these before issuing bills"
              className="bg-warn-subtle"
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="GSTIN" hint="15 characters">
                  <Input
                    value={form.gstNumber ?? ''}
                    onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                    placeholder="27ABCDE1234F1Z5"
                    className="font-mono font-semibold"
                    maxLength={15}
                  />
                </Field>
                <Field label="Drug Licence No.">
                  <Input
                    value={form.dlNumber ?? ''}
                    onChange={(e) => set('dlNumber', e.target.value)}
                    placeholder="20B/5441/12/2024"
                    className="font-mono font-semibold"
                  />
                </Field>
              </div>

              <Field label="Invoice Footer" hint="Printed at the bottom of customer bills">
                <Textarea
                  rows={2}
                  value={form.invoiceFooter ?? ''}
                  onChange={(e) => set('invoiceFooter', e.target.value)}
                  placeholder="Thank you for choosing AdGen Pharmacy!"
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Live Preview" subtitle="How the letterhead will print" />
            <CardBody>
              <div className="rounded-md border border-line bg-raised p-4">
                <p className="text-base font-extrabold tracking-tight text-fg">
                  {form.name || 'Pharmacy Name'}
                </p>
                {form.tagline ? (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                    {form.tagline}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
                  {[form.addressLine, form.city, form.state, form.pincode].filter(Boolean).join(', ') ||
                    'Address not set'}
                  <br />
                  <strong>DL No:</strong> {form.dlNumber || '—'} | <strong>GSTIN:</strong>{' '}
                  {form.gstNumber || '—'}
                  <br />
                  <strong>Phone:</strong> {form.phone || '—'}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Other Admin Areas" />
            <CardBody className="space-y-2">
              <Link
                href="/employees"
                className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-hover"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-fg-subtle" aria-hidden />
                  Staff &amp; access approvals
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
              </Link>
              <Link
                href="/reports"
                className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-hover"
              >
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-fg-subtle" aria-hidden />
                  Full data backup (export)
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
              </Link>
            </CardBody>
          </Card>
        </div>
      </form>
    </PageMain>
  );
}
