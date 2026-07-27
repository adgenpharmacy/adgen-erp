import Link from 'next/link';
import { FileQuestion, LayoutDashboard, ScanLine } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-card">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-brand">
          <FileQuestion className="h-6 w-6" aria-hidden />
        </span>

        <h1 className="text-lg font-bold text-fg">Page not found</h1>
        <p className="mt-2 text-sm text-fg-muted">
          That screen doesn&apos;t exist. It may have been renamed, or the link was mistyped.
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Dashboard
          </Link>
          <Link
            href="/billing"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            Billing counter
          </Link>
        </div>
      </div>
    </main>
  );
}
