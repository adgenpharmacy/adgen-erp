'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-hover disabled:bg-sunken disabled:text-fg-subtle',
  outline:
    'bg-surface text-fg border border-line hover:bg-hover hover:border-line-strong disabled:text-fg-subtle',
  ghost:
    'bg-transparent text-fg-muted hover:bg-hover hover:text-fg disabled:text-fg-subtle',
  danger:
    'bg-danger text-white hover:brightness-95 active:brightness-90 disabled:bg-sunken disabled:text-fg-subtle',
  subtle:
    'bg-brand-subtle text-brand-hover hover:bg-brand-line disabled:bg-sunken disabled:text-fg-subtle',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Renders a square icon-only button at the chosen size. */
  iconOnly?: boolean;
}

/** Primary action control. Mirrors the legacy Flutter `AppButton` variants. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, iconOnly = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-colors duration-150 select-none',
        'disabled:cursor-not-allowed active:scale-[0.98]',
        SIZES[size],
        iconOnly && (size === 'sm' ? 'w-8 px-0' : size === 'lg' ? 'w-12 px-0' : 'w-10 px-0'),
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </button>
  );
});

export default Button;
