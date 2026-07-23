'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Receipt, Package, ShoppingBag, BookOpen, LogOut } from 'lucide-react';

const mobileNav = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Billing', href: '/billing', icon: Receipt },
  { name: 'Stock', href: '/inventory', icon: Package },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
  { name: 'Ledger', href: '/ledger', icon: BookOpen },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-1.5 flex justify-around items-center z-40">
      {mobileNav.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition ${
              isActive ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span>{item.name}</span>
          </Link>
        );
      })}
      <button
        onClick={logout}
        className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium text-gray-400 hover:text-red-500 transition"
        title="Log Out"
      >
        <LogOut className="w-5 h-5" />
        <span>Logout</span>
      </button>
    </div>
  );
}
