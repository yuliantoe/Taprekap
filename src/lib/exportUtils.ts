import type { EMoneyCard, EMoneyTransaction, ReimburseBatch } from '../types';
import { CATEGORY_LABELS, formatDateTimeId, ISSUER_META } from './formatters';

function csvEscape(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateReimburseCsv({
  batch,
  transactions,
  cards,
}: {
  batch: ReimburseBatch;
  transactions: EMoneyTransaction[];
  cards: EMoneyCard[];
}): void {
  const headers = [
    'No',
    'No Laporan',
    'Karyawan',
    'NIK/ID',
    'Departemen',
    'Waktu Transaksi',
    'Penerbit Kartu',
    'Nomor Kartu',
    'UID NFC',
    'Kode Verifikasi QR',
    'Kategori',
    'Merchant / Gerbang',
    'Lokasi',
    'Keterangan',
    'Struk Resmi Operator',
    'Foto Kegiatan',
    'Nominal (IDR)',
  ];

  const rows = transactions.map((tx, index) => {
    const card = cards.find((c) => c.id === tx.cardId);
    return [
      index + 1,
      batch.reportNumber,
      batch.employeeName,
      batch.employeeId,
      batch.department,
      formatDateTimeId(tx.timestamp),
      ISSUER_META[tx.issuer]?.name || tx.issuer,
      card?.cardNumberMasked || '-',
      tx.cardUid,
      card?.verificationCode || '-',
      CATEGORY_LABELS[tx.category] || tx.category,
      tx.merchant,
      tx.location,
      tx.notes || tx.activityCaption || '-',
      tx.receiptImage ? 'Terlampir' : 'Tidak Ada',
      tx.activityPhoto ? 'Terlampir' : 'Tidak Ada',
      tx.amount,
    ].map(csvEscape).join(',');
  });

  const totalRow = [
    '',
    batch.reportNumber,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTAL REIMBURSE',
    '',
    '',
    batch.totalAmount,
  ].map(csvEscape).join(',');

  const csvContent = '\uFEFF' + [headers.map(csvEscape).join(','), ...rows, totalRow].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeSlug = batch.employeeName.replace(/[^a-zA-Z0-9]+/g, '_');
  link.href = url;
  link.download = `Laporan_Reimburse_${batch.reportNumber}_${safeSlug}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
