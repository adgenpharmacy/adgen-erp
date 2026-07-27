'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Table footer pager. Replaces the previous `.slice(0, 300)`, which silently hid
 * ~2,700 of 3,007 products with no indication that anything was missing.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100, 250, 500],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line bg-raised px-4 py-2.5',
        className
      )}
    >
      <p className="text-xs text-fg-muted tabular-nums">
        Showing <span className="font-bold text-fg">{from.toLocaleString('en-IN')}</span>–
        <span className="font-bold text-fg">{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="font-bold text-fg">{total.toLocaleString('en-IN')}</span>
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(current - 1)}
            disabled={current <= 1}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs font-semibold text-fg-muted tabular-nums">
            {current} / {pageCount}
          </span>
          <button
            onClick={() => onPageChange(current + 1)}
            disabled={current >= pageCount}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
