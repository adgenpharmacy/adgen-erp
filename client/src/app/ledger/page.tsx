'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useErpData } from '@/context/ErpDataContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { formatDate } from '@/lib/utils';
import { Search, Plus } from 'lucide-react';

export default function LedgerPage() {
  const { ledgers: cachedLedgers, customers: cachedCustomers, parties: cachedParties, refreshData } = useErpData();
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'CUSTOMER' | 'PARTY'>('CUSTOMER');
  const [entityId, setEntityId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (cachedLedgers?.length > 0) setLedgers(cachedLedgers);
    if (cachedCustomers?.length > 0) setCustomers(cachedCustomers);
    if (cachedParties?.length > 0) setParties(cachedParties);
  }, [cachedLedgers, cachedCustomers, cachedParties]);

  const fetchLedgers = async () => {
    try { 
      const res = await api.get('/ledger'); 
      setLedgers(res.data); 
      refreshData();
    }
    catch (e) { console.error('Failed to fetch ledgers:', e); }
  };

  useEffect(() => {
    fetchLedgers();
  }, []);

  const handleSettlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId || amount <= 0) return;
    try {
      await api.post('/ledger/payment', {
        type: paymentType,
        customerId: paymentType === 'CUSTOMER' ? entityId : undefined,
        partyId: paymentType === 'PARTY' ? entityId : undefined,
        amount, notes,
      });
      setShowPaymentModal(false); setEntityId(''); setAmount(0); setNotes('');
      fetchLedgers();
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to record payment'); }
  };

  const filtered = ledgers.filter((l) => {
    const q = search.toLowerCase();
    return (l.customer?.name || l.customerName || '').toLowerCase().includes(q) ||
      (l.party?.name || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q);
  });

  const handleInlineSettle = async (item: any) => {
    try {
      await api.post('/ledger/settle', {
        ledgerId: item.id.startsWith('synth-') ? undefined : item.id,
        salesBillId: item.salesBillId, purchaseBillId: item.purchaseBillId,
        amountPaid: item.amount,
      });
      fetchLedgers();
    } catch (e: any) { alert('Failed to settle bill'); }
  };

  return (
    <div className="flex bg-white text-gray-900 min-h-screen font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Ledger</h1>
              <p className="text-xs text-gray-500 mt-0.5">{filtered.length} entries</p>
            </div>
            <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition">
              <Plus className="w-3.5 h-3.5" /> Record Payment
            </button>
          </div>
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="Search by customer, supplier, or notes..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-md pl-9 pr-4 py-2 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition" />
            </div>
          </div>
        </div>

        <div className="p-6 pb-24 md:pb-6">
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-16 text-gray-400 text-sm">No ledger entries found.</td></tr>
                  ) : (
                    filtered.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(l.createdAt || l.date)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {l.customer?.name || l.customerName || l.party?.name || 'General'}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                            (l.transactionType || l.type) === 'CREDIT' 
                              ? 'bg-red-50 text-red-600' 
                              : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {l.transactionType || l.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">{l.description}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold font-mono text-gray-900">₹{l.amount?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          {l.isSettled ? (
                            <span className="text-[11px] text-gray-400 font-medium">Settled</span>
                          ) : (
                            <button onClick={() => handleInlineSettle(l)}
                              className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1 rounded-md transition">
                              Settle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-gray-200 p-6 rounded-lg max-w-md w-full shadow-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Record Payment</h2>
              <form onSubmit={handleSettlePayment} className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Account Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CUSTOMER', 'PARTY'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => { setPaymentType(t); setEntityId(''); }}
                        className={`py-2 rounded-md text-xs font-medium transition ${paymentType === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {t === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">
                    Select {paymentType === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                  </label>
                  <select required value={entityId} onChange={(e) => setEntityId(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500">
                    <option value="">Choose...</option>
                    {paymentType === 'CUSTOMER'
                      ? customers.map((c) => <option key={c.id} value={c.id}>{c.name} (₹{c.creditBalance})</option>)
                      : parties.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{p.outstandingBalance})</option>)
                    }
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Amount ₹</label>
                  <input type="number" required value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 font-mono focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Notes</label>
                  <input type="text" placeholder="e.g. UPI Ref #9082" value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 bg-white text-gray-700 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition text-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 transition text-sm">Record</button>
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
