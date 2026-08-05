'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Plus, RefreshCw, CheckCircle, XCircle, UserCheck, Clock } from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import AttendancePanel from '@/components/employees/AttendancePanel';
import type { User } from '@/types';
import { getApiErrorMessage } from '@/types';
import {
  Button,
  Card,
  CardHeader,
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
} from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function EmployeesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE', designation: 'Pharmacist' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    try { setLoading(true); const res = await api.get('/users'); setEmployees(res.data); }
    catch (e) { console.error('Failed to fetch employees:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleApprove = async (id: string, name: string) => {
    try { await api.put(`/users/${id}/approve`); toast.success(`Approved ${name}`); fetchUsers(); }
    catch (err) { toast.error('Failed to approve', getApiErrorMessage(err)); }
  };

  const handleReject = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Reject access request?',
      message: `This permanently deletes the pending account for ${name}. They will need to request access again.`,
      confirmLabel: 'Reject request',
    });
    if (!ok) return;
    try { await api.delete(`/users/${id}`); toast.success(`Rejected ${name}'s request`); fetchUsers(); }
    catch (err) { toast.error('Failed to reject', getApiErrorMessage(err)); }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await api.post('/users/register', formData);
      setShowAddModal(false);
      setFormData({ name: '', email: '', password: '', role: 'EMPLOYEE', designation: 'Pharmacist' });
      fetchUsers();
    } catch (err) { toast.error('Failed to add staff', getApiErrorMessage(err)); }
    finally { setIsSubmitting(false); }
  };

  const pendingApprovals = employees.filter((e) => !e.isApproved);
  const activeEmployees = employees.filter((e) => e.isApproved);

  return (
    <PageMain>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} staff ${employees.length === 1 ? 'member' : 'members'}`}
        action={
          <>
            <Button variant="outline" onClick={fetchUsers}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
              Refresh
            </Button>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add Staff
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {/* Who is in, and for how long. Above the roster: it is the question asked daily. */}
        <AttendancePanel />

        {/* Pending approvals — surfaced first because they block someone from working. */}
        {pendingApprovals.length > 0 && (
          <Card className="overflow-hidden border-warn-line">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warn" aria-hidden />
                  Pending Approvals
                </span>
              }
              subtitle="These accounts cannot sign in until approved"
              action={<StatusChip tone="warning">{pendingApprovals.length} waiting</StatusChip>}
              className="bg-warn-subtle"
            />
            <TableWrap>
              <Table>
                <tbody>
                  {pendingApprovals.map((emp) => (
                    <TR key={emp.id}>
                      <TD>
                        <span className="block font-semibold">{emp.name}</span>
                        <span className="block text-xs text-fg-subtle">{emp.email}</span>
                      </TD>
                      <TD className="text-fg-muted hidden sm:table-cell">{formatDate(emp.createdAt)}</TD>
                      <TD align="right">
                        <span className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => handleApprove(emp.id, emp.name)}>
                            <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleReject(emp.id, emp.name)}>
                            <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
                            Reject
                          </Button>
                        </span>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        )}

        {/* Active staff */}
        <Card className="overflow-hidden">
          <CardHeader title="Active Staff" subtitle={`${activeEmployees.length} with portal access`} />
          {loading && employees.length === 0 ? (
            <TableSkeleton rows={5} cols={4} />
          ) : activeEmployees.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No active staff"
              message="Add a staff member to give them access to the billing counter."
              action={
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Staff
                </Button>
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH className="hidden sm:table-cell">Email</TH>
                    <TH>Role</TH>
                    <TH align="center">Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {activeEmployees.map((emp) => (
                    <TR key={emp.id}>
                      <TD>
                        <span className="flex items-center gap-2.5">
                          <span
                            className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] ${
                              emp.role === 'OWNER' ? 'bg-brand text-brand-fg' : 'bg-brand-subtle text-brand-hover'
                            }`}
                          >
                            {(emp.name || 'S').substring(0, 2).toUpperCase()}
                          </span>
                          <span className="font-semibold">{emp.name}</span>
                        </span>
                      </TD>
                      <TD className="hidden sm:table-cell text-fg-muted">{emp.email}</TD>
                      <TD>
                        <StatusChip tone={emp.role === 'OWNER' ? 'success' : 'neutral'} small>
                          {emp.role}
                        </StatusChip>
                      </TD>
                      <TD align="center">
                        <StatusChip tone="success" small>Active</StatusChip>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Staff Member"
        subtitle="Creates a portal account for the billing counter"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="staff-form" loading={isSubmitting}>
              Save
            </Button>
          </div>
        }
      >
        <form id="staff-form" onSubmit={handleAddStaff} className="p-5 space-y-4">
          <Field label="Full Name" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Priya Nair"
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="staff@adgenpharma.com"
            />
          </Field>
          <Field label="Password" required>
            <Input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Minimum 8 characters"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Role">
              <Select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                <option value="EMPLOYEE">Employee</option>
                <option value="OWNER">Owner</option>
              </Select>
            </Field>
            <Field label="Designation">
              <Input
                type="text"
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                placeholder="Pharmacist"
              />
            </Field>
          </div>
        </form>
      </Modal>
    </PageMain>
  );
}
