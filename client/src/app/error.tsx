'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';

/**
 * Route-level error boundary. Without this, an uncaught render error showed Next's
 * unbranded default screen with no way back other than the browser's back button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled page error:', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-card">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>

        <h1 className="text-lg font-bold text-fg">Something went wrong on this screen</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Your data has not been changed. Try loading the screen again — if it keeps failing,
          note the reference below when reporting it.
        </p>

        {error.digest ? (
          <p className="mt-3 rounded-md border border-line bg-raised px-3 py-2 font-mono text-xs text-fg-muted">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
