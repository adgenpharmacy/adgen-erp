import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Consistent "nothing here" panel — replaces the ad-hoc one-liners each page used to ship. */
export default function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-14', className)}>
      <span className="p-3 rounded-full bg-sunken text-brand mb-3">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {message ? <p className="mt-1 text-sm text-fg-subtle max-w-sm">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
