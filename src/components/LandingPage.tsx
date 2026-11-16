import { useState } from 'react';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  Cloud,
  FileCheck2,
  Nfc,
  QrCode,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import type {
  BillingCycle,
  EMoneyCard,
  EMoneyTransaction,
  PlanTier,
  QrisPaymentOrder,
  SubscriptionState,
} from '../types';
import { HeroShowcase } from './HeroShowcase';
import { PricingSection } from './PricingSection';

interface LandingPageProps {
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  subscription: SubscriptionState;
  paymentHistory: QrisPaymentOrder[];
  onEnterApp: (targetTab?: 'scan' | 'history' | 'reimburse' | 'wallet') => void;
  onSelectPlan: (tier: PlanTier, billingCycle?: BillingCycle) => Promise<void>;
  onStartQrisPayment: (billingCycle: BillingCycle) => Promise<void>;
  onResumeQrisOrder: (order: QrisPaymentOrder) => void;
}

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: 'Apakah cek saldo e-Money di TapRekap benar-benar gratis tanpa login?',
    a: 'Ya. Pada Paket Gratis Anda bisa langsung menempelkan kartu Mandiri e-Money, BCA Flazz, BRI Brizzi, atau BNI TapCash ke sensor NFC HP tanpa perlu daftar akun atau login, tanpa batas jumlah cek saldo, serta menyimpan hingga 2 kartu dengan 5 transaksi terakhir per kartu.',
  },
  {
    q: 'Kartu uang elektronik apa saja yang didukung?',
    a: 'TapRekap mendukung kartu berbasis NFC yang umum dipakai di Indonesia: Mandiri e-Money, BCA Flazz, BRI Brizzi, BNI TapCash, serta Kartu Multi Trip (KMT) / JakLingko.',
  },
  {
    q: 'Bagaimana cara menyambungkan data dari HP lapangan ke laptop kantor?',
    a: 'Setiap sesi memiliki Kode Workspace Cloud (misalnya KANTOR-ID-01 atau kode tim Anda sendiri). Cukup buka tautan Workspace yang sama di HP Android dan di laptop kantor—seluruh saldo dan transaksi yang dicatat langsung tersinkron secara real-time.',
  },
  {
    q: 'Apa perbedaan Paket Gratis dan Paket Premium?',
    a: 'Paket Gratis memberi cek saldo tanpa batas tanpa login, 5 transaksi terakhir per kartu, dan maksimal 2 kartu tersimpan. Paket Premium (Rp 5.000/minggu, Rp 9.000/bulan, atau Rp 59.000/tahun) membuka seluruh riwayat kartu, semua kartu tersimpan, tambah kartu lewat 16 digit nomor kartu, ekspor PDF/CSV/Cetak, Kode QR verifikasi tiap kartu, serta lampiran struk resmi operator dan foto kegiatan.',
  },
  {
    q: 'Bagaimana cara pembayaran Paket Premium menggunakan QRIS?',
    a: 'Pilih siklus Mingguan (5K), Bulanan (9K), atau Tahunan (59K), lalu klik "Bayar lewat QRIS". Sistem akan membuat kode QRIS dinamis sesuai nominal paket yang bisa dipindai lewat GoPay, OVO, DANA, ShopeePay, BCA Mobile, Livin’ Mandiri, BRImo, maupun BNI Mobile.',
  },
  {
    q: 'Apakah struk resmi operator dan foto kegiatan ikut masuk ke laporan PDF?',
    a: 'Ya. Pada Paket Premium, setiap foto struk resmi operator (gerbang tol, parkir, SPBU), keterangan keperluan dinas, dan foto kegiatan lapangan yang Anda unggah otomatis disusun ke halaman lampiran di dalam file PDF dan halaman cetak.',
  },
];

export function LandingPage({
  cards,
  transactions,
  subscription,
  paymentHistory,
  onEnterApp,
  onSelectPlan,
  onStartQrisPayment,
  onResumeQrisOrder,
}: LandingPageProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const isPremium = subscription.tier === 'premium';

  return (
    <div className="space-y-20 pb-12">
      {/* 1. Hero Split Showcase */}
      <HeroShowcase
        cards={cards}
        transactions={transactions}
        isPremium={isPremium}
        onStartScanClick={() => onEnterApp('scan')}
        onOpenReimburseClick={() => onEnterApp('reimburse')}
      />

      {/* Supported Card Issuers Strip */}
      <section className="py-6 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Kompatibel dengan kartu NFC Indonesia
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm font-bold font-display text-neutral-800">
          <span>Mandiri e-Money</span>
          <span>BCA Flazz</span>
          <span>BRI Brizzi</span>
          <span>BNI TapCash</span>
          <span>KMT · JakLingko</span>
        </div>
      </section>

      {/* 2. Cara Kerja */}
      <section id="cara-kerja" className="scroll-mt-24 space-y-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
              CARA KERJA
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
            Tiga langkah dari kartu fisik ke laporan reimburse kantor.
          </h2>
          <p className="text-base text-neutral-600 leading-relaxed">
            Tidak perlu kumpulkan struk kertas yang mudah pudar atau menyalin nominal satu per satu ke spreadsheet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-600">01.</span>
              <Nfc className="w-5 h-5 text-neutral-900" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Tempel Kartu di HP Android
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Aktifkan NFC di ponsel dan buka TapRekap. Tempelkan kartu e-Money, Flazz, Brizzi, atau TapCash untuk cek saldo gratis tanpa akun.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-600">02.</span>
              <Cloud className="w-5 h-5 text-neutral-900" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Lengkapi Catatan & Sinkron Cloud
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Catat gerbang tol, lokasi parkir, keterangan tugas, serta lampirkan struk resmi operator dan foto kegiatan. Data langsung muncul di laptop kantor.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-600">03.</span>
              <FileCheck2 className="w-5 h-5 text-neutral-900" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Ekspor PDF, CSV & Cetak Resmi
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Pilih transaksi perjalanan dinas, hasilkan rekap otomatis lengkap dengan Kode QR verifikasi kartu dan kolom tanda tangan Finance.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Keunggulan & Bukti Dampak (Asymmetric Bento Grid) */}
      <section id="keunggulan" className="scroll-mt-24 space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
                KEUNGGULAN PRODUK
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
              Dirancang khusus untuk alur reimburse perusahaan Indonesia.
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onEnterApp('reimburse')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-2 self-start md:self-auto cursor-pointer whitespace-nowrap"
          >
            <span>Coba Pembuat Laporan PDF</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Marquee Bento 1 */}
          <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-7 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-950 text-white flex items-center justify-center">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold font-display text-neutral-950">
                Kode QR Verifikasi Unik di Setiap Kartu & PDF
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed max-w-xl">
                Tim Finance dapat memindai Kode QR pada dokumen PDF untuk mencocokkan nomor kartu, UID hardware NFC, kode verifikasi kartu, serta saldo terakhir tanpa perlu memasang aplikasi tambahan.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-600">
                  &lt; 1 menit
                </div>
                <div className="text-neutral-600 mt-0.5">
                  Waktu penyusunan rekap tol & parkir per perjalanan dinas
                </div>
              </div>
              <div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-neutral-950">
                  100%
                </div>
                <div className="text-neutral-600 mt-0.5">
                  Sinkron real-time antara HP lapangan & komputer Finance
                </div>
              </div>
            </div>
          </div>

          {/* Bento 2 */}
          <div className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white p-7 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold font-display text-neutral-950">
                Struk Resmi Operator & Foto Kegiatan Ikut Dilaporkan
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Lampirkan foto struk gerbang tol atau SPBU bersama foto dokumentasi kunjungan klien. Seluruh lampiran dikompresi otomatis dan disusun rapi di halaman lampiran PDF kantor.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span>Mendukung kamera HP langsung maupun galeri</span>
            </div>
          </div>

          {/* Bento 3 */}
          <div className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white p-7 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-900 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Cek Saldo Gratis Tanpa Login
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Butuh cek sisa saldo sebelum masuk gerbang tol? Buka web, tempel kartu ke NFC HP, dan lihat saldo seketika tanpa daftar akun.
            </p>
          </div>

          {/* Bento 4 */}
          <div className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-7 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-900 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Multi-Format: Ekspor PDF, CSV Spreadsheet & Cetak Langsung
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Selain file PDF A4 siap tanda tangan untuk lampiran pengajuan karyawan, Anda dapat mengunduh data transaksi dalam format CSV kompatibel Excel atau mencetak langsung dari browser.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Untuk Siapa */}
      <section id="untuk-siapa" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
              UNTUK SIAPA
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
            Dibuat untuk tim lapangan hingga bagian keuangan kantor.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-2">
            <div className="text-xs font-mono font-bold text-blue-600">01 · LOGISTIK & ARMADA</div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Driver Pengiriman & Kurir Operasional
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Tidak lagi pusing struk tol hilang di kabin truk. Setiap selesai rute pengiriman, tap kartu dan kirim laporan PDF lengkap dengan foto bongkar muat.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-2">
            <div className="text-xs font-mono font-bold text-blue-600">02 · SALES & TEKNISI</div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Kunjungan Klien & Perjalanan Dinas
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Pisahkan kartu operasional dari kartu pribadi. Kumpulkan biaya tol, parkir mall/perkantoran, dan MRT/KRL dalam satu batch reimburse bulanan.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-2">
            <div className="text-xs font-mono font-bold text-blue-600">03 · FINANCE & GA</div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Tim Finance, HR & General Affairs
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Terima rekap seragam berformat PDF A4 atau CSV dengan Kode QR verifikasi kartu, rincian kategori biaya, serta kolom otorisasi persetujuan.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-2">
            <div className="text-xs font-mono font-bold text-blue-600">04 · KOMUTER HARIAN</div>
            <h3 className="text-lg font-bold font-display text-neutral-950">
              Pengguna Multi-Kartu Tanpa Login
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Cek sisa saldo e-Money, Flazz, Brizzi, dan TapCash secara gratis tanpa batas dan tanpa harus mengingat kata sandi akun baru.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Harga & Pembayaran QRIS */}
      <section id="harga" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
              PAKET HARGA & QRIS
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
            Gratis untuk cek saldo. Terjangkau untuk rekap kantor.
          </h2>
          <p className="text-base text-neutral-600 leading-relaxed">
            Mulai gratis tanpa login, atau aktifkan Paket Premium mulai Rp 5.000/minggu dengan pembayaran QRIS instan.
          </p>
        </div>

        <PricingSection
          subscription={subscription}
          paymentHistory={paymentHistory}
          onSelectPlan={onSelectPlan}
          onStartQrisPayment={onStartQrisPayment}
          onResumeQrisOrder={onResumeQrisOrder}
        />
      </section>

      {/* 6. FAQ */}
      <section id="faq" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-[2px] bg-blue-600 inline-block" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-600">
              PERTANYAAN UMUM
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
            Hal yang sering ditanyakan.
          </h2>
        </div>

        <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-2xl bg-white overflow-hidden">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-bold text-neutral-950">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-neutral-600 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. Final Conversion Block */}
      <section className="rounded-3xl bg-neutral-950 text-white p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="max-w-xl space-y-3">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-balance">
            Siap mengubah tap e-Money menjadi laporan reimburse kantor?
          </h2>
          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">
            Cek saldo NFC gratis langsung di browser HP Anda atau susun laporan PDF pertama sekarang tanpa perlu daftar akun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onEnterApp('scan')}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Nfc className="w-4 h-4" />
            <span>Buka Pemindai NFC</span>
          </button>
          <button
            type="button"
            onClick={() => onEnterApp('reimburse')}
            className="min-h-[46px] px-5 py-2.5 rounded-xl border border-neutral-700 hover:bg-neutral-900 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Lihat Workspace Reimburse</span>
          </button>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="pt-8 border-t border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-neutral-500">
        <div>
          <span className="font-bold text-neutral-900 font-display">TapRekap</span>
          <span aria-hidden="true"> · </span>
          <span>Mandiri e-Money · BCA Flazz · BRI Brizzi · BNI TapCash</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <a href="#cara-kerja" className="hover:text-neutral-900">
            Cara kerja
          </a>
          <a href="#keunggulan" className="hover:text-neutral-900">
            Keunggulan
          </a>
          <a href="#harga" className="hover:text-neutral-900">
            Harga QRIS
          </a>
          <button
            type="button"
            onClick={() => onEnterApp('scan')}
            className="hover:text-neutral-900 font-semibold text-neutral-800 cursor-pointer"
          >
            Buka Aplikasi
          </button>
        </div>
      </footer>
    </div>
  );
}
