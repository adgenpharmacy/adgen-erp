'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors thrown by the root layout itself.
 * It replaces the root layout, so it must render its own <html> and <body>,
 * and cannot rely on the app's fonts, providers or Tailwind layer being mounted.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Fatal application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#f3f8f6',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            textAlign: 'center',
            background: '#ffffff',
            border: '1px solid #dfede8',
            borderRadius: '12px',
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
            AdGen ERP could not start
          </h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#475569' }}>
            The application failed to load. Your data has not been changed.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#475569',
                background: '#f0faf6',
                border: '1px solid #dfede8',
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              height: '2.5rem',
              padding: '0 1rem',
              background: '#059669',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
