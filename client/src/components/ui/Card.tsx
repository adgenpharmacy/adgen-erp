import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** White surface with the clinical green-tinted hairline border. */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface border border-line rounded-lg shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-4 border-b border-line', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-fg truncate">{title}</h2>
        {subtitle ? <p className="text-xs text-fg-subtle mt-0.5 truncate">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
}
