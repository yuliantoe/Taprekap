import { useState } from 'react';
import { Check, Crown, QrCode, ShieldCheck } from 'lucide-react';
import type {
  BillingCycle,
  PlanTier,
  QrisPaymentOrder,
  SubscriptionState,
} from '../types';
import { formatDateShortId, formatDateTimeId, formatRupiah } from '../lib/formatters';
import { PREMIUM_PRICING } from '../lib/qris';

interface PricingSectionProps {
  subscription: SubscriptionState;
  paymentHistory: QrisPaymentOrder[];
  onSelectPlan: (tier: PlanTier, billingCycle?: BillingCycle) => Promise<void>;
  onStartQrisPayment: (billingCycle: BillingCycle) => Promise<void>;
  onResumeQrisOrder: (order: QrisPaymentOrder) => void;
}

const BILLING_OPTIONS: Array<{
  id: BillingCycle;
  label: string;
  price: string;
  period: string;
  note: string;
}> = [
  {
    id: 'weekly',
    label: PREMIUM_PRICING.weekly.label,
    price: PREMIUM_PRICING.weekly.priceText,
    period: PREMIUM_PRICING.weekly.periodText,
    note: PREMIUM_PRICING.weekly.note,
  },
  {
    id: 'monthly',
    label: PREMIUM_PRICING.monthly.label,
    price: PREMIUM_PRICING.monthly.priceText,
    period: PREMIUM_PRICING.monthly.periodText,
    note: PREMIUM_PRICING.monthly.note,
  },
  {
    id: 'yearly',
    label: PREMIUM_PRICING.yearly.label,
    price: PREMIUM_PRICING.yearly.priceText,
    period: PREMIUM_PRICING.yearly.periodText,
    note: PREMIUM_PRICING.yearly.note,
  },
];

const COMPARISON_ROWS: Array<{
  feature: string;
  freeValue: string;
  premiumValue: string;
}> = [
  {
    feature: 'Cek saldo e-Money via NFC',
    freeValue: 'Tanpa batas, tanpa login / akun',
    premiumValue: 'Tanpa batas + sinkron cloud otomatis',
  },
  {
    feature: 'Riwayat transaksi per kartu',
    freeValue: '5 transaksi terakhir tiap kartu',
    premiumValue: 'Seluruh riwayat yang terbaca dari kartu',
  },
  {
    feature: 'Jumlah kartu tersimpan',
    freeValue: 'Maksimal 2 kartu tersimpan',
    premiumValue: 'Semua kartu tersimpan tanpa batas',
  },
  {
    feature: 'Tambah kartu lewat nomor kartu',
    freeValue: 'Tidak tersedia (hanya tap NFC)',
    premiumValue: 'Aktif (input 16 digit nomor kartu)',
  },
  {
    feature: 'Ekspor laporan kantor',
    freeValue: 'Pratinjau di layar',
    premiumValue: 'Ekspor PDF, CSV & Cetak langsung',
  },
  {
    feature: 'Kode QR verifikasi tiap kartu',
    freeValue: 'Tidak tersedia',
    premiumValue: 'Kode QR unik per kartu & di PDF',
  },
  {
    feature: 'Lampiran struk operator & foto kegiatan',
    freeValue: 'Tidak tersedia',
    premiumValue: 'Struk resmi, keterangan & foto ikut dilaporkan',
  },
];

export function PricingSection({
  subscription,
  paymentHistory,
  onSelectPlan,
  onStartQrisPayment,
  onResumeQrisOrder,
}: PricingSectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>(
    subscription.billingCycle || 'monthly',
  );
  const [updating, setUpdating] = useState(false);

  const selectedOption =
    BILLING_OPTIONS.find((opt) => opt.id === cycle) || BILLING_OPTIONS[1];
  const isPremium = subscription.tier === 'premium';

  async function handlePayWithQris() {
    setUpdating(true);
    try {
      await onStartQrisPayment(cycle);
    } finally {
      setUpdating(false);
    }
  }

  async function handleSwitchFree() {
    setUpdating(true);
    try {
      await onSelectPlan('free');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Plan Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Free Tier */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 font-display">
                Paket Gratis — Tanpa Login
              </h2>
              {!isPremium && (
                <span className="text-xs font-semibold text-emerald-700">
                  Paket Aktif
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Untuk pengguna harian yang ingin cek saldo NFC cepat tanpa membuat akun.
            </p>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold font-mono tabular-nums text-slate-900">
                Rp 0
              </span>
              <span className="text-xs text-slate-500">selamanya · tanpa akun</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Cek saldo tanpa batas tanpa login atau daftar akun</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Menampilkan 5 transaksi terakhir tiap kartu</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Riwayat 2 kartu e-Money tersimpan</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            {isPremium ? (
              <button
                type="button"
                disabled={updating}
                onClick={handleSwitchFree}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Kembali ke Paket Gratis
              </button>
            ) : (
              <div className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center">
                Sedang Menggunakan Paket Gratis
              </div>
            )}
          </div>
        </div>

        {/* Premium Tier with QRIS */}
        <div className="lg:col-span-7 bg-slate-900 text-white border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold font-display">
                  Paket Premium — Bayar via QRIS
                </h2>
              </div>
              {isPremium && (
                <span className="text-xs font-semibold text-emerald-400">
                  Aktif s/d {subscription.expiresAt ? formatDateShortId(subscription.expiresAt) : '-'}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-300">
              Untuk karyawan lapangan, tim operasional, dan kebutuhan reimburse resmi perusahaan.
            </p>

            {/* Billing Cycle Switcher */}
            <div className="mt-5 grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-800">
              {BILLING_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCycle(opt.id)}
                  className={`min-h-[42px] px-2 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    cycle === opt.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="font-mono tabular-nums text-[11px] opacity-90">
                    {opt.price}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono tabular-nums text-white">
                {selectedOption.price}
              </span>
              <span className="text-xs text-slate-300">
                {selectedOption.period} · {selectedOption.note}
              </span>
            </div>

            <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-200">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Seluruh riwayat transaksi yang terbaca dari kartu</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Semua kartu tersimpan & tambah lewat nomor kartu</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Ekspor laporan ke PDF, CSV, dan Cetak langsung</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Kode QR verifikasi di tiap kartu & dokumen PDF</span>
              </li>
              <li className="sm:col-span-2 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Struk resmi operator, keterangan, dan foto kegiatan ikut dilaporkan
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>QRIS didukung GoPay, OVO, DANA, ShopeePay & semua m-Banking</span>
            </div>

            <button
              type="button"
              disabled={updating}
              onClick={handlePayWithQris}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>
                {updating
                  ? 'Membuat QRIS...'
                  : `Bayar lewat QRIS (${selectedOption.price})`}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Payment History Table */}
      {paymentHistory.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Riwayat Pembayaran QRIS
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-6">Kode Tagihan</th>
                  <th className="py-3 px-4">Paket</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 px-6 font-mono font-semibold text-slate-900">
                      {order.orderCode}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      Premium {PREMIUM_PRICING[order.billingCycle].label}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {formatDateTimeId(order.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          order.status === 'paid'
                            ? 'font-semibold text-emerald-700'
                            : order.status === 'pending'
                              ? 'font-semibold text-amber-700'
                              : 'text-slate-400'
                        }
                      >
                        {order.status === 'paid'
                          ? 'Lunas (QRIS)'
                          : order.status === 'pending'
                            ? 'Menunggu Pembayaran'
                            : 'Kedaluwarsa'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                      {formatRupiah(order.amount)}
                    </td>
                    <td className="py-3 px-6 text-right">
                      {order.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => onResumeQrisOrder(order)}
                          className="text-blue-700 font-semibold hover:underline cursor-pointer"
                        >
                          Buka QRIS
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Feature Comparison Matrix */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 font-display">
            Perbandingan Batas Fitur Paket Gratis vs Premium
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Fitur Utama</th>
                <th className="py-3 px-6">Gratis (Tanpa Login)</th>
                <th className="py-3 px-6 text-blue-700">
                  Premium (5K/mg · 9K/bln · 59K/thn)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-6 font-medium text-slate-900">
                    {row.feature}
                  </td>
                  <td className="py-3.5 px-6 text-slate-600">{row.freeValue}</td>
                  <td className="py-3.5 px-6 font-medium text-slate-900">
                    {row.premiumValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
