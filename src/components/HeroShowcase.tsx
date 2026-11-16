import { useEffect, useState } from 'react';
import { ArrowRight, Nfc, Wifi } from 'lucide-react';
import type { EMoneyCard, EMoneyTransaction } from '../types';
import { formatDateShortId, formatRupiah, ISSUER_META } from '../lib/formatters';
import { generateCardQrDataUrl } from '../lib/qr';

interface HeroShowcaseProps {
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  isPremium: boolean;
  onStartScanClick: () => void;
  onOpenReimburseClick: () => void;
}

export function HeroShowcase({
  cards,
  transactions,
  isPremium,
  onStartScanClick,
  onOpenReimburseClick,
}: HeroShowcaseProps) {
  const primaryCard = cards[0] || null;
  const cardTransactions = primaryCard
    ? transactions.filter((t) => t.cardId === primaryCard.id).slice(0, 5)
    : transactions.slice(0, 5);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!primaryCard) return;
    let active = true;
    generateCardQrDataUrl(primaryCard).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [primaryCard]);

  const totalTopup = cardTransactions
    .filter((t) => t.type === 'topup')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebit = cardTransactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  const txWithPhotos = transactions.filter((t) => t.receiptImage || t.activityPhoto).slice(0, 3);

  const formatRowDate = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return { date: iso, time: '' };
    const date = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dt);
    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
    return { date, time };
  };

  return (
    <section className="pt-4 pb-6 lg:pt-8 lg:pb-10 border-b border-neutral-200">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center">
        {/* Left: Editorial Copy */}
        <div className="lg:col-span-5 space-y-5">
          <div className="flex items-center gap-3">
            <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
              REKAP REIMBURSE E-MONEY
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold font-display tracking-tight leading-[1.08] text-neutral-950 text-balance">
            Cek Saldo NFC.
            <span className="block text-blue-600">
              Rekap Reimburse e-Money.
            </span>
          </h1>

          <p className="text-base text-neutral-600 leading-relaxed max-w-lg">
            Tempel kartu e-Money, Flazz, Brizzi, atau TapCash ke HP. Transaksi tol dan parkir tersinkron real-time ke cloud dan langsung jadi laporan PDF kantor lengkap dengan total, keterangan, foto kegiatan, dan kode QR verifikasi. Cek saldo gratis, tanpa akun.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onStartScanClick}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Nfc className="w-4 h-4" />
              <span>Tempel & Cek Saldo Gratis</span>
            </button>
            <button
              type="button"
              onClick={onOpenReimburseClick}
              className="min-h-[46px] px-5 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Buat Laporan PDF</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-700">
            <span className="font-semibold text-neutral-950">Gratis tanpa login</span>
            <span aria-hidden="true" className="text-neutral-300">|</span>
            <span>5 transaksi terakhir & 2 kartu</span>
            <span aria-hidden="true" className="text-neutral-300">|</span>
            <span>{isPremium ? 'Paket Premium Aktif' : 'Premium mulai Rp 5.000/minggu'}</span>
          </div>
        </div>

        {/* Middle Connector: Tilted Card -> < 1 menit -> Receipt */}
        <div className="lg:col-span-3 flex flex-col items-center justify-center py-2">
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4">
            <button
              type="button"
              onClick={onStartScanClick}
              className="group text-center focus:outline-none cursor-pointer"
            >
              <div className="w-44 h-28 rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 text-white p-4 shadow-lg -rotate-6 group-hover:-rotate-3 transition-transform flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="w-7 h-5 rounded bg-amber-300/90" />
                  <Wifi className="w-4 h-4 rotate-90 text-neutral-300" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] font-mono tracking-widest text-neutral-300">
                    {primaryCard ? ISSUER_META[primaryCard.issuer].shortName.toUpperCase() : 'E-MONEY'}
                  </div>
                  <div className="text-xs font-mono font-bold tabular-nums text-white mt-0.5">
                    {primaryCard ? formatRupiah(primaryCard.balance) : 'NFC READY'}
                  </div>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-neutral-900">
                <span className="w-5 h-5 rounded-full bg-neutral-950 text-white text-[11px] inline-flex items-center justify-center font-mono">
                  1
                </span>
                <span>Tempel kartu</span>
              </div>
            </button>

            <div className="flex flex-col items-center text-center px-2">
              <div className="text-lg font-extrabold font-display text-blue-600 leading-none">
                &lt; 1 menit
              </div>
              <div className="mt-1 text-[11px] font-semibold text-neutral-800">
                dari kartu ke PDF
              </div>
              <div className="mt-2 hidden xl:flex items-center gap-1 text-blue-600" aria-hidden="true">
                <span className="w-20 border-b-2 border-dashed border-blue-500" />
                <ArrowRight className="w-3.5 h-3.5 -ml-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Crisp Live Receipt / PDF Preview Card */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-500">TapRekap</div>
                <h2 className="text-base font-extrabold font-display tracking-tight text-neutral-950">
                  RIWAYAT TRANSAKSI
                </h2>
                <div className="mt-2 text-xs text-neutral-800">
                  <span className="font-semibold">
                    {primaryCard?.label || 'Operasional'}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {primaryCard ? ISSUER_META[primaryCard.issuer].name : 'Mandiri e-Money'}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-neutral-700 tabular-nums">
                  {primaryCard?.cardNumberMasked || '6032 •••• •••• 4819'}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-neutral-400 tabular-nums">
                  {cardTransactions.length > 0
                    ? `${formatDateShortId(cardTransactions[cardTransactions.length - 1].timestamp)} – ${formatDateShortId(cardTransactions[0].timestamp)}`
                    : 'Sinkron Real-Time'}
                </div>
              </div>

              <div className="text-center shrink-0">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Verifikasi Kartu"
                    className="w-16 h-16 border border-neutral-200 rounded-lg p-0.5 bg-white"
                  />
                ) : (
                  <div className="w-16 h-16 border border-neutral-200 rounded-lg bg-neutral-50" />
                )}
                <div className="mt-1 text-[9px] leading-tight text-neutral-500">
                  Pindai untuk
                  <br />
                  verifikasi
                </div>
              </div>
            </div>

            {/* Transaction Rows Table */}
            <div className="border-t border-neutral-200 pt-2">
              <div className="grid grid-cols-12 text-[10px] font-semibold tracking-wider text-neutral-400 uppercase pb-1.5 border-b border-neutral-200">
                <div className="col-span-3">TANGGAL</div>
                <div className="col-span-6">LOKASI · KETERANGAN</div>
                <div className="col-span-3 text-right">NOMINAL</div>
              </div>

              <div className="divide-y divide-neutral-100">
                {cardTransactions.length === 0 ? (
                  <div className="py-4 text-center text-xs text-neutral-400">
                    Belum ada transaksi terekam
                  </div>
                ) : (
                  cardTransactions.map((tx) => {
                    const dt = formatRowDate(tx.timestamp);
                    const isTopup = tx.type === 'topup';
                    return (
                      <div
                        key={tx.id}
                        className="grid grid-cols-12 gap-1 py-2 items-center text-[11px]"
                      >
                        <div className="col-span-3 font-mono tabular-nums text-neutral-500 leading-tight">
                          <div>{dt.date}</div>
                          <div className="text-[10px] text-neutral-400">{dt.time}</div>
                        </div>
                        <div className="col-span-6 min-w-0 pr-1">
                          <div className="font-semibold text-neutral-900 truncate">
                            {tx.merchant}
                          </div>
                          <div className="text-[10px] text-neutral-500 truncate">
                            {tx.notes || tx.location}
                          </div>
                        </div>
                        <div
                          className={`col-span-3 text-right font-mono tabular-nums font-semibold ${
                            isTopup ? 'text-emerald-600' : 'text-neutral-900'
                          }`}
                        >
                          {isTopup ? '+' : '-'}
                          {formatRupiah(tx.amount)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-neutral-200 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900">Total isi ulang</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-600">
                    +{formatRupiah(totalTopup)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900">Total pengeluaran</span>
                  <span className="font-mono tabular-nums font-semibold text-neutral-900">
                    -{formatRupiah(totalDebit)}
                  </span>
                </div>
              </div>
            </div>

            {txWithPhotos.length > 0 && (
              <div className="pt-2 border-t border-neutral-100">
                <div className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase mb-2">
                  LAMPIRAN · FOTO KEGIATAN
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {txWithPhotos.map((tx) => (
                    <img
                      key={tx.id}
                      src={tx.activityPhoto || tx.receiptImage}
                      alt={tx.merchant}
                      className="h-12 w-full object-cover rounded-lg border border-neutral-200"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
