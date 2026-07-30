'use client';

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Local calendar day as YYYY-MM-DD.
 *
 * Never derive this from toISOString(): that is UTC, and in IST it rolls the date over at 05:30,
 * so "today" on the counter would start showing yesterday's bills every morning.
 */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** Whether a timestamp falls on the given local calendar day. */
export function isOnDay(timestamp: string | Date | null | undefined, key: string): boolean {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return false;
  return dayKey(d) === key;
}

function shift(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const moved = new Date(y, m - 1, d + days);
  return dayKey(moved);
}

function labelFor(key: string): string {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === shift(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface DayNavigatorProps {
  /** Selected day, or null for "every date". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Shown beside the date, e.g. "12 bills · ₹4,300". */
  summary?: string;
  className?: string;
}

/**
 * Day-at-a-time browser for the bill lists.
 *
 * The counter's question is almost always "what did we do today", occasionally "what did we do
 * yesterday" — not "show me all 81 bills ever". Stepping a day at a time answers both without
 * touching the network: the bills are already in the shared cache, so this filters what is
 * loaded rather than refetching.
 */
export default function DayNavigator({ value, onChange, summary, className }: DayNavigatorProps) {
  const today = todayKey();
  const isAll = value === null;
  // Tomorrow's bills cannot exist, so the forward arrow stops at today.
  const atToday = value === today;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center rounded-md border border-line bg-surface">
        <button
          type="button"
          onClick={() => onChange(shift(value ?? today, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-l-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg"
          title="Previous day"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="flex min-w-[9.5rem] items-center justify-center gap-1.5 border-x border-line px-3 text-sm font-bold text-fg">
          <CalendarDays className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
          {isAll ? 'All dates' : labelFor(value)}
        </span>

        <button
          type="button"
          onClick={() => onChange(shift(value ?? today, 1))}
          disabled={atToday}
          className="flex h-9 w-9 items-center justify-center rounded-r-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          title={atToday ? 'Already at today' : 'Next day'}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <input
        type="date"
        value={isAll ? '' : value}
        max={today}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 rounded-md border border-line bg-surface px-2 text-sm font-semibold text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        aria-label="Jump to date"
      />

      <button
        type="button"
        onClick={() => onChange(today)}
        aria-pressed={atToday}
        className={cn(
          'h-9 rounded-md px-3 text-xs font-bold transition-colors',
          atToday ? 'bg-brand text-brand-fg' : 'border border-line text-fg-muted hover:text-fg'
        )}
      >
        Today
      </button>

      <button
        type="button"
        onClick={() => onChange(isAll ? today : null)}
        aria-pressed={isAll}
        className={cn(
          'h-9 rounded-md px-3 text-xs font-bold transition-colors',
          isAll ? 'bg-brand text-brand-fg' : 'border border-line text-fg-muted hover:text-fg'
        )}
      >
        All dates
      </button>

      {summary ? <span className="text-xs font-semibold text-fg-muted">{summary}</span> : null}
    </div>
  );
}
