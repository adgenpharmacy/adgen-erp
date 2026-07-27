'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const TONES: Record<ToastTone, { icon: typeof CheckCircle2; ring: string; iconClass: string }> = {
  success: { icon: CheckCircle2, ring: 'border-brand-line', iconClass: 'text-brand bg-brand-subtle' },
  error: { icon: XCircle, ring: 'border-danger-line', iconClass: 'text-danger bg-danger-subtle' },
  warning: { icon: AlertTriangle, ring: 'border-warn-line', iconClass: 'text-warn bg-warn-subtle' },
  info: { icon: Info, ring: 'border-info-line', iconClass: 'text-info bg-info-subtle' },
};

interface ToastApi {
  toast: (tone: ToastTone, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Non-blocking replacement for `window.alert`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, tone, title, description }]);
      // Errors linger — the operator may have looked away from the counter.
      const ttl = tone === 'error' ? 8000 : 4000;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (t, d) => toast('success', t, d),
      error: (t, d) => toast('error', t, d),
      warning: (t, d) => toast('warning', t, d),
      info: (t, d) => toast('info', t, d),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 no-print sm:inset-x-auto sm:right-4 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const cfg = TONES[t.tone];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={cn(
                  'pointer-events-auto w-full max-w-sm rounded-lg border bg-surface p-3 shadow-pop',
                  cfg.ring
                )}
                role={t.tone === 'error' ? 'alert' : 'status'}
              >
                <div className="flex items-start gap-2.5">
                  <span className={cn('shrink-0 rounded-md p-1.5', cfg.iconClass)}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-fg">{t.title}</p>
                    {t.description ? (
                      <p className="mt-0.5 text-xs text-fg-muted break-words">{t.description}</p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
