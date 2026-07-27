'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  Search,
  ArrowRight,
  Package,
  Receipt,
  ShoppingBag,
  Users,
  Building2,
  RotateCcw,
  BarChart3,
  X,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

const OPEN_EVENT = 'adgen:open-command-palette';

/** Lets non-adjacent chrome (e.g. the mobile header) raise the palette. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface PaletteItem {
  title: string;
  sub?: string;
  path: string;
  icon: LucideIcon;
}

const DEFAULT_ITEMS: PaletteItem[] = [
  { title: 'New Sale / POS Counter', path: '/billing', icon: Receipt },
  { title: 'New Purchase Entry', path: '/purchases/new', icon: ShoppingBag },
  { title: 'Inventory & Stock Valuation', path: '/inventory', icon: Package },
  { title: 'Products Catalog', path: '/products', icon: Package },
  { title: 'Sales Ledger', path: '/sales', icon: Receipt },
  { title: 'Purchases Ledger', path: '/purchases', icon: ShoppingBag },
  { title: 'Returns', path: '/returns', icon: RotateCcw },
  { title: 'Reports', path: '/reports', icon: BarChart3 },
  { title: 'Customers Directory', path: '/customers', icon: Users },
  { title: 'Suppliers Directory', path: '/parties', icon: Building2 },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PaletteItem[]>(DEFAULT_ITEMS);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Ctrl/Cmd+K toggles from anywhere; the mobile header dispatches the same open event.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Debounced inventory search; falls back to the navigation shortcuts when the box is empty.
  useEffect(() => {
    if (!isOpen) return;

    const term = query.trim();
    if (!term) {
      setResults(DEFAULT_ITEMS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/inventory?q=${encodeURIComponent(term)}`);
        if (cancelled) return;
        const items: PaletteItem[] = (res.data || []).slice(0, 8).map((p: Record<string, unknown>) => {
          const name = String(p.productName || p.name || 'Unnamed');
          return {
            title: name,
            sub: `Stock ${Number(p.totalStock ?? p.systemStock ?? 0)} · MRP ${formatCurrency(Number(p.mrp) || 0)}`,
            path: `/inventory?q=${encodeURIComponent(name)}`,
            icon: Package,
          };
        });
        setResults(items);
        setSelectedIndex(0);
      } catch (err) {
        if (!cancelled) {
          console.error('CommandPalette search error:', err);
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      close();
      router.push(item.path);
    },
    [close, router]
  );

  // Arrow keys / Enter / Escape. The previous version tracked selectedIndex but never moved it.
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (results.length ? (i + 1) % results.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) handleSelect(item);
    }
  };

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, results]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Global search (Ctrl+K)"
        className={cn(
          'hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-2 no-print',
          'h-11 pl-4 pr-3 rounded-full bg-brand text-brand-fg shadow-pop',
          'hover:bg-brand-hover active:scale-95 transition'
        )}
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="text-xs font-bold">Search</span>
        <kbd className="text-[10px] font-mono font-bold bg-white/20 rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4 no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="w-full max-w-xl bg-surface border border-line rounded-xl shadow-pop overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="h-5 w-5 text-brand shrink-0" aria-hidden />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search medicines, or jump to a page…"
            className="flex-1 bg-transparent text-sm font-medium text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            onClick={close}
            aria-label="Close search"
            className="p-1.5 rounded-md text-fg-subtle hover:bg-hover hover:text-fg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-88 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">Searching inventory…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">No matching medicines or pages</p>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon;
              const selected = idx === selectedIndex;
              return (
                <button
                  key={`${item.path}-${idx}`}
                  data-selected={selected}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                    selected ? 'bg-brand-subtle' : 'hover:bg-hover'
                  )}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'p-2 rounded-md shrink-0',
                        selected ? 'bg-brand text-brand-fg' : 'bg-sunken text-brand'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg truncate">{item.title}</span>
                      {item.sub ? (
                        <span className="block text-xs text-fg-subtle font-mono truncate">{item.sub}</span>
                      ) : null}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-fg-subtle shrink-0" aria-hidden />
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 bg-raised border-t border-line text-[11px] text-fg-subtle font-medium">
          <span>AdGen ERP · Global Search</span>
          <span className="flex items-center gap-2">
            <kbd className="font-mono font-bold">↑↓</kbd> navigate
            <kbd className="font-mono font-bold">↵</kbd> open
            <kbd className="font-mono font-bold">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
