'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Defaults to true. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based replacement for `window.confirm`, so a destructive action reads as:
 *   if (!(await confirm({ title: '…' }))) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal
        open={!!options}
        onClose={() => settle(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={destructive ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 p-5">
          {destructive ? (
            <span className="shrink-0 rounded-md bg-danger-subtle p-2 text-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <p className="text-sm text-fg-muted">
            {options?.message ?? 'This action cannot be undone.'}
          </p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
