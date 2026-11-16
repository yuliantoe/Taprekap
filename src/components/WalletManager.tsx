import { useState } from 'react';
import { Crown, Hash, Pencil, Plus, QrCode, Trash2, X } from 'lucide-react';
import type { CardIssuer, EMoneyCard, EMoneyTransaction } from '../types';
import { CardVisual } from './CardVisual';
import { formatRupiah, ISSUER_META } from '../lib/formatters';

interface WalletManagerProps {
  isPremium: boolean;
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  activeCardId: string | null;
  onSelectCard: (id: string) => void;
  onSaveCard: (payload: {
    uid?: string;
    cardNumberFull?: string;
    issuer: CardIssuer;
    label: string;
    balance: number;
    readSource: 'manual_sync' | 'card_number';
  }) => Promise<EMoneyCard>;
  onUpdateCard: (id: string, payload: Partial<EMoneyCard>) => Promise<void>;
  onDeleteCard: (id: string) => Promise<void>;
  onOpenQr: (card: EMoneyCard) => void;
  onRequireUpgrade: (reason: string) => void;
}

export function WalletManager({
  isPremium,
  cards,
  transactions,
  activeCardId,
  onSelectCard,
  onSaveCard,
  onUpdateCard,
  onDeleteCard,
  onOpenQr,
  onRequireUpgrade,
}: WalletManagerProps) {
  const [formMode, setFormMode] = useState<'none' | 'manual' | 'card_number'>('none');
  const [uid, setUid] = useState('');
  const [cardNumberFull, setCardNumberFull] = useState('');
  const [issuer, setIssuer] = useState<CardIssuer>('mandiri');
  const [label, setLabel] = useState('');
  const [balance, setBalance] = useState('100000');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingCard, setEditingCard] = useState<EMoneyCard | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBalance, setEditBalance] = useState('');

  function openAddManual() {
    setFormError(null);
    if (!isPremium && cards.length >= 2) {
      onRequireUpgrade(
        'Paket Gratis maksimal menyimpan 2 kartu. Upgrade ke Paket Premium (mulai 5K/minggu) untuk menyimpan semua kartu.',
      );
      return;
    }
    setFormMode((prev) => (prev === 'manual' ? 'none' : 'manual'));
  }

  function openAddByNumber() {
    setFormError(null);
    if (!isPremium) {
      onRequireUpgrade(
        'Tambah kartu langsung lewat 16 digit nomor kartu adalah fitur Paket Premium (mulai 5K/minggu).',
      );
      return;
    }
    setFormMode((prev) => (prev === 'card_number' ? 'none' : 'card_number'));
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (formMode === 'card_number') {
        const cleanDigits = cardNumberFull.replace(/\D/g, '');
        if (cleanDigits.length < 12) {
          setFormError('Masukkan 12–16 digit nomor kartu yang tercetak pada fisik kartu.');
          setSaving(false);
          return;
        }
        const created = await onSaveCard({
          cardNumberFull: cleanDigits,
          issuer,
          label: label.trim() || `${ISSUER_META[issuer].name} (${cleanDigits.slice(-4)})`,
          balance: Number(balance) || 0,
          readSource: 'card_number',
        });
        onSelectCard(created.id);
      } else {
        const generatedUid =
          uid.trim() ||
          `04:${Math.floor(10 + Math.random() * 89)}:${Math.floor(10 + Math.random() * 89)}:A1:B2:C3:80`;
        const created = await onSaveCard({
          uid: generatedUid.toUpperCase(),
          issuer,
          label: label.trim() || ISSUER_META[issuer].name,
          balance: Number(balance) || 0,
          readSource: 'manual_sync',
        });
        onSelectCard(created.id);
      }

      setUid('');
      setCardNumberFull('');
      setLabel('');
      setBalance('100000');
      setFormMode('none');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan kartu');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(card: EMoneyCard) {
    setEditingCard(card);
    setEditLabel(card.label);
    setEditBalance(String(card.balance));
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCard) return;
    setSaving(true);
    try {
      await onUpdateCard(editingCard.id, {
        label: editLabel.trim() || editingCard.label,
        balance: Number(editBalance) || 0,
      });
      setEditingCard(null);
    } finally {
      setSaving(false);
    }
  }

  const visibleCards = isPremium ? cards : cards.slice(0, 2);
  const lockedCardsCount = isPremium ? 0 : Math.max(0, cards.length - 2);

  return (
    <section className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              Dompet Kartu e-Money ({isPremium ? `${cards.length} Tersimpan` : `${Math.min(cards.length, 2)}/2 Slot Gratis`})
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {isPremium
                ? 'Semua kartu tersimpan tanpa batas, lengkapi dengan nomor kartu & Kode QR verifikasi.'
                : 'Paket Gratis menyimpan hingga 2 kartu tanpa login. Upgrade ke Premium untuk simpan semua kartu & tambah via nomor.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddByNumber}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Hash className="w-4 h-4 text-blue-700" />
              <span>Tambah via Nomor Kartu</span>
              {!isPremium && <Crown className="w-3.5 h-3.5 text-amber-500" />}
            </button>

            <button
              type="button"
              onClick={openAddManual}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kartu Baru</span>
            </button>
          </div>
        </div>

        {formMode !== 'none' && (
          <form
            onSubmit={handleAddCard}
            className="mt-5 p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {formMode === 'card_number'
                  ? 'Tambah Kartu Lewat 16 Digit Nomor Kartu (Premium)'
                  : 'Tambah Kartu Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFormMode('none')}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Penerbit Kartu
                </label>
                <select
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value as CardIssuer)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm"
                >
                  <option value="mandiri">Mandiri e-Money</option>
                  <option value="bca">BCA Flazz</option>
                  <option value="bri">BRI Brizzi</option>
                  <option value="bni">BNI TapCash</option>
                  <option value="kmt">KMT / JakLingko</option>
                </select>
              </div>

              {formMode === 'card_number' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Kartu (16 Digit)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardNumberFull}
                    onChange={(e) => setCardNumberFull(e.target.value)}
                    placeholder="Contoh: 6032 9810 4412 4819"
                    required
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono tabular-nums"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    UID NFC (opsional)
                  </label>
                  <input
                    type="text"
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder="Otomatis jika kosong"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono uppercase"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Label Kartu
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Misal: Flazz Operasional"
                  required
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Saldo Saat Ini (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Kartu ke Cloud'}
              </button>
            </div>
          </form>
        )}

        {editingCard && (
          <form
            onSubmit={handleSaveEdit}
            className="mt-5 p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Ubah Kartu: {ISSUER_META[editingCard.issuer].name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Label Kartu
                </label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Koreksi Saldo (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                  required
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}

        {visibleCards.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Belum ada kartu terdaftar di workspace ini.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {visibleCards.map((card) => {
              const cardTxs = transactions.filter((t) => t.cardId === card.id);
              const totalDebit = cardTxs
                .filter((t) => t.type === 'debit')
                .reduce((acc, t) => acc + t.amount, 0);
              return (
                <div key={card.id} className="space-y-3">
                  <CardVisual
                    card={card}
                    selected={card.id === activeCardId}
                    onSelect={(c) => onSelectCard(c.id)}
                  />
                  <div className="px-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div>
                      <span>{cardTxs.length} mutasi</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">
                        Total terpakai {formatRupiah(totalDebit)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          isPremium
                            ? onOpenQr(card)
                            : onRequireUpgrade(
                                'Kode QR verifikasi di tiap kartu tersedia pada Paket Premium (mulai 5K/minggu).',
                              )
                        }
                        className="px-2.5 py-1.5 rounded-lg hover:bg-blue-50 text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>QR Verifikasi</span>
                        {!isPremium && <Crown className="w-3 h-3 text-amber-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(card)}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Ubah</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCard(card.id)}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-red-50 text-red-600 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lockedCardsCount > 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-amber-950">
              <span className="font-semibold">
                +{lockedCardsCount} kartu lainnya tersimpan di arsip cloud.
              </span>{' '}
              Paket Gratis menampilkan 2 kartu terbaru. Aktifkan Paket Premium untuk membuka semua kartu.
            </div>
            <button
              type="button"
              onClick={() =>
                onRequireUpgrade(
                  `Terdapat ${lockedCardsCount} kartu tambahan di workspace ini. Aktifkan Paket Premium untuk mengakses seluruh kartu.`,
                )
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Buka Semua Kartu
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
