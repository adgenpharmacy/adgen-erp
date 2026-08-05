'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Scan-to-pay block for the printed bill.
 *
 * The QR carries the UPI intent string, so any UPI app opens with the payee and the exact amount
 * already filled in — the patient cannot mistype the total, and the counter does not have to read
 * the figure out. A static printed QR (the one stuck to the counter) cannot do that: it makes the
 * payer enter the amount by hand, which is where the wrong amounts come from.
 *
 * Rendered as a data URI rather than a canvas because a canvas does not survive `window.print()`
 * reliably across browsers — it prints blank on some, which on a bill is worse than no QR at all.
 */
export default function UpiQr({
  upiId,
  payeeName,
  amount,
  note,
  size = 132,
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  // Amount must be plain decimal with two places; UPI apps reject grouped or currency-prefixed.
  const payable = Math.max(0, Number(amount) || 0).toFixed(2);
  const intent =
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(payeeName)}` +
    `&am=${payable}` +
    `&cu=INR` +
    (note ? `&tn=${encodeURIComponent(note)}` : '');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(intent, {
      width: size * 2, // rendered at 2x so it stays sharp when printed
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        /* no QR is better than a broken image; the UPI id is printed below regardless */
      });
    return () => {
      cancelled = true;
    };
  }, [intent, size]);

  if (!upiId) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5 print:border-slate-400">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Scan to pay ₹${payable}`} width={size} height={size} className="shrink-0" />
      ) : (
        <div style={{ width: size, height: size }} className="shrink-0 bg-slate-100" aria-hidden />
      )}
      <div className="text-[10px] leading-tight text-slate-700">
        <div className="text-[11px] font-extrabold text-slate-900">Scan &amp; Pay ₹{payable}</div>
        <div className="mt-0.5 font-semibold">{payeeName}</div>
        <div className="mt-1 font-mono text-[9px] break-all text-slate-600">{upiId}</div>
        <div className="mt-1 font-semibold text-slate-500">GPay · PhonePe · Paytm · BHIM</div>
      </div>
    </div>
  );
}
