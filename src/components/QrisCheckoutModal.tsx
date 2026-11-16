import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, Download, QrCode, X } from 'lucide-react';
import type { QrisPaymentOrder } from '../types';
import { formatRupiah } from '../lib/formatters';
import { generateQrisImageDataUrl, PREMIUM_PRICING } from '../lib/qris';

interface QrisCheckoutModalProps {
  order: QrisPaymentOrder | null;
  onClose: () => void;
  onConfirmPaid: (orderId: string) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
}

export function QrisCheckoutModal({
  order,
  onClose,
  onConfirmPaid,
  onCancelOrder,
}: QrisCheckoutModalProps) {
  const [qrImage, setQrImage] = useState<string>('');
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(900);

  useEffect(() => {
    if (!order) return;
    setPaidSuccess(order.status === 'paid');
    let active = true;
    generateQrisImageDataUrl(order.qrisPayload).then((url) => {
      if (active) setQrImage(url);
    });

    const updateTimer = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(diff);
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order]);

  if (!order) return null;

  const planMeta = PREMIUM_PRICING[order.billingCycle];
  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  async function handleCopyAmount() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(String(order.amount));
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  function handleDownloadQris() {
    if (!qrImage || !order) return;
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = `QRIS_${order.orderCode}_Rp${order.amount}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleConfirmPayment() {
    if (!order) return;
    setConfirming(true);
    try {
      await onConfirmPaid(order.id);
      setPaidSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    if (order && order.status === 'pending') {
      await onCancelOrder(order.id);
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qris-checkout-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-blue-400" />
            <div>
              <h2 id="qris-checkout-title" className="text-base font-bold font-display">
                Pembayaran QRIS Nasional
              </h2>
              <p className="text-[11px] text-slate-300 font-mono">
                {order.orderCode} · Paket {planMeta.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {paidSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-display">
                Pembayaran QRIS Berhasil!
              </h3>
              <p className="text-sm text-slate-600">
                Paket Premium {planMeta.label} ({formatRupiah(order.amount)}) sudah aktif di seluruh perangkat Anda.
              </p>
            </div>
          ) : (
            <>
              {/* Merchant & Amount Strip */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {order.merchantName}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    NMID: {order.nmid}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Total Tagihan</div>
                  <div className="text-lg font-extrabold font-mono tabular-nums text-blue-700">
                    {formatRupiah(order.amount)}
                  </div>
                </div>
              </div>

              {/* Dynamic QRIS Code Box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col items-center text-center">
                <div className="text-xs font-bold tracking-wide text-slate-900">
                  QRIS · GPN
                </div>
                <div className="mt-3 p-2 rounded-xl border border-slate-200 bg-white">
                  {qrImage ? (
                    <img
                      src={qrImage}
                      alt={`Kode QRIS ${order.orderCode}`}
                      className="w-52 h-52"
                    />
                  ) : (
                    <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                      Membuat kode QRIS...
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs font-mono tabular-nums text-amber-700 font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Berlaku {mins}:{secs}</span>
                </div>

                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed max-w-xs">
                  Scan dengan GoPay, OVO, DANA, ShopeePay, LinkAja, BCA Mobile, Livin&apos; Mandiri, BRImo, atau BNI Mobile.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleCopyAmount}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedAmount ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedAmount ? 'Nominal Tersalin' : 'Salin Nominal'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQris}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Gambar QRIS</span>
                  </button>
                </div>
              </div>

              {/* Payment Action */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={confirming || secondsLeft === 0}
                  onClick={handleConfirmPayment}
                  className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {confirming
                    ? 'Memverifikasi Pembayaran...'
                    : 'Sudah Bayar · Cek Status QRIS'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batalkan Tagihan
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
