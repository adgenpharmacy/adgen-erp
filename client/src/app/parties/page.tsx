'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import { Search, Plus, Edit2, Building2, Trash2 } from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import { useAuth } from '@/context/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  TableWrap,
  Table,
  THead,
  TH,
  TR,
  TD,
  useToast,
  useConfirm,
} from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import type { Party } from '@/types';
import { getApiErrorMessage } from '@/types';

const FORM_FIELDS = [
  { label: 'Name', key: 'name', required: true, placeholder: 'e.g. Anila Medical Pvt Ltd' },
  { label: 'Phone', key: 'phone', placeholder: '9826012345', mono: true },
  { label: 'Email', key: 'email', type: 'email', placeholder: 'supplier@email.com' },
  { label: 'DL Number', key: 'dlNumber', placeholder: 'e.g. 20B/5441/12/2024', mono: true },
  { label: 'GST Number', key: 'gstNumber', placeholder: '27ABCDE1234F1Z5', mono: true },
  { label: 'Address', key: 'address', placeholder: 'Street, City, Pincode' },
] as const;

export default function PartiesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { parties: cachedParties, refreshData } = useErpData();
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', dlNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (cachedParties && cachedParties.length > 0) {
      setParties(cachedParties);
    }
  }, [cachedParties]);

  const fetchParties = async () => {
    try {
      const res = await api.get('/parties');
      setParties(res.data);
      refreshData();
    } catch (e) {
      console.error('Failed to fetch suppliers:', e);
    }
  };

  useEffect(() => {
    fetchParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddModal = () => {
    setEditingParty(null);
    setFormData({ name: '', phone: '', email: '', address: '', gstNumber: '', dlNumber: '' });
    setShowAddModal(true);
  };

  const openEditModal = (party: Party) => {
    setEditingParty(party);
    setFormData({ name: party.name || '', phone: party.phone || '', email: party.email || '', address: party.address || '', gstNumber: party.gstNumber || '', dlNumber: party.dlNumber || '' });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingParty) { await api.put(`/parties/${editingParty.id}`, formData); }
      else { await api.post('/parties', formData); }
      setShowAddModal(false);
      toast.success(editingParty ? 'Supplier updated' : 'Supplier added');
      fetchParties();
    } catch (e) {
      toast.error('Failed to save supplier', getApiErrorMessage(e));
    } finally { setIsSubmitting(false); }
  };

  /**
   * Remove a supplier from the directory.
   *
   * Their purchase bills and ledger history stay exactly as they are — the record simply stops
   * appearing here and in the supplier picker on a new purchase entry. A duplicate typed twice
   * previously had no way out of the list at all.
   */
  const handleDelete = async (party: Party) => {
    const ok = await confirm({
      title: `Remove ${party.name}?`,
      message:
        'They will no longer appear in the supplier list or on a new purchase entry. Existing ' +
        'purchase bills and ledger entries are kept.',
      confirmLabel: 'Remove supplier',
    });
    if (!ok) return;
    try {
      await api.delete(`/parties/${party.id}`);
      toast.success(`${party.name} removed`);
      fetchParties();
    } catch (e) {
      // The server refuses while money is outstanding and says how much.
      toast.error('Supplier not removed', getApiErrorMessage(e));
    }
  };

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone && p.phone.includes(search))
  );

  return (
    <PageMain>
      <PageHeader
        title="Suppliers"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'supplier' : 'suppliers'}`}
        action={
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Supplier
          </Button>
        }
      >
        <Input
          icon={Search}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="max-w-md"
          aria-label="Search suppliers"
        />
      </PageHeader>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={search ? 'No matching suppliers' : 'No suppliers yet'}
            message={
              search
                ? 'Try a different name or phone number.'
                : 'Add a supplier to record purchase bills and track outstanding balances.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={openAddModal}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Supplier
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Supplier</TH>
                  <TH className="hidden sm:table-cell">Phone</TH>
                  <TH className="hidden md:table-cell">DL Number</TH>
                  <TH className="hidden lg:table-cell">GST</TH>
                  <TH align="right">Outstanding</TH>
                  <TH align="center">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((party) => (
                  <TR key={party.id}>
                    <TD>
                      <span className="block font-semibold">{party.name}</span>
                      {party.address ? (
                        <span className="block text-xs text-fg-subtle mt-0.5 max-w-50 truncate">
                          {party.address}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="hidden sm:table-cell font-mono text-fg-muted">{party.phone || '—'}</TD>
                    <TD className="hidden md:table-cell font-mono text-fg-subtle">{party.dlNumber || '—'}</TD>
                    <TD className="hidden lg:table-cell font-mono text-fg-subtle">{party.gstNumber || '—'}</TD>
                    <TD
                      align="right"
                      className={`font-mono font-bold ${(party.outstandingBalance ?? 0) > 0 ? 'text-danger' : 'text-fg-subtle'}`}
                    >
                      {formatCurrency(party.outstandingBalance ?? 0)}
                    </TD>
                    <TD align="center">
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => openEditModal(party)}
                          className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                          title="Edit supplier"
                          aria-label={`Edit ${party.name}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {isOwner ? (
                          <button
                            onClick={() => handleDelete(party)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                            title="Remove supplier from the directory"
                            aria-label={`Remove ${party.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingParty ? 'Edit Supplier' : 'Add Supplier'}
        subtitle={editingParty ? editingParty.name : 'Create a new supplier record'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="party-form" loading={isSubmitting}>
              {editingParty ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="party-form" onSubmit={handleSubmit} className="p-5 space-y-4">
          {FORM_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} required={'required' in field && field.required}>
              <Input
                type={field.key === 'phone' ? 'tel' : ('type' in field && field.type) || 'text'}
                maxLength={field.key === 'phone' ? 10 : undefined}
                required={'required' in field && field.required}
                placeholder={field.placeholder}
                value={formData[field.key]}
                onChange={(e) => setFormData({
                  ...formData,
                  [field.key]: field.key === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value
                })}
                className={'mono' in field && field.mono ? 'font-mono' : undefined}
              />
            </Field>
          ))}
        </form>
      </Modal>
    </PageMain>
  );
}
