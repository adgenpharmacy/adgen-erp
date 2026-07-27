'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Portal from './Portal';

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const;

/** Centred dialog with Escape-to-close and background scroll lock. */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof WIDTHS;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Rendered into <body>. A `position: fixed` element resolves against the nearest ancestor
  // that has a transform/filter/will-change — and a page-level enter animation is enough to
  // make one. That made dialogs centre on the whole page instead of the viewport, so on a
  // scrolled screen they opened partly (or entirely) out of view.
  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={cn(
              'w-full bg-surface border border-line rounded-xl shadow-pop',
              'max-h-[90vh] flex flex-col overflow-hidden',
              WIDTHS[size],
              className
            )}
          >
            {title ? (
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-fg truncate">{title}</h2>
                  {subtitle ? <p className="text-xs text-fg-subtle mt-0.5">{subtitle}</p> : null}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 -mr-1 rounded-md text-fg-subtle hover:bg-hover hover:text-fg transition-colors no-print"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto">{children}</div>

            {footer ? (
              <div className="px-5 py-3.5 border-t border-line bg-raised shrink-0 no-print">{footer}</div>
            ) : null}
          </motion.div>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}
