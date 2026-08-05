'use client';

import { PAPER_SIZES, paperStyleSheet, type PaperSpec, type PaperSize } from './paper';

/**
 * Paper picker for a print modal, plus the stylesheet that pins the sheet to that size.
 *
 * The style tag rides along with the control so the two can never disagree: any modal that
 * offers the choice necessarily also applies it.
 */
export default function PaperSizeControl({
  spec,
  onChange,
}: {
  spec: PaperSpec;
  onChange: (size: PaperSize) => void;
}) {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: paperStyleSheet(spec) }} />

      <div className="flex items-center gap-1 rounded-md bg-slate-200/70 p-0.5 print:hidden" title={spec.hint}>
        {(Object.values(PAPER_SIZES) as PaperSpec[]).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={spec.id === option.id}
            className={
              spec.id === option.id
                ? 'rounded-sm bg-white px-2.5 py-1 text-[11px] font-extrabold text-slate-900 shadow-sm'
                : 'rounded-sm px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
