'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, ScanLine, Package, ShoppingBag, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOBILE_NAV = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Billing', href: '/billing', icon: ScanLine },
  { name: 'Stock', href: '/inventory', icon: Package },
  { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line no-print"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-1 py-1">
        {MOBILE_NAV.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 px-1 py-1.5 rounded-md text-[10px] font-semibold transition-colors',
                isActive ? 'text-brand bg-brand-subtle' : 'text-fg-subtle hover:text-fg'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{item.name}</span>
            </Link>
          );
        })}
        <button
          onClick={logout}
          aria-label="Sign out"
          className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1.5 rounded-md text-[10px] font-semibold text-fg-subtle hover:text-danger transition-colors"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
