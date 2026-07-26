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
