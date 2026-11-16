import QRCode from 'qrcode';
import type { BillingCycle } from '../types';

export const PREMIUM_PRICING: Record<
  BillingCycle,
  { amount: number; label: string; priceText: string; periodText: string; note: string }
> = {
  weekly: {
    amount: 5000,
    label: 'Mingguan',
    priceText: 'Rp 5.000',
    periodText: '/ minggu',
    note: 'Cocok untuk perjalanan dinas singkat',
  },
  monthly: {
    amount: 9000,
    label: 'Bulanan',
    priceText: 'Rp 9.000',
    periodText: '/ bulan',
    note: 'Paling hemat untuk laporan rutin kantor',
  },
  yearly: {
    amount: 59000,
    label: 'Tahunan',
    priceText: 'Rp 59.000',
    periodText: '/ tahun',
    note: 'Hemat 45% dibanding bulanan',
  },
};

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildDynamicQrisPayload({
  amount,
  orderCode,
  merchantName = 'TAPREKAP INDONESIA',
  merchantCity = 'JAKARTA',
  nmid = 'ID1026009841201',
}: {
  amount: number;
  orderCode: string;
  merchantName?: string;
  merchantCity?: string;
  nmid?: string;
}): string {
  const merchantAccount =
    tlv('00', 'ID.CO.QRIS.WWW') +
    tlv('01', '9360091431201884201') +
    tlv('02', nmid) +
    tlv('03', 'UMI');

  const additionalData = tlv('05', orderCode.slice(0, 25));

  const body =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', '12') + // Dynamic QRIS
    tlv('26', merchantAccount) +
    tlv('52', '5999') + // MCC
    tlv('53', '360') + // IDR
    tlv('54', String(Math.round(amount))) +
    tlv('58', 'ID') +
    tlv('59', merchantName.slice(0, 25)) +
    tlv('60', merchantCity.slice(0, 15)) +
    tlv('62', additionalData) +
    '6304';

  return `${body}${crc16Ccitt(body)}`;
}

export async function generateQrisImageDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 320,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}
