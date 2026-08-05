'use client';

import { useEffect, useState } from 'react';
import { LogIn, LogOut, Clock } from 'lucide-react';
import { useAttendance, formatWorkedMinutes } from '@/context/AttendanceContext';
import { useToast } from '@/components/ui';
import { getApiErrorMessage } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Clock in and out, and the running total for today.
 *
 * Sits in the sidebar rather than on an attendance page: a button someone has to navigate to is
 * a button that gets forgotten, and a forgotten clock-in is an absent day in the record.
 */
export default function ClockControl({ compact = false }: { compact?: boolean }) {
  const { openSession, todayMinutes, idleTimeoutMinutes, loading, clockIn, clockOut, refresh } = useAttendance();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  /*
   * The running total is asked of the server once a minute rather than counted forward from
   * clock-in in the browser. Reading the clock during render is not idempotent, and the server
   * is the side that decides what a shift is worth anyway — including closing it for idleness,
   * which a locally-counted timer would happily keep incrementing straight past.
   */
  useEffect(() => {
    if (!openSession) return;
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [openSession, refresh]);

  if (loading) return null;

  const total = todayMinutes;

  /*
   * Compact form for the mobile header. The sidebar — and with it the full control — is hidden
   * below the md breakpoint, so without this anyone working from a phone could not clock in at
   * all and would simply be absent from the record.
   */
  if (compact) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => act(openSession ? 'out' : 'in')}
        title={openSession ? 'Clock out' : 'Clock in'}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition-colors disabled:opacity-50',
          openSession ? 'bg-brand-subtle text-brand-hover' : 'border border-line text-fg-muted'
        )}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono">{formatWorkedMinutes(total)}</span>
        <span className="sr-only">{openSession ? 'Clock out' : 'Clock in'}</span>
      </button>
    );
  }

  const act = async (which: 'in' | 'out') => {
    setBusy(true);
    try {
      if (which === 'in') {
        await clockIn();
        toast.success('Clocked in', 'Your shift has started.');
      } else {
        await clockOut();
        toast.success('Clocked out', `${formatWorkedMinutes(total)} recorded for today.`);
      }
    } catch (err) {
      toast.error(which === 'in' ? 'Could not clock in' : 'Could not clock out', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('rounded-md border border-line bg-surface p-2.5', compact && 'p-2')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-fg-subtle">
          <Clock className={cn('h-3.5 w-3.5', openSession ? 'text-brand' : 'text-fg-subtle')} aria-hidden />
          {openSession ? 'On shift' : 'Off shift'}
        </span>
        <span className="font-mono text-xs font-black text-fg">{formatWorkedMinutes(total)}</span>
      </div>

      {openSession ? (
        <p className="mt-1 text-[10px] text-fg-subtle">
          Since{' '}
          {new Date(openSession.clockInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          {' · '}auto clock-out after {idleTimeoutMinutes}m idle
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-fg-subtle">Clock in to record today&apos;s attendance.</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => act(openSession ? 'out' : 'in')}
        className={cn(
          'mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-50',
          openSession
            ? 'border border-line text-fg-muted hover:bg-hover hover:text-fg'
            : 'bg-brand text-brand-fg hover:bg-brand-hover'
        )}
      >
        {openSession ? <LogOut className="h-3.5 w-3.5" aria-hidden /> : <LogIn className="h-3.5 w-3.5" aria-hidden />}
        {openSession ? 'Clock out' : 'Clock in'}
      </button>
    </div>
  );
}
