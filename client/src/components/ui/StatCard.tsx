import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StatTone = 'brand' | 'info' | 'warn' | 'danger' | 'accent' | 'teal';

/** Accent drives the icon tint and the signature bottom rule (from the legacy Flutter StatCard). */
const TONES: Record<StatTone, { icon: string; bar: string; value?: string }> = {
  brand: { icon: 'text-brand bg-brand-subtle', bar: 'bg-brand' },
  info: { icon: 'text-info bg-info-subtle', bar: 'bg-info' },
  warn: { icon: 'text-warn bg-warn-subtle', bar: 'bg-warn', value: 'text-warn' },
  danger: { icon: 'text-danger bg-danger-subtle', bar: 'bg-danger', value: 'text-danger' },
  accent: { icon: 'text-accent bg-accent-subtle', bar: 'bg-accent' },
  teal: { icon: 'text-teal bg-teal-subtle', bar: 'bg-teal' },
};

export default function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = 'brand',
  href,
  emphasizeValue = false,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  /** Colour the number with the tone — use for alert metrics only. */
  emphasizeValue?: boolean;
}) {
  const t = TONES[tone];

  const body = (
    <>
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
          <span className={cn('p-1.5 rounded-md shrink-0', t.icon)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div
          data-metric
          className={cn(
            'mt-3 text-2xl font-extrabold tracking-tight truncate',
            emphasizeValue && t.value ? t.value : 'text-fg'
          )}
        >
          {value}
        </div>
        {sublabel ? <p className="mt-0.5 text-xs text-fg-subtle truncate">{sublabel}</p> : null}
      </div>
      <div className={cn('h-[3px] rounded-b-lg', t.bar)} aria-hidden />
    </>
  );

  const shell = cn(
    'flex flex-col justify-between bg-surface border border-line rounded-lg shadow-card overflow-hidden',
    href && 'transition-colors hover:bg-raised'
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
