import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  CheckSquare,
  Crown,
  FileSpreadsheet,
  Receipt,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { EMoneyCard, EMoneyTransaction } from '../types';
import {
  CATEGORY_LABELS,
  formatDateTimeId,
  formatRupiah,
  ISSUER_META,
  REIMBURSE_STATUS_LABELS,
} from '../lib/formatters';

interface TransactionsLedgerProps {
  isPremium: boolean;
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  selectedTxIds: string[];
  onToggleSelectTx: (txId: string) => void;
  onSelectManyTx: (txIds: string[]) => void;
  onDeleteTx: (txId: string) => Promise<void>;
  onOpenReimburseWithSelection: () => void;
  onRequireUpgrade: (reason: string) => void;
}

type LedgerFilter = 'all' | 'debit' | 'topup' | 'unclaimed';

export function TransactionsLedger({
  isPremium,
  cards,
  transactions,
  selectedTxIds,
  onToggleSelectTx,
  onSelectManyTx,
  onDeleteTx,
  onOpenReimburseWithSelection,
  onRequireUpgrade,
}: TransactionsLedgerProps) {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [cardFilter, setCardFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaPreviewTx, setMediaPreviewTx] = useState<EMoneyTransaction | null>(null);

  // Free plan rule: max 2 saved cards, 5 latest transactions per card
  const { visibleByPlan, hiddenByPlanCount } = useMemo(() => {
    if (isPremium) {
      return { visibleByPlan: transactions, hiddenByPlanCount: 0 };
    }
    const allowedCardIds = new Set(cards.slice(0, 2).map((c) => c.id));
    const perCardCounter = new Map<string, number>();
    const visible: EMoneyTransaction[] = [];
    let hidden = 0;

    for (const tx of transactions) {
      if (!allowedCardIds.has(tx.cardId)) {
        hidden += 1;
        continue;
      }
      const count = perCardCounter.get(tx.cardId) || 0;
      if (count < 5) {
        visible.push(tx);
        perCardCounter.set(tx.cardId, count + 1);
      } else {
        hidden += 1;
      }
    }
    return { visibleByPlan: visible, hiddenByPlanCount: hidden };
  }, [isPremium, cards, transactions]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleByPlan.filter((tx) => {
      if (filter === 'debit' && tx.type !== 'debit') return false;
      if (filter === 'topup' && tx.type !== 'topup') return false;
      if (filter === 'unclaimed' && (tx.type !== 'debit' || tx.reimburseStatus !== 'unclaimed')) {
        return false;
      }
      if (cardFilter !== 'all' && tx.cardId !== cardFilter) return false;
      if (q) {
        const haystack = `${tx.merchant} ${tx.location} ${tx.cardLabel} ${tx.notes || ''} ${tx.cardUid}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [visibleByPlan, filter, cardFilter, searchQuery]);

  const selectableFilteredIds = useMemo(
    () =>
      filtered
        .filter((tx) => tx.type === 'debit' && tx.reimburseStatus === 'unclaimed')
        .map((tx) => tx.id),
    [filtered],
  );

  const allSelectableChecked =
    selectableFilteredIds.length > 0 &&
    selectableFilteredIds.every((id) => selectedTxIds.includes(id));

  const selectedTotalAmount = useMemo(
    () =>
      transactions
        .filter((tx) => selectedTxIds.includes(tx.id))
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions, selectedTxIds],
  );

  function handleSelectAllToggle() {
    if (allSelectableChecked) {
      onSelectManyTx(selectedTxIds.filter((id) => !selectableFilteredIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedTxIds, ...selectableFilteredIds]));
      onSelectManyTx(merged);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              Histori Transaksi Real-Time
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {isPremium
                ? 'Menampilkan seluruh riwayat transaksi yang terbaca dari kartu beserta lampiran struk & foto.'
                : 'Paket Gratis menampilkan 5 transaksi terakhir tiap kartu. Upgrade ke Premium untuk membuka seluruh riwayat.'}
            </p>
          </div>

          {selectedTxIds.length > 0 && (
            <button
              type="button"
              onClick={onOpenReimburseWithSelection}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                Rekap {selectedTxIds.length} Item ({formatRupiah(selectedTotalAmount)})
              </span>
            </button>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'debit', label: 'Pengeluaran' },
                { id: 'topup', label: 'Top Up' },
                { id: 'unclaimed', label: 'Siap Reimburse' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              aria-label="Filter berdasarkan kartu"
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="all">Semua Kartu ({isPremium ? cards.length : Math.min(cards.length, 2)})</option>
              {(isPremium ? cards : cards.slice(0, 2)).map((c) => (
                <option key={c.id} value={c.id}>
                  {ISSUER_META[c.issuer].shortName} · {c.label}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari gerbang tol, lokasi, catatan..."
                className="w-full sm:w-64 min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <p className="text-sm font-semibold text-slate-900">
            Tidak ada transaksi yang sesuai filter
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tempelkan kartu NFC atau ubah kriteria pencarian untuk melihat mutasi.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 pl-6 pr-2 w-10">
                    <button
                      type="button"
                      onClick={handleSelectAllToggle}
                      title="Pilih semua pengeluaran yang belum direkap"
                      className="text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
                    >
                      {allSelectableChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-700" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Waktu</th>
                  <th className="py-3 px-3">Merchant / Lokasi</th>
                  <th className="py-3 px-3">Kartu</th>
                  <th className="py-3 px-3">Bukti & Status</th>
                  <th className="py-3 px-3 text-right">Nominal</th>
                  <th className="py-3 px-3 text-right">Saldo Akhir</th>
                  <th className="py-3 pl-2 pr-6 w-10" aria-label="Aksi" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((tx) => {
                  const isSelectable =
                    tx.type === 'debit' && tx.reimburseStatus === 'unclaimed';
                  const isChecked = selectedTxIds.includes(tx.id);
                  const hasMedia = Boolean(tx.receiptImage || tx.activityPhoto);
                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isChecked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-6 pr-2">
                        {isSelectable ? (
                          <button
                            type="button"
                            onClick={() => onToggleSelectTx(tx.id)}
                            aria-label={`Pilih transaksi ${tx.merchant}`}
                            className="text-slate-400 hover:text-blue-700 flex items-center justify-center cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-blue-700" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="block w-4 h-4" aria-hidden="true" />
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
                        {formatDateTimeId(tx.timestamp)}
                      </td>
                      <td className="py-3.5 px-3 max-w-xs">
                        <div className="font-medium text-slate-900 truncate">
                          {tx.merchant}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {CATEGORY_LABELS[tx.category]} · {tx.location}
                          {tx.notes ? ` · ${tx.notes}` : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-900">
                          {ISSUER_META[tx.issuer].shortName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                          {tx.cardLabel}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs">
                        <div className="space-y-1">
                          <div>
                            {tx.type === 'topup' ? (
                              <span className="text-slate-400">Non-reimburse (Top Up)</span>
                            ) : (
                              <span
                                className={
                                  tx.reimburseStatus === 'approved'
                                    ? 'font-medium text-emerald-700'
                                    : tx.reimburseStatus === 'submitted'
                                      ? 'font-medium text-blue-700'
                                      : tx.reimburseStatus === 'in_batch'
                                        ? 'font-medium text-amber-700'
                                        : 'text-slate-600'
                                }
                              >
                                {REIMBURSE_STATUS_LABELS[tx.reimburseStatus]}
                              </span>
                            )}
                          </div>
                          {hasMedia && (
                            <button
                              type="button"
                              onClick={() => setMediaPreviewTx(tx)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              {tx.receiptImage && <Receipt className="w-3 h-3" />}
                              {tx.activityPhoto && <Camera className="w-3 h-3" />}
                              <span>Lihat Lampiran</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className={`py-3.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          tx.type === 'topup' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {tx.type === 'topup' ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatRupiah(tx.balanceAfter)}
                      </td>
                      <td className="py-3.5 pl-2 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteTx(tx.id)}
                          title="Hapus transaksi"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Rows */}
          <div className="md:hidden divide-y divide-slate-100">
            {filtered.map((tx) => {
              const isSelectable =
                tx.type === 'debit' && tx.reimburseStatus === 'unclaimed';
              const isChecked = selectedTxIds.includes(tx.id);
              const hasMedia = Boolean(tx.receiptImage || tx.activityPhoto);
              return (
                <div
                  key={tx.id}
                  className={`p-4 flex items-start gap-3 ${isChecked ? 'bg-blue-50/40' : ''}`}
                >
                  {isSelectable ? (
                    <button
                      type="button"
                      onClick={() => onToggleSelectTx(tx.id)}
                      aria-label={`Pilih ${tx.merchant}`}
                      className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center text-slate-400 cursor-pointer"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-blue-700" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      {tx.type === 'topup' ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-slate-700" />
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900 leading-snug">
                        {tx.merchant}
                      </div>
                      <div
                        className={`text-sm font-mono tabular-nums font-bold shrink-0 ${
                          tx.type === 'topup' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {tx.type === 'topup' ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {ISSUER_META[tx.issuer].shortName} · {CATEGORY_LABELS[tx.category]} ·{' '}
                      {formatDateTimeId(tx.timestamp)}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {tx.type === 'topup'
                          ? 'Top Up Saldo'
                          : REIMBURSE_STATUS_LABELS[tx.reimburseStatus]}
                      </span>
                      <span className="font-mono tabular-nums">
                        Saldo {formatRupiah(tx.balanceAfter)}
                      </span>
                    </div>
                    {hasMedia && (
                      <button
                        type="button"
                        onClick={() => setMediaPreviewTx(tx)}
                        className="mt-1.5 text-[11px] font-semibold text-blue-700 inline-flex items-center gap-1"
                      >
                        <Receipt className="w-3 h-3" />
                        <span>Lihat Struk & Foto Kegiatan</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Free Tier Cap Banner */}
      {!isPremium && hiddenByPlanCount > 0 && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-700 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <span className="font-semibold">
                {hiddenByPlanCount} transaksi lebih lama tersimpan di arsip cloud.
              </span>{' '}
              Paket Gratis menampilkan 5 transaksi terakhir per kartu.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onRequireUpgrade(
                `Buka ${hiddenByPlanCount} riwayat transaksi lebih lama dan seluruh mutasi kartu dengan Paket Premium (mulai 5K/minggu).`,
              )
            }
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Lihat Seluruh Riwayat
          </button>
        </div>
      )}

      {/* Media Lightbox */}
      {mediaPreviewTx && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{mediaPreviewTx.merchant}</h3>
                <p className="text-xs text-slate-500">
                  {formatDateTimeId(mediaPreviewTx.timestamp)} ·{' '}
                  {formatRupiah(mediaPreviewTx.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMediaPreviewTx(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[75vh] overflow-y-auto">
              {mediaPreviewTx.receiptImage && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Struk Resmi Operator
                  </div>
                  <img
                    src={mediaPreviewTx.receiptImage}
                    alt="Struk resmi operator"
                    className="w-full rounded-xl border border-slate-200 object-contain max-h-80 bg-slate-50"
                  />
                </div>
              )}
              {mediaPreviewTx.activityPhoto && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Foto Kegiatan Lapangan
                  </div>
                  <img
                    src={mediaPreviewTx.activityPhoto}
                    alt="Foto kegiatan lapangan"
                    className="w-full rounded-xl border border-slate-200 object-contain max-h-80 bg-slate-50"
                  />
                </div>
              )}
              {(mediaPreviewTx.notes || mediaPreviewTx.activityCaption) && (
                <div className="sm:col-span-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="font-semibold">Keterangan: </span>
                  {mediaPreviewTx.notes || mediaPreviewTx.activityCaption}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
