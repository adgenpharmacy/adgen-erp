'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into `document.body`.
 *
 * Print modals must not be nested inside `<main>`: the print stylesheet hides `main` (along with
 * `aside`/`nav`/`header`) to strip app chrome off the printed page, which would hide the invoice
 * too. Portalling keeps them siblings of the layout regardless of where a page mounts them.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
