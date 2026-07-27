import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Horizontally scrollable wrapper — wide ERP tables must never scroll the page body. */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('w-full overflow-x-auto', className)}>{children}</div>;
}

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full min-w-max text-left border-collapse', className)} {...props}>
      {children}
    </table>
  );
}

export function THead({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-raised sticky top-0 z-10', className)} {...props}>
      {children}
    </thead>
  );
}

export function TH({ className, children, align, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted',
        'border-b border-line whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TR({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('linear-row border-b border-line-light last:border-0', className)} {...props}>
      {children}
    </tr>
  );
}

export function TD({ className, children, align, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'px-4 py-2.5 text-sm text-fg align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}
