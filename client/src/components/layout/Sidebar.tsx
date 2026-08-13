'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ClockControl from '@/components/layout/ClockControl';
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
  RotateCcw,
  ScanLine,
  Settings,
} from 'lucide-react';
import UpdateNotifier from '@/components/layout/UpdateNotifier';
import { cn } from '@/lib/utils';

/**
 * Grouped so the daily counter workflow sits apart from master data and analysis.
 *
 * `ownerOnly` hides a destination whose API refuses anyone else. Employees used to be listed for
 * every account, but GET /users is owner-only, so staff who clicked it landed on a page that
 * could never fill in.
 */
const NAV_GROUPS: {
  heading: string;
  items: { name: string; href: string; icon: typeof Receipt; ownerOnly?: boolean }[];
}[] = [
  {
    heading: 'Operations',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Billing', href: '/billing', icon: ScanLine },
      { name: 'Sales', href: '/sales', icon: Receipt },
      { name: 'Purchases', href: '/purchases', icon: ShoppingBag },
      { name: 'Returns', href: '/returns', icon: RotateCcw },
    ],
  },
  {
    heading: 'Catalogue',
    items: [
      { name: 'Products', href: '/products', icon: Boxes },
      { name: 'Inventory', href: '/inventory', icon: Package },
    ],
  },
  {
    heading: 'Directory',
    items: [
      { name: 'Customers', href: '/customers', icon: Users },
      { name: 'Suppliers', href: '/parties', icon: Building2 },
      { name: 'Employees', href: '/employees', icon: UserCheck, ownerOnly: true },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { name: 'Ledger', href: '/ledger', icon: BookOpen },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
];

/** Owner-only. Holds the statutory details printed on every invoice. */
const ADMIN_ITEM = { name: 'Admin', href: '/admin', icon: Settings };

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      <aside className="hidden md:flex flex-col w-sidebar shrink-0 bg-surface border-r border-line h-screen sticky top-0 select-none no-print">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-line">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="min-w-0">
              <span className="block font-extrabold text-fg text-[15px] tracking-tight leading-none">
                AdGen <span className="text-brand font-mono text-xs ml-0.5">ERP</span>
              </span>
              <span className="block text-[10px] text-fg-subtle font-semibold tracking-wider uppercase mt-1 leading-none">
                Clinical &amp; POS Suite
              </span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !item.ownerOnly || user?.role === 'OWNER');
            if (visibleItems.length === 0) return null;
            return (
            <div key={group.heading}>
              <p className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
                {group.heading}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-md text-[13px] font-semibold',
                        'border-l-[3px] transition-colors',
                        isActive
                          ? 'bg-brand-subtle text-brand-hover border-brand'
                          : 'text-fg-muted border-transparent hover:bg-hover hover:text-fg'
                      )}
                    >
                      <Icon
                        className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand' : 'text-fg-subtle')}
                        aria-hidden
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            );
          })}

          {user?.role === 'OWNER' ? (
            <div>
              <p className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
                Configuration
              </p>
              <Link
                href={ADMIN_ITEM.href}
                aria-current={pathname === ADMIN_ITEM.href ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 pl-2.5 pr-3 py-2 rounded-md text-[13px] font-semibold',
                  'border-l-[3px] transition-colors',
                  pathname === ADMIN_ITEM.href
                    ? 'bg-brand-subtle text-brand-hover border-brand'
                    : 'text-fg-muted border-transparent hover:bg-hover hover:text-fg'
                )}
              >
                <ADMIN_ITEM.icon
                  className={cn('h-[18px] w-[18px] shrink-0', pathname === ADMIN_ITEM.href ? 'text-brand' : 'text-fg-subtle')}
                  aria-hidden
                />
                <span className="truncate">{ADMIN_ITEM.name}</span>
              </Link>
            </div>
          ) : null}
        </nav>

        {/* Shift clock — placed with the user, where someone looks when arriving or leaving. */}
        {user ? (
          <div className="px-3 pt-3">
            <ClockControl />
          </div>
        ) : null}

        {/* User */}
        {user ? (
          <div className="px-3 py-3 border-t border-line flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0',
                  user.role === 'OWNER' ? 'bg-brand text-brand-fg' : 'bg-brand-subtle text-brand-hover'
                )}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-fg text-xs truncate leading-tight">{user.name}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mt-0.5">
                  {user.role}
                </span>
              </span>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded-md text-fg-subtle hover:bg-danger-subtle hover:text-danger transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="px-3 py-3 border-t border-line">
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-md bg-brand text-brand-fg text-xs font-bold hover:bg-brand-hover transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </aside>

      <UpdateNotifier />
    </>
  );
}
