'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { Plus, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'EMPLOYEE', designation: 'Pharmacist' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    try { setLoading(true); const res = await api.get('/users'); setEmployees(res.data); }
    catch (e) { console.error('Failed to fetch employees:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleApprove = async (id: string, name: string) => {
    try { await api.put(`/users/${id}/approve`); alert(`Approved ${name}`); fetchUsers(); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed to approve'); }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await api.post('/users/register', formData);
      setShowAddModal(false);
      setFormData({ name: '', email: '', role: 'EMPLOYEE', designation: 'Pharmacist' });
      fetchUsers();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to add staff'); }
    finally { setIsSubmitting(false); }
  };

  const pendingApprovals = employees.filter((e) => !e.isApproved);
  const activeEmployees = employees.filter((e) => e.isApproved);

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Employees</h1>
              <p className="text-xs text-gray-500 mt-0.5">{employees.length} staff members</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchUsers} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition">
                <Plus className="w-3.5 h-3.5" /> Add Staff
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6 space-y-6">
          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && (
            <div>
              <h2 className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-3">
                Pending Approvals ({pendingApprovals.length})
              </h2>
              <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-amber-100">
                    {pendingApprovals.map((emp) => (
                      <tr key={emp.id}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{emp.name}</div>
                          <div className="text-[11px] text-gray-500">{emp.email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(emp.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => handleApprove(emp.id, emp.name)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-[11px] transition">
                              <CheckCircle className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => alert(`Rejected ${emp.name}`)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 font-medium rounded-md text-[11px] border border-gray-200 transition">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active Staff */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Active Staff ({activeEmployees.length})</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded bg-emerald-600 text-white flex items-center justify-center font-semibold text-[10px]">
                            {(emp.name || 'S').substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">{emp.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          emp.role === 'OWNER' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>{emp.role}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] text-emerald-600 font-medium">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-gray-200 p-6 rounded-lg max-w-md w-full shadow-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Add Staff Member</h2>
              <form onSubmit={handleAddStaff} className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Full Name *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Email *</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Role</label>
                    <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500">
                      <option value="EMPLOYEE">Employee</option>
                      <option value="OWNER">Owner</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Designation</label>
                    <input type="text" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
