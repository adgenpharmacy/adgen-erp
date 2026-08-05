'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Arrow-key navigation for a search dropdown.
 *
 * The counter is worked with both hands on the keyboard: the operator types a few letters and
 * expects to arrow down and press Enter. Without this the only way to choose a medicine was to
 * let go of the keyboard and reach for the mouse, once per line.
 *
 * Returns the highlighted index, a keydown handler for the search input, and a ref callback to
 * put on each option so the highlighted one can be scrolled into view.
 *
 * @param count   how many options are currently listed
 * @param onPick  called with the chosen index when Enter is pressed
 * @param onClose called on Escape
 */
export function useListboxKeys(count: number, onPick: (index: number) => void, onClose?: () => void) {
  const [highlight, setHighlight] = useState(0);
  const [seenCount, setSeenCount] = useState(count);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);

  /*
   * A changed result set invalidates the old position — otherwise the highlight can sit past the
   * end of a now-shorter list and Enter picks nothing. Adjusted during render rather than in an
   * effect: React re-runs this render immediately with the corrected value, so the list is never
   * painted with a stale highlight, and no extra commit is queued.
   */
  if (seenCount !== count) {
    setSeenCount(count);
    setHighlight(0);
  }

  const setOptionRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      optionRefs.current[index] = el;
    },
    []
  );

  const scrollTo = (index: number) => {
    optionRefs.current[index]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (count === 0) {
        if (e.key === 'Escape') onClose?.();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((current) => {
          const next = current + 1 >= count ? 0 : current + 1;
          scrollTo(next);
          return next;
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((current) => {
          const next = current - 1 < 0 ? count - 1 : current - 1;
          scrollTo(next);
          return next;
        });
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        setHighlight(0);
        scrollTo(0);
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        setHighlight(count - 1);
        scrollTo(count - 1);
        return;
      }

      if (e.key === 'Enter') {
        // Only claim Enter when there is something to choose, so an empty search still submits
        // whatever the surrounding form does with it.
        e.preventDefault();
        onPick(highlight);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    },
    [count, highlight, onPick, onClose]
  );

  return { highlight, setHighlight, onKeyDown, setOptionRef };
}

/**
 * Enter moves to the next field instead of submitting the form.
 *
 * Data entry here is a long run of short fields — batch, expiry, quantity, rate — and a form
 * that submits on the first Enter is unusable for that. Give each field a name and the order
 * they should be walked in.
 */
export function useFieldChain(order: string[]) {
  const refs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const register = useCallback(
    (name: string) => (el: HTMLInputElement | HTMLSelectElement | null) => {
      refs.current[name] = el;
    },
    []
  );

  const focusField = useCallback((name: string) => {
    const el = refs.current[name];
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const onKeyDown = useCallback(
    (name: string) => (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const index = order.indexOf(name);
      if (index === -1) return;
      e.preventDefault();
      const next = order[index + 1];
      if (next) focusField(next);
      else (e.target as HTMLElement).blur();
    },
    [order, focusField]
  );

  return { register, focusField, onKeyDown };
}
