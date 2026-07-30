'use client';

import { useEffect, useState } from 'react';
import { Wrench, RefreshCw } from 'lucide-react';
import { MAINTENANCE_EVENT, api } from '@/lib/api-client';

/**
 * Full-screen notice shown while the API reports it is down for maintenance.
 *
 * It blocks the app rather than sitting in a corner: during the database move nothing entered can
 * be saved, and a half-usable screen is how a day's bills get lost. It clears itself as soon as a
 * probe succeeds, so the counter comes back on its own without anyone reloading.
 */
export default function MaintenanceOverlay() {
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onMaintenance = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || 'The system is down for scheduled maintenance.');
    };
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
  }, []);

  // While blocked, poll gently until the API answers normally again.
  useEffect(() => {
    if (!message) return;
    const probe = async () => {
      setChecking(true);
      try {
        await api.get('/settings');
        setMessage(null);
      } catch {
        /* still down; the interval will try again */
      } finally {
        setChecking(false);
      }
    };
    const id = setInterval(probe, 15000);
    return () => clearInterval(id);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/95 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warn-subtle">
          <Wrench className="h-6 w-6 text-warn" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-black text-fg">Down for maintenance</h2>
        <p className="mt-2 text-sm text-fg-muted">{message}</p>
        <p className="mt-3 text-xs font-semibold text-fg-subtle">
          Do not raise bills until this clears — nothing entered now can be saved. This screen
          disappears by itself when the system is back.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-fg-subtle">
          <RefreshCw className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden />
          {checking ? 'Checking…' : 'Checking every 15 seconds'}
        </div>
      </div>
    </div>
  );
}
