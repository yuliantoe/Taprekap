import type { CardIssuer, NfcScanResult } from '../types';

interface NDEFRecordLike {
  recordType: string;
  mediaType?: string;
  data?: DataView;
  encoding?: string;
}

interface NDEFReadingEventLike extends Event {
  serialNumber: string;
  message: {
    records: NDEFRecordLike[];
  };
}

interface NDEFReaderLike extends EventTarget {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
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
      ? 'Android Chrome (Web NFC Siap)'
      : 'Android Browser (Gunakan Chrome terbaru untuk Web NFC)';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platformHint = 'iOS Safari (Belum mendukung Web NFC, gunakan sinkronisasi cloud atau simulasi)';
  }

  return { supported, isSecureContext, inIframe, platformHint };
}

export function guessIssuerFromUidOrText(uid: string, text?: string): CardIssuer {
  const lower = (text || '').toLowerCase();
  if (lower.includes('flazz') || lower.includes('bca')) return 'bca';
  if (lower.includes('brizzi') || lower.includes('bri')) return 'bri';
  if (lower.includes('tapcash') || lower.includes('bni')) return 'bni';
  if (lower.includes('kmt') || lower.includes('jaklingko')) return 'kmt';
  if (lower.includes('mandiri') || lower.includes('emoney')) return 'mandiri';

  // Fallback heuristic based on UID byte pattern
  const clean = uid.replace(/[^A-F0-9]/gi, '').toUpperCase();
  if (clean.startsWith('045D') || clean.startsWith('0482')) return 'bca';
  if (clean.startsWith('0491') || clean.startsWith('043E')) return 'bri';
  if (clean.startsWith('0477') || clean.startsWith('04B1')) return 'bni';
  return 'mandiri';
}

export function extractBalanceFromText(text: string): number | undefined {
  const match = text.match(/(?:rp|idr|saldo)\s*[:=]?\s*([\d.,]+)/i);
  if (!match) return undefined;
  const numeric = Number(match[1].replace(/[.,]/g, ''));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

export async function startWebNfcScan(
  signal: AbortSignal,
  onTagRead: (result: NfcScanResult) => void,
  onReadError: (message: string) => void,
): Promise<void> {
  if (!window.NDEFReader) {
    throw new Error('Browser ini tidak mendukung Web NFC (gunakan Chrome di perangkat Android).');
  }

  const ndef = new window.NDEFReader();
  ndef.onreadingerror = () => {
    onReadError('Kartu terdeteksi namun gagal terbaca sempurna. Tahan kartu 1–2 detik di area sensor NFC.');
  };

  ndef.onreading = (event: NDEFReadingEventLike) => {
    const decoder = new TextDecoder();
    const texts: string[] = [];
    for (const record of event.message?.records || []) {
      if (record.data) {
        try {
          texts.push(decoder.decode(record.data));
        } catch {
          // ignore undecodable binary record
        }
      }
    }
    const rawText = texts.join(' ').trim();
    const serial = (event.serialNumber || `NFC-${Date.now().toString(16)}`).toUpperCase();
    onTagRead({
      uid: serial,
      serialNumber: serial,
      issuerGuess: guessIssuerFromUidOrText(serial, rawText),
      recordsCount: event.message?.records?.length || 0,
      rawText: rawText || undefined,
      parsedBalance: rawText ? extractBalanceFromText(rawText) : undefined,
      timestamp: new Date().toISOString(),
      source: 'web_nfc',
    });
  };

  await ndef.scan({ signal });
}
