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
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 min-h-screen sticky top-0 h-screen select-none overflow-y-auto">
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AdGen" className="w-7 h-7 object-contain" />
            <div>
              <h1 className="font-bold text-gray-900 text-sm tracking-tight leading-none">
                AdGen <span className="text-emerald-600 font-mono text-[11px] font-semibold ml-0.5">ERP</span>
              </h1>
              <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase leading-none block" title="Crafted with excellence by Anshu — Anshu says hi! 👋">
                Pharmacy • By Anshu
              </span>
            </div>
          </div>
        </div>

        {/* User Card */}
        {user ? (
          <div className="px-3.5 py-3 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-xs truncate leading-tight">{user.name}</div>
                <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                  user.role === 'OWNER' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="Sign Out of Portal"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-3.5 py-3 border-b border-gray-100">
            <Link
              href="/login"
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Sign In</span>
            </Link>
          </div>
        )}

        {/* Search hint */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-gray-400 text-xs bg-gray-50 border border-gray-200 rounded-md cursor-pointer hover:border-gray-300 transition">
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1">Search...</span>
            <kbd className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-400">⌘K</kbd>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border-l-2 border-emerald-600 -ml-[1px]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
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
