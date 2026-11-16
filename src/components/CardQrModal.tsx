import { useEffect, useState } from 'react';
import { QrCode, ShieldCheck, X } from 'lucide-react';
import type { EMoneyCard } from '../types';
import { formatDateTimeId, formatRupiah, ISSUER_META } from '../lib/formatters';
import { buildCardVerificationPayload, generateCardQrDataUrl } from '../lib/qr';

interface CardQrModalProps {
  card: EMoneyCard | null;
  onClose: () => void;
}

export function CardQrModal({ card, onClose }: CardQrModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!card) return;
    let active = true;
    generateCardQrDataUrl(card).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [card]);

  if (!card) return null;

  const payload = buildCardVerificationPayload(card);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-qr-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-blue-700" />
            <h2 id="card-qr-title" className="text-base font-bold text-slate-900 font-display">
              Kode QR Verifikasi Kartu
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl border border-slate-200 bg-white">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={`Kode QR Verifikasi ${card.label}`}
                className="w-48 h-48"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                Membuat QR...
              </div>
            )}
          </div>

          <div className="text-left rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Kartu</span>
              <span className="font-bold text-slate-900">
                {ISSUER_META[card.issuer].name} · {card.label}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Nomor Kartu</span>
              <span className="font-mono text-slate-900">{card.cardNumberMasked}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">UID NFC</span>
              <span className="font-mono text-slate-900">{card.uid}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Saldo Tercatat</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatRupiah(card.balance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Kode Verifikasi</span>
              <span className="font-mono font-semibold text-blue-700">
                {card.verificationCode}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Update Terakhir</span>
              <span className="font-mono text-slate-700 tabular-nums">
                {formatDateTimeId(card.lastTappedAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>QR ini juga otomatis tercetak pada dokumen PDF laporan kantor</span>
          </div>

          <div className="text-[10px] font-mono text-slate-400 break-all px-2">
            {payload}
          </div>
        </div>
      </div>
    </div>
  );
}
