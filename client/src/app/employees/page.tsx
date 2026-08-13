'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import {
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  UserCheck,
  Clock,
  Edit2,
  Trash2,
  ShieldAlert,
  Ban,
  RotateCcw,
} from 'lucide-react';
import PageMain from '@/components/layout/PageMain';
import AttendancePanel from '@/components/employees/AttendancePanel';
import { useAuth } from '@/context/AuthContext';
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

const EMPTY_FORM = { name: '', email: '', password: '', role: 'EMPLOYEE', designation: 'Pharmacist' };

export default function EmployeesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  /** The account being edited, or null when the modal is creating a new one. */
  const [editing, setEditing] = useState<User | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOwner = user?.role === 'OWNER';

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setEmployees(res.data);
    } catch (err) {
      // Swallowing this left an empty page with no explanation whenever the list failed to load.
      toast.error('Could not load staff', getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) fetchUsers();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

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

  const openAdd = () => {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setShowAddModal(true);
  };

  const openEdit = (emp: User) => {
    setEditing(emp);
    // Password stays blank: an empty box leaves the existing password alone.
    setFormData({
      name: emp.name || '',
      email: emp.email || '',
      password: '',
      role: emp.role || 'EMPLOYEE',
      designation: emp.designation || '',
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && formData.password.length < 8) {
      toast.error('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (editing && formData.password && formData.password.length < 8) {
      toast.error('Password too short', 'Use at least 8 characters, or leave it blank to keep the current one.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editing) {
        const payload: Record<string, unknown> = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          designation: formData.designation,
        };
        if (formData.password) payload.password = formData.password;
        await api.patch(`/users/${editing.id}`, payload);
        toast.success('Staff details updated', formData.password ? 'Their new password is active now.' : undefined);
      } else {
        /*
         * POST /users, not /users/register.
         *
         * The public register endpoint always creates an unapproved EMPLOYEE, so the owner's
         * choice of role was discarded and the person they had just added landed in Pending
         * Approvals instead of Active Staff — which is what made adding staff look broken.
         */
        await api.post('/users', formData);
        toast.success('Staff member added', `${formData.name} can sign in now.`);
      }
      setShowAddModal(false);
      setEditing(null);
      setFormData(EMPTY_FORM);
      fetchUsers();
    } catch (err) {
      toast.error(editing ? 'Failed to update staff' : 'Failed to add staff', getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (emp: User) => {
    const disabling = emp.isActive !== false;
    if (disabling) {
      const ok = await confirm({
        title: `Disable ${emp.name}'s account?`,
        message:
          'They will be signed out and cannot sign in again until the account is re-enabled. ' +
          'Their bills and attendance history are kept.',
        confirmLabel: 'Disable account',
      });
      if (!ok) return;
    }
    try {
      await api.patch(`/users/${emp.id}`, { isActive: !disabling });
      toast.success(disabling ? `${emp.name} disabled` : `${emp.name} re-enabled`);
      fetchUsers();
    } catch (err) {
      toast.error('Could not change access', getApiErrorMessage(err));
    }
  };

  const handleDelete = async (emp: User) => {
    const ok = await confirm({
      title: `Delete ${emp.name}'s account?`,
      message:
        'This removes the account permanently. If they have ever worked a shift or raised a bill, ' +
        'disable the account instead — deleting erases their attendance history.',
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${emp.id}`);
      toast.success(`${emp.name} deleted`);
      fetchUsers();
    } catch (err) {
      // The server answers 409 with the reason and points at disabling instead; show it.
      toast.error('Account not deleted', getApiErrorMessage(err));
    }
  };

  const pendingApprovals = employees.filter((e) => !e.isApproved);
  const activeEmployees = employees.filter((e) => e.isApproved);

  if (!isOwner) {
    return (
      <PageMain>
        <PageHeader title="Employees" subtitle="Staff accounts and attendance" />
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="rounded-full bg-warn-subtle p-3 text-warn">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="text-sm font-bold text-fg">Owner access required</h2>
            <p className="max-w-sm text-sm text-fg-muted">
              Staff accounts and passwords are managed by the pharmacy owner. Ask them to sign in.
            </p>
          </div>
        </Card>
      </PageMain>
    );
  }

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
            <Button onClick={openAdd}>
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
              subtitle="Self-signups from the login screen — these accounts cannot sign in until approved"
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

        {/* Staff roster. Disabled accounts stay listed — they have to be, to be re-enabled. */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Staff"
            subtitle={`${activeEmployees.filter((e) => e.isActive !== false).length} with portal access`}
          />
          {loading && employees.length === 0 ? (
            <TableSkeleton rows={5} cols={5} />
          ) : activeEmployees.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No staff yet"
              message="Add a staff member to give them access to the billing counter."
              action={
                <Button onClick={openAdd}>
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
                    <TH className="hidden md:table-cell">Designation</TH>
                    <TH>Role</TH>
                    <TH align="center">Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {activeEmployees.map((emp) => {
                    const disabled = emp.isActive === false;
                    const isSelf = emp.id === user?.id;
                    return (
                      <TR key={emp.id} className="group">
                        <TD>
                          <span className="flex items-center gap-2.5">
                            <span
                              className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                disabled
                                  ? 'bg-sunken text-fg-subtle'
                                  : emp.role === 'OWNER'
                                    ? 'bg-brand text-brand-fg'
                                    : 'bg-brand-subtle text-brand-hover'
                              }`}
                            >
                              {(emp.name || 'S').substring(0, 2).toUpperCase()}
                            </span>
                            <span className={disabled ? 'font-semibold text-fg-muted' : 'font-semibold'}>
                              {emp.name}
                              {isSelf ? <span className="ml-1.5 text-[10px] font-bold text-fg-subtle">(you)</span> : null}
                            </span>
                          </span>
                        </TD>
                        <TD className="hidden sm:table-cell text-fg-muted">{emp.email}</TD>
                        <TD className="hidden md:table-cell text-fg-subtle">{emp.designation || '—'}</TD>
                        <TD>
                          <StatusChip tone={emp.role === 'OWNER' ? 'success' : 'neutral'} small>
                            {emp.role}
                          </StatusChip>
                        </TD>
                        <TD align="center">
                          <StatusChip tone={disabled ? 'error' : 'success'} small>
                            {disabled ? 'Disabled' : 'Active'}
                          </StatusChip>
                        </TD>
                        <TD align="right">
                          <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              onClick={() => openEdit(emp)}
                              className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-brand-subtle hover:text-brand"
                              title="Edit details, role or password"
                              aria-label={`Edit ${emp.name}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {/* Disabling your own account would lock you out mid-session. */}
                            {isSelf ? null : (
                              <button
                                onClick={() => handleToggleActive(emp)}
                                className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-warn-subtle hover:text-warn"
                                title={disabled ? 'Re-enable sign-in' : 'Disable sign-in, keep history'}
                                aria-label={disabled ? `Re-enable ${emp.name}` : `Disable ${emp.name}`}
                              >
                                {disabled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                              </button>
                            )}
                            {isSelf ? null : (
                              <button
                                onClick={() => handleDelete(emp)}
                                className="p-1.5 rounded-md text-fg-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
                                title="Delete account permanently"
                                aria-label={`Delete ${emp.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
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
      </div>

      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setEditing(null); }}
        title={editing ? 'Edit Staff Member' : 'Add Staff Member'}
        subtitle={
          editing
            ? 'Changes take effect on their next request'
            : 'Creates a working portal account — no separate approval needed'
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button type="submit" form="staff-form" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Add staff'}
            </Button>
          </div>
        }
      >
        <form id="staff-form" onSubmit={handleSubmit} className="p-5 space-y-4">
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
          <Field
            label={editing ? 'New Password' : 'Password'}
            required={!editing}
            hint={editing ? 'Leave blank to keep the current password' : 'Minimum 8 characters'}
          >
            <Input
              type="password"
              required={!editing}
              minLength={8}
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={editing ? 'Unchanged' : 'Minimum 8 characters'}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Role" hint="Owners can manage staff, delete bills and adjust stock">
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
