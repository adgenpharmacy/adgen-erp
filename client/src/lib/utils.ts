import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/A';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPackQuantity(
  quantity: number | null | undefined,
  packSize?: number | null,
  packUnit?: string | null,
  contentUnit?: string | null
): string {
  const qty = Math.max(0, Number(quantity) || 0);
  const pack = Math.max(1, Number(packSize) || 1);
  const pUnit = packUnit || 'Strip';
  const cUnit = contentUnit || 'Tablet';

  if (pack <= 1) {
    return `${qty} ${qty === 1 ? 'Unit' : 'Units'}`;
  }

  const decimalStrips = Math.round((qty / pack) * 100) / 100;
  const strips = Math.floor(qty / pack);
  const loose = Math.round(qty % pack);

  if (strips > 0 && loose > 0) {
    return `${decimalStrips} ${pUnit}s (${strips} ${pUnit} + ${loose} Loose)`;
  }
  if (strips > 0) {
    return `${strips} ${strips === 1 ? pUnit : pUnit + 's'} (${qty} ${cUnit}s)`;
  }
  return `${loose} Loose ${loose === 1 ? cUnit : cUnit + 's'}`;
}

export function numberToWords(num: number): string {
  if (num === null || num === undefined || isNaN(num) || num === 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
  }

  const intPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - intPart) * 100);

  let words = inWords(intPart) + ' Rupees';
  if (decimalPart > 0) {
    words += ' and ' + inWords(decimalPart) + ' Paise';
  }
  return words + ' Only';
}

/**
 * Normalises what an operator types into an expiry field to `MM/YY`.
 *
 * At the counter people type the four digits straight off the strip — "0727" — rather than
 * reaching for the slash. Accepts "0727", "07/27", "7/27", "72027" and returns "07/27".
 * Anything not yet recognisable is returned as typed so the field stays editable mid-entry.
 */
/**
 * Renders a stored date as the MM/YY the expiry field expects, or '' when it cannot.
 *
 * `new Date('nonsense').toLocaleDateString()` returns the literal string "Invalid Date",
 * which used to be written straight into the expiry input when an existing bill was opened
 * for editing. It carries no slash, so it slipped through the submit mapping untouched and
 * reached Prisma as `new Date("Invalid Date")`, failing the whole save.
 */
export function toExpiryMMYY(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' });
}

/** True when the text is a complete MM/YY with a real month. */
export function isCompleteExpiry(raw: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec((raw || '').trim());
  if (!m) return false;
  const month = parseInt(m[1], 10);
  return month >= 1 && month <= 12;
}

export function normalizeExpiryInput(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 0) return '';

  // 1-2 digits: still typing the month.
  if (digits.length <= 2) return digits;

  // 3 digits is ambiguous: "727" means July 2027, but "122" is someone halfway through
  // typing 12/2x. Only treat the first digit as a whole month when it cannot begin a
  // two-digit month — that is, 2..9. Leading 0 or 1 keeps both digits as the month, so
  // October, November and December stay reachable. Assuming a single digit here silently
  // rewrote 12/25 to 01/25 and saved the batch under the wrong expiry.
  if (digits.length === 3) {
    if (digits[0] >= '2') return `0${digits[0]}/${digits.slice(1)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  // 4 digits: MMYY
  if (digits.length === 4) {
    const mm = digits.slice(0, 2);
    const yy = digits.slice(2);
    return `${mm}/${yy}`;
  }

  // 5-6 digits: MMYYYY -> keep the last two year digits.
  const mm = digits.slice(0, 2);
  const yy = digits.slice(-2);
  return `${mm}/${yy}`;
}

export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || isNaN(quantity)) return '0';
  const num = Number(quantity);
  if (Number.isInteger(num)) return num.toString();
  const rounded = Math.round(num * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}
