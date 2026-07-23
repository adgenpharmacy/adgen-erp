'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { Package, ArrowLeft, Save, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
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
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert('Please enter brand/medicine name');
      return;
    }
    try {
      setIsSubmitting(true);
      await api.post('/products', formData);
      alert('New medicine created successfully!');
      router.push('/products');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex bg-[#F4F8F6] text-slate-800 min-h-screen font-sans">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/products"
            className="p-2 text-slate-500 hover:text-slate-900 bg-white rounded-xl border border-slate-200 shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Add New Medicine <Package className="w-6 h-6 text-emerald-600" />
            </h1>
            <p className="text-xs text-slate-500 font-medium">Add a new medicine to your pharmacy catalog</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="max-w-3xl bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-medium">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 block mb-1 font-bold">Brand / Medicine Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. DOLO 650MG"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">Product Form / Category *</label>
              <select
                value={formData.productType}
                onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
              >
                <option value="TABLET">TABLET</option>
                <option value="CAPSULE">CAPSULE</option>
                <option value="SYRUP">SYRUP</option>
                <option value="INJECTION">INJECTION</option>
                <option value="CREAM">CREAM / OINTMENT</option>
                <option value="DROPS">DROPS</option>
                <option value="POWDER">POWDER</option>
                <option value="OTHERS">OTHERS</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">Pack Size (Units per Strip/Pack) *</label>
              <input
                type="number"
                required
                value={formData.packSize}
                onChange={(e) => setFormData({ ...formData, packSize: parseInt(e.target.value) || 1 })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 text-right font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 block mb-1 font-bold">Generic Salt Composition</label>
              <input
                type="text"
                placeholder="e.g. Paracetamol 650mg"
                value={formData.genericName}
                onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">Manufacturer / Company</label>
              <input
                type="text"
                placeholder="e.g. Micro Labs"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">HSN Code</label>
              <input
                type="text"
                value={formData.hsnCode}
                onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">GST Tax %</label>
              <select
                value={formData.gstPercent}
                onChange={(e) => setFormData({ ...formData, gstPercent: parseFloat(e.target.value) || 12 })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
              >
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12% (Standard)</option>
                <option value={18}>18%</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1 font-bold">Division Schedule</label>
              <select
                value={formData.division}
                onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-bold"
              >
                <option value="GENERAL">General OTC</option>
                <option value="SCHEDULE_H">Schedule H (Rx)</option>
                <option value="SCHEDULE_H1">Schedule H1 (Rx)</option>
                <option value="SCHEDULE_X">Schedule X (Rx)</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="cold"
                checked={formData.requiresColdStorage}
                onChange={(e) => setFormData({ ...formData, requiresColdStorage: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <label htmlFor="cold" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                Requires Cold Storage <Snowflake className="w-4 h-4 text-sky-500" /> (Refrigerated 2-8°C)
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Link
              href="/products"
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save New Medicine'}
            </button>
          </div>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
