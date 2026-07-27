import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page heading used by every screen — mirrors the legacy Flutter `ScreenShell`
 * header: title + subtitle on the left, actions on the right, hairline divider beneath.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Filters or tabs rendered below the title row, above the divider. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg truncate">{title}</h1>
          {subtitle ? <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      <div className="mt-4 border-b border-line" />
    </div>
  );
}
