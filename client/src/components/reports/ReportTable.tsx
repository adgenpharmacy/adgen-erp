'use client';

import { useMemo, useState, Fragment } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  /** Value used for sorting, CSV export and (unless `render` is given) display. */
  value: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Rendered under the last column as a total. */
  total?: (rows: T[]) => React.ReactNode;
  className?: string;
}

interface ReportTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Rendered inside the row when it is expanded — the workings behind that row. */
  expand?: (row: T) => React.ReactNode;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  empty?: string;
  /** Filename stem for the CSV download. Omit to hide the export button. */
  exportName?: string;
  caption?: React.ReactNode;
  maxHeight?: string;
}

/**
 * The one table used by every report.
 *
 * Two things it must do that the old hand-rolled tables did not: sort on any column, and open a
 * row to show what the number is made of. A pharmacy owner reading a profit figure has to be
 * able to get from it to the bill and then to the line, without asking anyone.
 */
export default function ReportTable<T>({
  rows,
  columns,
  rowKey,
  expand,
  initialSort,
  empty = 'Nothing in this period.',
  exportName,
  caption,
  maxHeight,
}: ReportTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      !current || current.key !== key
        ? { key, direction: 'desc' }
        : current.direction === 'desc'
          ? { key, direction: 'asc' }
          : null
    );
  };

  const toggleRow = (key: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCsv = () => {
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      columns.map((c) => escape(c.header)).join(','),
      ...sorted.map((r) => columns.map((c) => escape(c.value(r))).join(',')),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasTotals = columns.some((c) => c.total);

  return (
    <div className="rounded-lg border border-line bg-surface shadow-xs">
      {(caption || exportName) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="text-sm font-bold text-fg">{caption}</div>
          {exportName && rows.length > 0 ? (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-bold text-fg-muted transition-colors hover:text-fg"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV
            </button>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-line bg-raised text-[11px] font-extrabold uppercase text-fg-muted">
              {expand ? <th className="w-8 px-2 py-3" aria-label="Expand" /> : null}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'whitespace-nowrap px-3 py-3',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-fg',
                        active && 'text-fg',
                        c.align === 'right' && 'flex-row-reverse'
                      )}
                    >
                      {c.header}
                      <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-line font-medium text-fg">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (expand ? 1 : 0)} className="px-4 py-10 text-center text-fg-muted">
                  {empty}
                </td>
              </tr>
            ) : null}

            {sorted.map((row) => {
              const key = rowKey(row);
              const isOpen = open.has(key);
              return (
                <Fragment key={key}>
                  <tr
                    className={cn('hover:bg-raised', expand && 'cursor-pointer')}
                    onClick={expand ? () => toggleRow(key) : undefined}
                  >
                    {expand ? (
                      <td className="px-2 py-2.5 text-fg-subtle">
                        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} aria-hidden />
                      </td>
                    ) : null}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'whitespace-nowrap px-3 py-2.5',
                          c.align === 'right' && 'text-right font-mono',
                          c.align === 'center' && 'text-center',
                          c.className
                        )}
                      >
                        {c.render ? c.render(row) : c.value(row)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && expand ? (
                    <tr className="bg-sunken/60">
                      <td colSpan={columns.length + 1} className="px-4 py-3">
                        {expand(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>

          {hasTotals && sorted.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-fg bg-raised text-xs font-black">
                {expand ? <td /> : null}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-3 py-3', c.align === 'right' && 'text-right font-mono', c.align === 'center' && 'text-center')}
                  >
                    {c.total ? c.total(sorted) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
