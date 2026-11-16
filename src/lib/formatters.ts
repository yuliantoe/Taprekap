import type { CardIssuer, ReimburseStatus, TransactionCategory } from '../types';

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTimeId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateShortId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export const ISSUER_META: Record<
  CardIssuer,
  {
    name: string;
    shortName: string;
    bank: string;
    gradient: string;
    accentHex: string;
    textColor: string;
  }
> = {
  mandiri: {
    name: 'Mandiri e-Money',
    shortName: 'e-Money',
    bank: 'Bank Mandiri',
    gradient: 'from-slate-900 via-blue-950 to-amber-900',
    accentHex: '#003D79',
    textColor: 'text-white',
  },
  bca: {
    name: 'BCA Flazz',
    shortName: 'Flazz',
    bank: 'Bank Central Asia',
    gradient: 'from-blue-900 via-blue-800 to-sky-700',
    accentHex: '#005FAF',
    textColor: 'text-white',
  },
  bri: {
    name: 'BRI Brizzi',
    shortName: 'Brizzi',
    bank: 'Bank Rakyat Indonesia',
    gradient: 'from-blue-950 via-indigo-900 to-orange-700',
    accentHex: '#00529C',
    textColor: 'text-white',
  },
  bni: {
    name: 'BNI TapCash',
    shortName: 'TapCash',
    bank: 'Bank Negara Indonesia',
    gradient: 'from-teal-950 via-teal-900 to-orange-700',
    accentHex: '#006677',
    textColor: 'text-white',
  },
  kmt: {
    name: 'KMT / JakLingko',
    shortName: 'KMT',
    bank: 'Commuter / Transport',
    gradient: 'from-zinc-900 via-slate-800 to-rose-900',
    accentHex: '#BE123C',
    textColor: 'text-white',
  },
};

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  tol: 'Jalan Tol',
  parkir: 'Parkir',
  transportasi: 'KRL / MRT / TransJakarta',
  bbm: 'BBM / SPBU',
  belanja: 'Merchant / Retail',
  topup: 'Isi Saldo (Top Up)',
  lainnya: 'Operasional Lainnya',
};

export const REIMBURSE_STATUS_LABELS: Record<ReimburseStatus, string> = {
  unclaimed: 'Belum Direkap',
  in_batch: 'Masuk Draft Rekap',
  submitted: 'Diajukan ke Kantor',
  approved: 'Disetujui Finance',
};
