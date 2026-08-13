'use client';

import { useState, useEffect } from 'react';
import { useErpData } from '@/context/ErpDataContext';
import { api } from '@/lib/api-client';
import { Search, Plus, Edit2, Users, Trash2 } from 'lucide-react';
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
  TableSkeleton,
  useToast,
  useConfirm,
} from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import type { Customer } from '@/types';
import { getApiErrorMessage } from '@/types';

export default function CustomersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { customers: cachedCustomers, loading, refreshData } = useErpData();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', doctorName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCustomers(cachedCustomers);
  }, [cachedCustomers]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', email: '', address: '', gstNumber: '', doctorName: '' });
    setShowAddModal(true);
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormData({ name: cust.name || '', phone: cust.phone || '', email: cust.email || '', address: cust.address || '', gstNumber: cust.gstNumber || '', doctorName: cust.doctorName || '' });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
      } else {
        await api.post('/customers', formData);
      }
      setShowAddModal(false);
      toast.success(editingCustomer ? 'Customer updated' : 'Customer added');
      await refreshData();
    } catch (e) {
      toast.error('Failed to save customer', getApiErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Delete a customer record.
   *
   * Unlike a supplier this is a real delete, so the server refuses it for anyone who appears on a
   * bill, a credit note or the ledger. What it clears is duplicates and mistyped entries — the
   * case the directory had no answer for, since the only action here was Edit.
   */
  const handleDelete = async (cust: Customer) => {
    const ok = await confirm({
      title: `Delete ${cust.name}?`,
      message:
        'This permanently removes the customer record. It is refused if they appear on any bill, ' +
        'credit note or ledger entry.',
      confirmLabel: 'Delete customer',
    });
    if (!ok) return;
    try {
      await api.delete(`/customers/${cust.id}`);
      toast.success(`${cust.name} deleted`);
      await refreshData();
    } catch (e) {
      toast.error('Customer not deleted', getApiErrorMessage(e));
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.doctorName || '').toLowerCase().includes(q)
    );
  });

  return (
    <PageMain>
      <PageHeader
        title="Customer Directory"
        subtitle={`${filteredCustomers.length} registered customer ${filteredCustomers.length === 1 ? 'account' : 'accounts'}`}
        action={
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Customer
          </Button>
        }
      >
        <Input
          icon={Search}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, or doctor…"
          className="max-w-md"
          aria-label="Search customers"
        />
      </PageHeader>

      <Card className="overflow-hidden">
        {loading && customers.length === 0 ? (
          <TableSkeleton rows={8} cols={6} />
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No matching customers' : 'No customers yet'}
            message={
              search
                ? 'Try a different name, phone number, or doctor.'
                : 'Add a customer to track their purchases and outstanding credit.'
            }
            action={
              search ? (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={openAddModal}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Customer
                </Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Customer Name</TH>
                  <TH>Phone</TH>
                  <TH className="hidden md:table-cell">Doctor</TH>
                  <TH className="hidden lg:table-cell">Address</TH>
                  <TH className="hidden lg:table-cell">GSTIN / Email</TH>
                  <TH align="right">Outstanding Credit</TH>
                  <TH align="center">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {filteredCustomers.map((c) => {
                  const outstanding = c.creditBalance ?? 0;
                  return (
                    <TR key={c.id}>
                      <TD className="font-semibold">{c.name}</TD>
                      <TD className="font-mono text-fg-muted">{c.phone || '—'}</TD>
                      <TD className="hidden md:table-cell text-fg-muted">{c.doctorName || '—'}</TD>
                      <TD className="hidden lg:table-cell text-fg-subtle max-w-50 truncate">
                        {c.address || '—'}
                      </TD>
                      <TD className="hidden lg:table-cell font-mono text-fg-subtle">
                        {c.gstNumber || c.email || '—'}
                      </TD>
                      <TD
                        align="right"
                        className={`font-mono font-bold ${outstanding > 0 ? 'text-warn' : 'text-fg-subtle'}`}
                      >
                        {formatCurrency(outstanding)}
                      </TD>
                      <TD align="center">
                        <span className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => openEditModal(c)}
                            className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-info-subtle hover:text-info"
                            title="Edit customer"
                            aria-label={`Edit ${c.name}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {isOwner ? (
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                              title="Delete customer"
                              aria-label={`Delete ${c.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        subtitle={editingCustomer ? editingCustomer.name : 'Create a new customer account'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={isSubmitting}>
              {editingCustomer ? 'Update Customer' : 'Save Customer'}
            </Button>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit} className="p-5 space-y-4">
          <Field label="Customer Name" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Rahul Sharma"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone Number">
              <Input
                type="tel"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="9826012345"
                className="font-mono"
              />
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="customer@email.com"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Prescribed Doctor">
              <Input
                type="text"
                value={formData.doctorName}
                onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                placeholder="Dr. Verma"
              />
            </Field>
            <Field label="GSTIN Number">
              <Input
                type="text"
                value={formData.gstNumber}
                onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                placeholder="27ABCDE1234F1Z5"
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Address">
            <Input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Street, City, Pincode"
            />
          </Field>
        </form>
      </Modal>
    </PageMain>
  );
}
