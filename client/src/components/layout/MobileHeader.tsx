'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { openCommandPalette } from '@/components/common/CommandPalette';

/** Brand + search bar for small screens, where the sidebar is hidden. */
export default function MobileHeader() {
  const { user } = useAuth();

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-surface border-b border-line no-print">
      <Link href="/" className="flex items-center gap-2 min-w-0">
        <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="font-extrabold text-fg text-sm tracking-tight truncate">
          AdGen <span className="text-brand font-mono text-[11px]">ERP</span>
        </span>
      </Link>

      <button
        onClick={openCommandPalette}
        aria-label="Search"
        className="ml-auto p-2 rounded-md text-fg-subtle hover:bg-hover hover:text-fg transition-colors"
      >
        <Search className="h-5 w-5" />
      </button>

      {user ? (
        <span className="h-8 w-8 rounded-full bg-brand text-brand-fg flex items-center justify-center font-extrabold text-xs shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </span>
      ) : null}
    </header>
  );
}
