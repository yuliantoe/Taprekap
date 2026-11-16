import { useState } from 'react';
import { Check, Crown, QrCode, X } from 'lucide-react';
import type { BillingCycle } from '../types';
import { PREMIUM_PRICING } from '../lib/qris';

interface UpgradeModalProps {
  open: boolean;
  reason: string;
  onClose: () => void;
  onStartQrisPayment: (billingCycle: BillingCycle) => Promise<void>;
}

const PLANS: Array<{
  id: BillingCycle;
  title: string;
  price: string;
  sub: string;
}> = [
  {
    id: 'weekly',
    title: PREMIUM_PRICING.weekly.label,
    price: PREMIUM_PRICING.weekly.priceText,
    sub: 'per minggu',
  },
  {
    id: 'monthly',
    title: PREMIUM_PRICING.monthly.label,
    price: PREMIUM_PRICING.monthly.priceText,
    sub: 'per bulan',
  },
  {
    id: 'yearly',
    title: PREMIUM_PRICING.yearly.label,
    price: PREMIUM_PRICING.yearly.priceText,
    sub: 'per tahun',
  },
];

export function UpgradeModal({
  open,
  reason,
  onClose,
  onStartQrisPayment,
}: UpgradeModalProps) {
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleProceedQris() {
    setLoading(true);
    try {
      await onStartQrisPayment(selectedCycle);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 id="upgrade-modal-title" className="text-base font-bold font-display">
              Aktifkan Paket Premium via QRIS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {reason && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 leading-relaxed">
              {reason}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedCycle(plan.id)}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  selectedCycle === plan.id
                    ? 'border-blue-700 bg-blue-50/70 ring-1 ring-blue-700'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-semibold text-slate-600">{plan.title}</div>
                <div className="mt-1 text-sm font-extrabold font-mono tabular-nums text-slate-900">
                  {plan.price}
                </div>
                <div className="text-[11px] text-slate-500">{plan.sub}</div>
              </button>
            ))}
          </div>

          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Seluruh riwayat transaksi yang terbaca dari kartu (tanpa batas 5 item)</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Semua kartu tersimpan & tambah kartu lewat nomor kartu</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Ekspor PDF, CSV & Cetak laporan kantor</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Kode QR verifikasi di tiap kartu & lampiran struk + foto kegiatan</span>
            </li>
          </ul>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Tetap Gratis
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleProceedQris}
              className="min-h-[42px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>
                {loading
                  ? 'Membuat QRIS...'
                  : `Bayar QRIS ${PREMIUM_PRICING[selectedCycle].priceText}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
