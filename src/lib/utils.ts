import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return `Rs. ${new Intl.NumberFormat('en-LK').format(amount)}`;
}

export function normalizeSearch(str: string) {
  return str.toLowerCase().replace(/[\s-]/g, '');
}
