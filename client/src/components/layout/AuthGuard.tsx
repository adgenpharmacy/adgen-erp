'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/** Routes reachable without a session. Everything else requires login. */
const PUBLIC_ROUTES = ['/login'];

/**
 * Blocks rendering of application pages until a session is confirmed.
 *
 * Without this every screen — billing, reports, ledger, customer records — rendered its full
 * shell for logged-out visitors. The API correctly returned 401 so no data leaked, but the app
 * looked like a working ERP reporting ₹0.00 across the board.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !isPublic) {
      const redirect = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${redirect}`);
    }

    if (isAuthenticated && isPublic) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, isPublic, pathname, router]);

  if (isLoading || (!isAuthenticated && !isPublic)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F8F6]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isLoading ? 'Restoring session' : 'Redirecting to sign in'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
