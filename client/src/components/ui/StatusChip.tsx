import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent';

const TONES: Record<ChipTone, string> = {
  success: 'bg-brand-subtle text-brand-hover',
  warning: 'bg-warn-subtle text-warn',
  error: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-sky-700',
  neutral: 'bg-sunken text-fg-muted',
  accent: 'bg-accent-subtle text-accent',
};

/** Pill status label. Mirrors the legacy Flutter `StatusChip`. */
export default function StatusChip({
  children,
  tone = 'neutral',
  small = false,
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  small?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold whitespace-nowrap',
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
