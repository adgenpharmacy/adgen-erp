'use client';

import { useState } from 'react';

/**
 * Paper size for the printed documents.
 *
 * The stylesheet used to leave `@page { size: auto }`, which hands the decision to whatever the
 * browser's print dialog happened to be set to. The same bill therefore came out at a different
 * size on different machines, and the layout — fluid width, fixed font sizes — reflowed with it.
 * Choosing the size here lets the sheet be pinned to real millimetre widths and the type scaled
 * to match, so a bill looks the same everywhere.
 */
export type PaperSize = 'A4' | 'A5' | 'THERMAL_80';

export interface PaperSpec {
  id: PaperSize;
  label: string;
  /** What goes in `@page { size: … }`. */
  cssSize: string;
  /** Printable width of the sheet. */
  widthMm: number;
  /** Gutter. Zero page margin is what suppresses the browser's own header and footer. */
  paddingCss: string;
  /** Base font size for the sheet; everything inside is sized in relative units off this. */
  baseFontPx: number;
  /** Roll paper is narrow and monochrome: the wider tables have to shed columns. */
  compact: boolean;
  hint: string;
}

export const PAPER_SIZES: Record<PaperSize, PaperSpec> = {
  A4: {
    id: 'A4',
    label: 'A4',
    cssSize: 'A4 portrait',
    widthMm: 210,
    paddingCss: '10mm 9mm',
    baseFontPx: 12,
    compact: false,
    hint: '210 × 297 mm — standard sheet',
  },
  A5: {
    id: 'A5',
    label: 'A5',
    cssSize: 'A5 portrait',
    widthMm: 148,
    paddingCss: '7mm 6mm',
    baseFontPx: 10,
    compact: false,
    hint: '148 × 210 mm — half sheet, saves paper',
  },
  THERMAL_80: {
    id: 'THERMAL_80',
    label: '80mm roll',
    // Height is left to the content: a receipt roll has no page length.
    cssSize: '80mm auto',
    widthMm: 80,
    paddingCss: '3mm 2mm',
    baseFontPx: 9,
    compact: true,
    hint: '80 mm thermal receipt printer',
  },
};

const STORAGE_KEY = 'adgen_paper_size';

/** Remembered across prints and sessions, so the counter sets it once. */
export function usePaperSize(): [PaperSpec, (size: PaperSize) => void] {
  /*
   * Read lazily on first render rather than in an effect: the print modal is opened by a click,
   * so there is no server render to mismatch, and setting state from an effect would render the
   * A4 layout for a frame before snapping to the remembered size.
   */
  const [size, setSize] = useState<PaperSize>(() => {
    if (typeof window === 'undefined') return 'A4';
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PaperSize | null;
      return saved && PAPER_SIZES[saved] ? saved : 'A4';
    } catch {
      return 'A4';
    }
  });

  const choose = (next: PaperSize) => {
    setSize(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not worth failing a print over */
    }
  };

  return [PAPER_SIZES[size], choose];
}

/**
 * The rules that pin a print to the chosen sheet.
 *
 * Injected as a plain `<style>` rather than written into globals.css because `@page` cannot read
 * CSS custom properties — the size has to be a literal, so the rule is rebuilt when it changes.
 */
export function paperStyleSheet(spec: PaperSpec): string {
  return `
@media print {
  @page { size: ${spec.cssSize}; margin: 0; }

  .print-area {
    width: ${spec.widthMm}mm !important;
    max-width: ${spec.widthMm}mm !important;
    padding: ${spec.paddingCss} !important;
    font-size: ${spec.baseFontPx}px !important;
    margin: 0 auto !important;
  }

  /* Roll paper: drop the columns that cannot fit and let rows breathe instead. */
  ${spec.compact
    ? `.print-area .print-optional { display: none !important; }
       .print-area table { table-layout: fixed !important; width: 100% !important; }
       .print-area td, .print-area th { padding-left: 1px !important; padding-right: 1px !important; word-break: break-word; }`
    : ''}
}
`;
}
