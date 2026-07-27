'use client';

import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const FIELD_BASE =
  'w-full bg-surface border border-line rounded-md text-sm text-fg ' +
  'transition-colors placeholder:text-fg-subtle ' +
  'hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none ' +
  'disabled:bg-sunken disabled:text-fg-subtle disabled:cursor-not-allowed';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label ? (
        <span className="block text-xs font-semibold text-fg-muted">
          {label}
          {required ? <span className="text-danger ml-0.5">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon: Icon, invalid, ...props },
  ref
) {
  const field = (
    <input
      ref={ref}
      className={cn(
        FIELD_BASE,
        'h-10 px-3',
        Icon && 'pl-9',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...props}
    />
  );

  if (!Icon) return field;

  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" aria-hidden />
      {field}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(FIELD_BASE, 'h-10 px-3 pr-8 cursor-pointer', className)} {...props}>
        {children}
      </select>
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_BASE, 'px-3 py-2 min-h-20 resize-y', className)} {...props} />;
  }
);
