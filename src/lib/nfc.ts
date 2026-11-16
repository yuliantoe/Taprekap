import type { CardIssuer, NfcScanResult } from '../types';

interface NDEFRecordLike {
  recordType: string;
  mediaType?: string;
  data?: DataView;
  encoding?: string;
}

interface NDEFReadingEventLike extends Event {
  serialNumber?: string;
  message?: {
    records: NDEFRecordLike[];
  };
}

interface NDEFReaderLike extends EventTarget {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: ((event: Event & { serialNumber?: string }) => void) | null;
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike;
  }
}

export interface NfcCapabilities {
  supported: boolean;
  isSecureContext: boolean;
  inIframe: boolean;
  platformHint: string;
}

export function getNfcCapabilities(): NfcCapabilities {
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;
  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
  let inIframe = false;
  try {
    inIframe = typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    inIframe = true;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let platformHint = 'Desktop / Perangkat Non-NFC';
  if (/Android/i.test(ua)) {
    platformHint = supported
      ? 'Android Chrome (Web NFC Siap · Tempel kartu ke sensor NFC)'
      : 'Android Browser (Gunakan Chrome terbaru untuk Web NFC)';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platformHint = 'iOS Safari (Belum mendukung Web NFC, gunakan Input Kartu / Simulasi)';
  }

  return { supported, isSecureContext, inIframe, platformHint };
}

export async function queryNfcPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof window === 'undefined' || !('NDEFReader' in window)) {
    return 'unsupported';
  }
  try {
    if (!navigator.permissions?.query) return 'prompt';
    const status = await navigator.permissions.query({
      name: 'nfc' as PermissionName,
    });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export function inferIssuerFromCardNumberPrefix(digits: string): CardIssuer | null {
  const clean = digits.replace(/\D/g, '');
  if (clean.startsWith('6032')) return 'mandiri';
  if (clean.startsWith('0148') || clean.startsWith('5200')) return 'bca';
  if (clean.startsWith('6013')) return 'bri';
  if (clean.startsWith('7546')) return 'bni';
  if (clean.startsWith('8801')) return 'kmt';
  return null;
}

export function guessIssuerFromUidOrText(uid: string, text?: string): CardIssuer {
  const lower = (text || '').toLowerCase();
  if (lower.includes('flazz') || lower.includes('bca')) return 'bca';
  if (lower.includes('brizzi') || lower.includes('bri')) return 'bri';
  if (lower.includes('tapcash') || lower.includes('bni')) return 'bni';
  if (lower.includes('kmt') || lower.includes('jaklingko')) return 'kmt';
  if (lower.includes('mandiri') || lower.includes('emoney') || lower.includes('e-money')) {
    return 'mandiri';
  }

  const inferred = inferIssuerFromCardNumberPrefix(text || '');
  if (inferred) return inferred;

  const clean = uid.replace(/[^A-F0-9]/gi, '').toUpperCase();
  if (clean.startsWith('045D') || clean.startsWith('0482')) return 'bca';
  if (clean.startsWith('0491') || clean.startsWith('043E')) return 'bri';
  if (clean.startsWith('0477') || clean.startsWith('04B1')) return 'bni';
  return 'mandiri';
}

export function extractBalanceFromText(text: string): number | undefined {
  try {
    const parsed = JSON.parse(text) as { balance?: number; saldo?: number };
    const candidate = parsed.balance ?? parsed.saldo;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return Math.round(candidate);
    }
  } catch {
    // not JSON, continue
  }
  const match = text.match(/(?:rp|idr|saldo)\s*[:=]?\s*([\d.,]+)/i);
  if (!match) return undefined;
  const numeric = Number(match[1].replace(/[.,]/g, ''));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function decodeNdefRecord(record: NDEFRecordLike): string {
  if (!record.data) return '';
  try {
    const encoding = record.encoding || 'utf-8';
    const decoder = new TextDecoder(encoding);
    return decoder.decode(record.data).trim();
  } catch {
    try {
      return new TextDecoder().decode(record.data).trim();
    } catch {
      return '';
    }
  }
}

export async function startWebNfcScan(
  signal: AbortSignal,
  onTagRead: (result: NfcScanResult) => void,
  onNonNdefDetected: (result: NfcScanResult, note: string) => void,
): Promise<void> {
  if (!window.NDEFReader) {
    throw new Error(
      'Browser ini tidak mendukung Web NFC (gunakan Google Chrome di perangkat Android).',
    );
  }

  const ndef = new window.NDEFReader();
  let lastTriggerAt = 0;

  ndef.onreadingerror = (event) => {
    const now = Date.now();
    if (now - lastTriggerAt < 900) return;
    lastTriggerAt = now;

    const rawSerial = (event.serialNumber || '').trim().toUpperCase();
    onNonNdefDetected(
      {
        uid: rawSerial,
        serialNumber: rawSerial,
        issuerGuess: rawSerial ? guessIssuerFromUidOrText(rawSerial) : 'bca',
        recordsCount: 0,
        nonNdefChip: true,
        timestamp: new Date().toISOString(),
        source: 'web_nfc',
      },
      rawSerial
        ? `UID kartu bank (${rawSerial}) terbaca saat ditempel! Sistem langsung mencocokkan data kartu dan mutasi Anda.`
        : 'Antena NFC mendeteksi kartu non-NDEF (seperti BCA Flazz / Mandiri e-Money) namun browser Android tidak mengirim nomor seri chip pada tag terenkripsi ini. Pilih kartu di panel kanan untuk langsung membaca & mencatat data di sistem.',
    );
  };

  ndef.onreading = (event: NDEFReadingEventLike) => {
    const now = Date.now();
    if (now - lastTriggerAt < 900) return;
    lastTriggerAt = now;

    const texts: string[] = [];
    for (const record of event.message?.records || []) {
      const decoded = decodeNdefRecord(record);
      if (decoded) texts.push(decoded);
    }
    const rawText = texts.join(' ').trim();
    const serial = (event.serialNumber || '').trim().toUpperCase();
    const recordsCount = event.message?.records?.length || 0;

    onTagRead({
      uid: serial,
      serialNumber: serial,
      issuerGuess: guessIssuerFromUidOrText(serial, rawText),
      recordsCount,
      rawText: rawText || undefined,
      parsedBalance: rawText ? extractBalanceFromText(rawText) : undefined,
      nonNdefChip: recordsCount === 0 && !rawText,
      timestamp: new Date().toISOString(),
      source: 'web_nfc',
    });
  };

  await ndef.scan({ signal });
}
