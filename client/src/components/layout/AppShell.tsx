'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import MobileHeader from '@/components/layout/MobileHeader';
import CommandPalette from '@/components/common/CommandPalette';

/** Routes that render standalone, without the application chrome. */
const BARE_ROUTES = ['/login'];

/**
 * Single application frame.
 *
 * Previously every page rendered its own `<Sidebar />` and `<BottomNav />`, which duplicated the
 * shell across 14 files and remounted the navigation on each route change. Mounting it once here
 * keeps sidebar scroll position and avoids the flicker between pages.
 *
 * Deliberately renders no `<main>`: each page owns its own, because print modals are siblings of
 * `<main>` and the print stylesheet hides `main` to strip app chrome off the page. Wrapping pages
 * in a shell-level `<main>` would pull those modals inside it and break invoice printing.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (BARE_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <MobileHeader />
        {children}
      </div>

      <BottomNav />
      <CommandPalette />
    </div>
  );
}
