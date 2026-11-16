import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  EMoneyCard,
  EMoneyTransaction,
  ReimburseBatch,
  WorkspaceProfile,
} from '../types';
import {
  CATEGORY_LABELS,
  formatDateShortId,
  formatDateTimeId,
  formatRupiah,
  ISSUER_META,
} from '../lib/formatters';
import { generateReimbursePdf } from '../lib/pdfGenerator';
import { generateReimburseCsv } from '../lib/exportUtils';
import { generateCardQrDataUrl } from '../lib/qr';

interface ReimburseManagerProps {
  isPremium: boolean;
  profile: WorkspaceProfile;
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  batches: ReimburseBatch[];
  preselectedTxIds: string[];
  onClearPreselected: () => void;
  onCreateBatch: (payload: {
    title: string;
    employeeName: string;
    employeeId: string;
    department: string;
    companyName: string;
    approverName: string;
    notes: string;
    transactionIds: string[];
    status: 'draft' | 'submitted';
  }) => Promise<ReimburseBatch>;
  onUpdateBatchStatus: (
    batchId: string,
    status: 'draft' | 'submitted' | 'approved',
  ) => Promise<void>;
  onDeleteBatch: (batchId: string) => Promise<void>;
  onRequireUpgrade: (reason: string) => void;
}

export function ReimburseManager({
  isPremium,
  profile,
  cards,
  transactions,
  batches,
  preselectedTxIds,
  onClearPreselected,
  onCreateBatch,
  onUpdateBatchStatus,
  onDeleteBatch,
  onRequireUpgrade,
}: ReimburseManagerProps) {
  const unclaimedDebits = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.type === 'debit' && tx.reimburseStatus === 'unclaimed',
      ),
    [transactions],
  );

  const [pickedIds, setPickedIds] = useState<string[] | null>(null);
  const [title, setTitle] = useState('Laporan Reimburse e-Money Operasional');
  const [employeeName, setEmployeeName] = useState(profile.employeeName);
  const [employeeId, setEmployeeId] = useState(profile.employeeId);
  const [department, setDepartment] = useState(profile.department);
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [approverName, setApproverName] = useState(profile.approverName);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [previewBatchId, setPreviewBatchId] = useState<string | null>(null);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const activePickedIds = useMemo(() => {
    const valid = new Set(unclaimedDebits.map((t) => t.id));
    const source = pickedIds !== null ? pickedIds : preselectedTxIds;
    return source.filter((id) => valid.has(id));
  }, [pickedIds, preselectedTxIds, unclaimedDebits]);

  const pickedTransactions = useMemo(
    () => unclaimedDebits.filter((t) => activePickedIds.includes(t.id)),
    [unclaimedDebits, activePickedIds],
  );

  const totalPicked = useMemo(
    () => pickedTransactions.reduce((sum, t) => sum + t.amount, 0),
    [pickedTransactions],
  );

  const previewBatch =
    batches.find((b) => b.id === previewBatchId) || batches[0] || null;
  const previewTxs = useMemo(() => {
    if (!previewBatch) return [];
    return transactions.filter((t) => previewBatch.transactionIds.includes(t.id));
  }, [previewBatch, transactions]);

  const usedCardsInPreview = useMemo(
    () => cards.filter((c) => previewTxs.some((tx) => tx.cardId === c.id)),
    [cards, previewTxs],
  );

  useEffect(() => {
    let active = true;
    if (!isPremium || usedCardsInPreview.length === 0) return;
    Promise.all(
      usedCardsInPreview.map(async (c) => [c.id, await generateCardQrDataUrl(c)] as const),
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) next[id] = url;
      setQrMap(next);
    });
    return () => {
      active = false;
    };
  }, [isPremium, usedCardsInPreview]);

  function togglePick(id: string) {
    const current = activePickedIds;
    if (current.includes(id)) {
      setPickedIds(current.filter((item) => item !== id));
    } else {
      setPickedIds([...current, id]);
    }
  }

  function pickAllTolAndParkir() {
    const ids = unclaimedDebits
      .filter((t) => t.category === 'tol' || t.category === 'parkir' || t.category === 'transportasi')
      .map((t) => t.id);
    setPickedIds(ids);
  }

  async function handleSubmitBatch(status: 'draft' | 'submitted') {
    if (activePickedIds.length === 0) return;
    setSubmitting(true);
    try {
      const created = await onCreateBatch({
        title: title.trim() || 'Laporan Reimburse e-Money',
        employeeName: employeeName.trim() || profile.employeeName,
        employeeId: employeeId.trim() || profile.employeeId,
        department: department.trim() || profile.department,
        companyName: companyName.trim() || profile.companyName,
        approverName: approverName.trim() || profile.approverName,
        notes: notes.trim(),
        transactionIds: activePickedIds,
        status,
      });
      setPickedIds([]);
      setNotes('');
      onClearPreselected();
      setPreviewBatchId(created.id);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadPdf(batch: ReimburseBatch) {
    if (!isPremium) {
      onRequireUpgrade(
        'Ekspor laporan ke PDF dengan QR verifikasi kartu, struk resmi operator, dan foto kegiatan tersedia di Paket Premium (mulai 5K/minggu).',
      );
      return;
    }
    setExportingPdf(true);
    try {
      const batchTxs = transactions.filter((t) => batch.transactionIds.includes(t.id));
      await generateReimbursePdf({ batch, transactions: batchTxs, cards });
    } finally {
      setExportingPdf(false);
    }
  }

  function handleDownloadCsv(batch: ReimburseBatch) {
    if (!isPremium) {
      onRequireUpgrade(
        'Ekspor data rekap ke format CSV (Excel) tersedia di Paket Premium (mulai 5K/minggu).',
      );
      return;
    }
    const batchTxs = transactions.filter((t) => batch.transactionIds.includes(t.id));
    generateReimburseCsv({ batch, transactions: batchTxs, cards });
  }

  function handlePrintReport(batch: ReimburseBatch) {
    if (!isPremium) {
      onRequireUpgrade(
        'Fitur Cetak laporan kantor langsung beserta QR verifikasi dan lampiran foto tersedia di Paket Premium (mulai 5K/minggu).',
      );
      return;
    }
    setPreviewBatchId(batch.id);
    setTimeout(() => {
      window.print();
    }, 150);
  }

  const txsWithMedia = previewTxs.filter(
    (tx) => tx.receiptImage || tx.activityPhoto || tx.activityCaption,
  );

  return (
    <div className="space-y-6">
      {/* Builder Section (hidden when printing) */}
      <section className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">
                1. Pilih Mutasi untuk Rekap Reimburse
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Hanya transaksi pengeluaran yang belum direkap yang ditampilkan.
              </p>
            </div>
            {unclaimedDebits.length > 0 && (
              <button
                type="button"
                onClick={pickAllTolAndParkir}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pilih Semua Tol, Parkir & Transport
              </button>
            )}
          </div>

          {unclaimedDebits.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Semua transaksi pengeluaran sudah masuk ke dalam rekap reimburse.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
              {unclaimedDebits.map((tx) => {
                const checked = activePickedIds.includes(tx.id);
                return (
                  <label
                    key={tx.id}
                    className={`flex items-center justify-between gap-3 py-3 px-2 rounded-xl cursor-pointer transition-colors ${
                      checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePick(tx.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {tx.merchant}
                        </div>
                        <div className="text-xs text-slate-500">
                          {ISSUER_META[tx.issuer].shortName} · {CATEGORY_LABELS[tx.category]} ·{' '}
                          {formatDateTimeId(tx.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-mono tabular-nums font-bold text-slate-900 shrink-0">
                      {formatRupiah(tx.amount)}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Form Metadata Laporan */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 font-display">
              2. Detail Laporan Kantor
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Identitas karyawan dan perusahaan dicetak langsung ke PDF, CSV, dan halaman cetak.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Judul Laporan Reimburse
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Karyawan
              </label>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                NIK / ID Karyawan
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Departemen / Divisi
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Perusahaan
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Atasan / Finance Penyetuju
            </label>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan Perjalanan Dinas (opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Misal: Kunjungan klien wilayah Jakarta - Bandung"
              className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">
                Total Rekap ({activePickedIds.length} transaksi)
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-blue-700">
                {formatRupiah(totalPicked)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting || activePickedIds.length === 0}
                onClick={() => handleSubmitBatch('draft')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-800 whitespace-nowrap cursor-pointer"
              >
                Simpan Draft
              </button>
              <button
                type="button"
                disabled={submitting || activePickedIds.length === 0}
                onClick={() => handleSubmitBatch('submitted')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Rekap</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Saved Batches & Multi-Format Export */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="no-print lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-900 font-display">
            Daftar Rekap Tersimpan ({batches.length})
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Ekspor ke PDF, CSV, atau cetak langsung (fitur Paket Premium).
          </p>

          {batches.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada rekap reimburse tersimpan.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {batches.map((batch) => {
                const isSelected = previewBatch?.id === batch.id;
                return (
                  <div
                    key={batch.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewBatchId(batch.id)}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-[11px] font-mono text-slate-500">
                          {batch.reportNumber} ·{' '}
                          {batch.status === 'approved'
                            ? 'Disetujui Finance'
                            : batch.status === 'submitted'
                              ? 'Diajukan'
                              : 'Draft'}
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-900 truncate">
                          {batch.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {batch.transactionIds.length} transaksi ·{' '}
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {formatRupiah(batch.totalAmount)}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(batch)}
                          title="Unduh PDF"
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCsv(batch)}
                          title="Unduh CSV"
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>CSV</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {batch.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => onUpdateBatchStatus(batch.id, 'submitted')}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Tandai Diajukan</span>
                          </button>
                        )}
                        {batch.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => onUpdateBatchStatus(batch.id, 'approved')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Tandai Disetujui</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteBatch(batch.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title="Hapus rekap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Corporate A4 Preview & Print Area */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {previewBatch ? (
            <div>
              <div className="p-5 sm:p-6 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-300 font-mono">
                    {previewBatch.reportNumber} · Pratinjau Laporan Kantor A4
                  </div>
                  <h3 className="mt-1 text-base font-bold font-display">
                    {previewBatch.companyName}
                  </h3>
                </div>
                <div className="no-print flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={() => handleDownloadPdf(previewBatch)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingPdf ? 'Membuat...' : 'Ekspor PDF'}</span>
                    {!isPremium && <Crown className="w-3.5 h-3.5 text-amber-300" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadCsv(previewBatch)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>CSV</span>
                    {!isPremium && <Crown className="w-3.5 h-3.5 text-amber-300" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintReport(previewBatch)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak</span>
                    {!isPremium && <Crown className="w-3.5 h-3.5 text-amber-300" />}
                  </button>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-slate-500">Karyawan: </span>
                      <span className="font-semibold text-slate-900">
                        {previewBatch.employeeName} ({previewBatch.employeeId})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Divisi: </span>
                      <span className="font-semibold text-slate-900">
                        {previewBatch.department}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-slate-500">Periode: </span>
                      <span className="font-semibold text-slate-900">
                        {formatDateShortId(previewBatch.periodStart)} –{' '}
                        {formatDateShortId(previewBatch.periodEnd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Klaim: </span>
                      <span className="font-bold font-mono tabular-nums text-blue-700">
                        {formatRupiah(previewBatch.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Kartu</th>
                        <th className="py-2.5 px-3">Keterangan</th>
                        <th className="py-2.5 px-3 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewTxs.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatDateShortId(tx.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                            {ISSUER_META[tx.issuer].shortName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900">
                            <div className="font-medium">{tx.merchant}</div>
                            <div className="text-[11px] text-slate-500">
                              {CATEGORY_LABELS[tx.category]}
                              {tx.notes ? ` · ${tx.notes}` : ''}
                              {tx.activityCaption ? ` · ${tx.activityCaption}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatRupiah(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50/70 border-t border-slate-200 font-bold text-blue-800">
                        <td colSpan={3} className="py-2.5 px-3 text-right">
                          TOTAL REIMBURSE
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatRupiah(previewBatch.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Card Verification QR Codes in Preview / Print */}
                {isPremium && usedCardsInPreview.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-slate-900">
                      Kode QR Verifikasi Kartu
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {usedCardsInPreview.map((card) => (
                        <div
                          key={card.id}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50"
                        >
                          {qrMap[card.id] ? (
                            <img
                              src={qrMap[card.id]}
                              alt={`QR ${card.label}`}
                              className="w-16 h-16 rounded border border-slate-200 bg-white shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded border border-slate-200 bg-white shrink-0" />
                          )}
                          <div className="min-w-0 text-[11px]">
                            <div className="font-bold text-slate-900 truncate">
                              {ISSUER_META[card.issuer].name}
                            </div>
                            <div className="font-mono text-slate-600 truncate">
                              {card.cardNumberMasked}
                            </div>
                            <div className="font-mono text-blue-700 font-semibold truncate">
                              {card.verificationCode}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lampiran Struk Resmi Operator & Foto Kegiatan */}
                {isPremium && txsWithMedia.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-slate-900">
                      Lampiran Struk Resmi Operator & Foto Kegiatan
                    </div>
                    <div className="space-y-3">
                      {txsWithMedia.map((tx) => (
                        <div
                          key={tx.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
                        >
                          <div className="text-xs font-semibold text-slate-900">
                            {tx.merchant} · {formatRupiah(tx.amount)}
                          </div>
                          {(tx.notes || tx.activityCaption) && (
                            <div className="text-[11px] text-slate-600">
                              {tx.notes || tx.activityCaption}
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {tx.receiptImage && (
                              <div>
                                <div className="text-[11px] font-medium text-slate-500 mb-1">
                                  Struk Resmi Operator
                                </div>
                                <img
                                  src={tx.receiptImage}
                                  alt="Struk resmi operator"
                                  className="w-full h-36 object-cover rounded-lg border border-slate-200 bg-white"
                                />
                              </div>
                            )}
                            {tx.activityPhoto && (
                              <div>
                                <div className="text-[11px] font-medium text-slate-500 mb-1">
                                  Foto Kegiatan
                                </div>
                                <img
                                  src={tx.activityPhoto}
                                  alt="Foto kegiatan"
                                  className="w-full h-36 object-cover rounded-lg border border-slate-200 bg-white"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 pt-4 text-center text-[11px] text-slate-500">
                  <div>
                    <div>Diajukan Oleh</div>
                    <div className="mt-8 pt-1 border-t border-slate-300 font-semibold text-slate-800">
                      {previewBatch.employeeName}
                    </div>
                  </div>
                  <div>
                    <div>Diverifikasi Finance</div>
                    <div className="mt-8 pt-1 border-t border-slate-300 font-semibold text-slate-800">
                      Bagian Finance / GA
                    </div>
                  </div>
                  <div>
                    <div>Disetujui Oleh</div>
                    <div className="mt-8 pt-1 border-t border-slate-300 font-semibold text-slate-800">
                      {previewBatch.approverName}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 px-6 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Pratinjau Laporan PDF Kantor
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Buat rekap reimburse terlebih dahulu untuk melihat pratinjau dokumen PDF, CSV, dan Cetak.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
