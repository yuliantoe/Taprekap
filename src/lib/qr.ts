import QRCode from 'qrcode';
import type { EMoneyCard } from '../types';
import { formatRupiah, ISSUER_META } from './formatters';

export function buildCardVerificationPayload(card: EMoneyCard): string {
  const issuerName = ISSUER_META[card.issuer]?.name || card.issuer.toUpperCase();
  return [
    'TAPREKAP-VERIFIED',
    `CODE:${card.verificationCode}`,
    `BANK:${issuerName}`,
    `NO:${card.cardNumberMasked}`,
    `UID:${card.uid}`,
    `SALDO:${formatRupiah(card.balance)}`,
    `TAP:${card.lastTappedAt}`,
  ].join('|');
}

export async function generateCardQrDataUrl(card: EMoneyCard): Promise<string> {
  const payload = buildCardVerificationPayload(card);
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 1,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}
