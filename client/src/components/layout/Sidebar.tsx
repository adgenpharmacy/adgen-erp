'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  Receipt, 
  Package, 
  ShoppingBag, 
  BookOpen, 
  Users, 
  Building2, 
  BarChart3,
  UserCheck,
  Boxes,
  LogOut,
  Search
} from 'lucide-react';
import CommandPalette from '@/components/common/CommandPalette';
import UpdateNotifier from '@/components/layout/UpdateNotifier';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sales', href: '/sales', icon: Receipt },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
  { name: 'Products', href: '/products', icon: Boxes },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Suppliers', href: '/parties', icon: Building2 },
  { name: 'Ledger', href: '/ledger', icon: BookOpen },
  { name: 'Employees', href: '/employees', icon: UserCheck },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 min-h-screen sticky top-0 h-screen select-none overflow-y-auto shadow-2xs">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="AdGen" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="font-extrabold text-slate-900 text-base tracking-tight leading-none">
                AdGen <span className="text-emerald-600 font-mono text-xs font-bold ml-0.5">ERP</span>
              </h1>
              <span className="text-[11px] text-slate-500 font-bold tracking-wider uppercase leading-none block mt-1" title="Crafted with excellence by Anshu — Anshu says hi! 👋">
                Pharmacy • By Anshu
              </span>
            </div>
          </div>
        </div>

        {/* User Card */}
        {user ? (
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-xs truncate leading-tight">{user.name}</div>
                <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider mt-0.5 ${
                  user.role === 'OWNER' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
              title="Sign Out of Portal"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-4 py-3.5 border-b border-slate-100">
            <Link
              href="/login"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Sign In</span>
            </Link>
          </div>
        )}

        {/* Search hint */}
        <div className="px-3.5 pt-3.5 pb-1">
          <div className="flex items-center gap-2.5 px-3 py-2 text-slate-500 text-xs bg-slate-50 border border-slate-200/90 rounded-xl cursor-pointer hover:border-slate-300 transition">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="flex-1 font-semibold text-slate-500">Search...</span>
            <kbd className="text-[10px] font-mono font-bold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">⌘K</kbd>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <CommandPalette />
      <UpdateNotifier />
    </>
  );
}
