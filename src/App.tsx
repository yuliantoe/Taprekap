/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  CreditCard,
  Crown,
  Download,
  FileSpreadsheet,
  History,
  Home,
  Nfc,
  Wallet,
  Wifi,
} from 'lucide-react';
import type {
  BillingCycle,
  CardIssuer,
  EMoneyCard,
  PlanTier,
  QrisPaymentOrder,
  ReimburseBatch,
  TransactionCategory,
  TransactionType,
  WorkspaceData,
  WorkspaceProfile,
} from './types';
import { formatDateTimeId, formatRupiah } from './lib/formatters';
import { generateReimbursePdf } from './lib/pdfGenerator';
import { CardVisual } from './components/CardVisual';
import { NfcScannerPanel } from './components/NfcScannerPanel';
import { TransactionsLedger } from './components/TransactionsLedger';
import { ReimburseManager } from './components/ReimburseManager';
import { WalletManager } from './components/WalletManager';
import { CloudSyncModal } from './components/CloudSyncModal';
import { PricingSection } from './components/PricingSection';
import { UpgradeModal } from './components/UpgradeModal';
import { CardQrModal } from './components/CardQrModal';
import { QrisCheckoutModal } from './components/QrisCheckoutModal';
import { LandingPage } from './components/LandingPage';
import {
  createClientSeedWorkspace,
  localCancelQris,
  localConfirmQris,
  localCreateBatch,
  localDeleteBatch,
  localDeleteCard,
  localDeleteTx,
  localRecordTransaction,
  localSaveCard,
  localSaveProfile,
  localSelectPlan,
  localStartQris,
  localUpdateBatchStatus,
  localUpdateCard,
  readWorkspaceMirror,
  writeWorkspaceMirror,
} from './lib/workspaceClientFallback';

type ActiveTab = 'landing' | 'scan' | 'history' | 'reimburse' | 'wallet' | 'pricing';

class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isApiUnavailableError(err: unknown): boolean {
  if (err instanceof ApiHttpError) {
    return err.status === 404 || err.status >= 500;
  }
  return err instanceof TypeError;
}

function getInitialTab(): ActiveTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (
    tab === 'scan' ||
    tab === 'history' ||
    tab === 'reimburse' ||
    tab === 'wallet' ||
    tab === 'pricing'
  ) {
    return tab;
  }
  return 'landing';
}

function getInitialWorkspaceCode(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('ws');
  if (fromUrl) {
    const cleaned = fromUrl.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleaned) {
      localStorage.setItem('taprekap_ws', cleaned);
      return cleaned;
    }
  }
  return localStorage.getItem('taprekap_ws') || 'KANTOR-ID-01';
}

export default function App() {
  const [workspaceCode, setWorkspaceCode] = useState<string>(getInitialWorkspaceCode);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(() =>
    readWorkspaceMirror(getInitialWorkspaceCode()),
  );
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [localFallbackActive, setLocalFallbackActive] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const [qrCard, setQrCard] = useState<EMoneyCard | null>(null);
  const [activeQrisOrder, setActiveQrisOrder] = useState<QrisPaymentOrder | null>(null);

  const isPremium = workspace?.subscription?.tier === 'premium';

  const applyWorkspace = useCallback(
    (data: WorkspaceData) => {
      setWorkspace(data);
      writeWorkspaceMirror(workspaceCode, data);
      setActiveCardId((prev) =>
        prev && data.cards.some((c) => c.id === prev) ? prev : data.cards[0]?.id || null,
      );
    },
    [workspaceCode],
  );

  const apiFetch = useCallback(
    async <T,>(url: string, options?: RequestInit): Promise<T> => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-code': workspaceCode,
          ...(options?.headers || {}),
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiHttpError(
          res.status,
          body.error || `Permintaan gagal (${res.status})`,
        );
      }
      return res.json() as Promise<T>;
    },
    [workspaceCode],
  );

  useEffect(() => {
    let active = true;
    let es: EventSource | null = null;
    setLoading(true);
    setApiError(null);
    setLocalFallbackActive(false);

    apiFetch<WorkspaceData>(`/api/workspace?workspace=${encodeURIComponent(workspaceCode)}`)
      .then(async (data) => {
        if (!active) return;

        let resolved = data;
        if (data.ephemeralRuntime) {
          const mirror = readWorkspaceMirror(workspaceCode);
          if (mirror && new Date(mirror.updatedAt).getTime() > new Date(data.updatedAt).getTime()) {
            try {
              resolved = await apiFetch<WorkspaceData>('/api/workspace/hydrate', {
                method: 'POST',
                body: JSON.stringify({ workspace: mirror }),
              });
            } catch {
              resolved = mirror;
            }
          }
        }

        if (!active) return;
        applyWorkspace(resolved);
        setLoading(false);

        if (!resolved.ephemeralRuntime) {
          es = new EventSource(`/api/stream?workspace=${encodeURIComponent(workspaceCode)}`);
          es.addEventListener('sync', (evt) => {
            try {
              const synced = JSON.parse((evt as MessageEvent).data) as WorkspaceData;
              if (!active) return;
              applyWorkspace(synced);
            } catch {
              // ignore parse failure
            }
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        if (isApiUnavailableError(err)) {
          const fallback = createClientSeedWorkspace(workspaceCode);
          setLocalFallbackActive(true);
          applyWorkspace(fallback);
          setApiError(null);
          setLoading(false);
          return;
        }
        setApiError(err instanceof Error ? err.message : 'Gagal memuat data cloud.');
        setLoading(false);
      });

    return () => {
      active = false;
      es?.close();
    };
  }, [workspaceCode, apiFetch, applyWorkspace]);

  function handleSwitchWorkspace(nextCode: string) {
    localStorage.setItem('taprekap_ws', nextCode);
    const url = new URL(window.location.href);
    url.searchParams.set('ws', nextCode);
    window.history.replaceState({}, '', url.toString());
    setSelectedTxIds([]);
    setActiveCardId(null);
    setWorkspaceCode(nextCode);
  }

  async function withServerSync<T>(
    serverCall: () => Promise<T>,
    localFallback: (current: WorkspaceData) => T,
  ): Promise<T> {
    if (!localFallbackActive) {
      try {
        return await serverCall();
      } catch (err) {
        if (!isApiUnavailableError(err) || !workspace) {
          throw err;
        }
        if (workspace.ephemeralRuntime) {
          try {
            await apiFetch<WorkspaceData>('/api/workspace/hydrate', {
              method: 'POST',
              body: JSON.stringify({ workspace }),
            });
            return await serverCall();
          } catch {
            // Fall through to local mirror update
          }
        }
        setLocalFallbackActive(true);
      }
    }
    const base = workspace || createClientSeedWorkspace(workspaceCode);
    return localFallback(base);
  }

  async function handleSelectPlan(tier: PlanTier, billingCycle?: BillingCycle) {
    const updated = await withServerSync(
      () =>
        apiFetch<WorkspaceData>('/api/workspace/subscription', {
          method: 'PUT',
          body: JSON.stringify({ tier, billingCycle }),
        }),
      (curr) => localSelectPlan(curr, tier, billingCycle),
    );
    applyWorkspace(updated);
  }

  async function handleStartQrisPayment(billingCycle: BillingCycle) {
    const res = await withServerSync(
      () =>
        apiFetch<{ order: QrisPaymentOrder; workspace: WorkspaceData }>('/api/payments/qris', {
          method: 'POST',
          body: JSON.stringify({ billingCycle }),
        }),
      (curr) => localStartQris(curr, billingCycle),
    );
    applyWorkspace(res.workspace);
    setActiveQrisOrder(res.order);
  }

  async function handleConfirmQrisPayment(orderId: string) {
    const res = await withServerSync(
      () =>
        apiFetch<{ order: QrisPaymentOrder; workspace: WorkspaceData }>(
          `/api/payments/qris/${orderId}/confirm`,
          { method: 'POST' },
        ),
      (curr) => localConfirmQris(curr, orderId),
    );
    applyWorkspace(res.workspace);
    setActiveQrisOrder(res.order);
  }

  async function handleCancelQrisOrder(orderId: string) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/payments/qris/${orderId}`, {
          method: 'DELETE',
        }),
      (curr) => ({ workspace: localCancelQris(curr, orderId) }),
    );
    applyWorkspace(res.workspace);
    setActiveQrisOrder(null);
  }

  async function handleSaveProfile(profile: Partial<WorkspaceProfile>) {
    const updated = await withServerSync(
      () =>
        apiFetch<WorkspaceData>('/api/workspace/profile', {
          method: 'PUT',
          body: JSON.stringify(profile),
        }),
      (curr) => localSaveProfile(curr, profile),
    );
    applyWorkspace(updated);
  }

  async function handleSaveCard(payload: {
    uid?: string;
    cardNumberFull?: string;
    issuer: CardIssuer;
    label: string;
    balance: number;
    readSource: 'web_nfc' | 'manual_sync' | 'simulasi' | 'card_number';
  }): Promise<EMoneyCard> {
    const res = await withServerSync(
      () =>
        apiFetch<{ card: EMoneyCard; workspace: WorkspaceData }>('/api/cards', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      (curr) => localSaveCard(curr, payload),
    );
    applyWorkspace(res.workspace);
    return res.card;
  }

  async function handleUpdateCard(id: string, payload: Partial<EMoneyCard>) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/cards/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      (curr) => ({ workspace: localUpdateCard(curr, id, payload) }),
    );
    applyWorkspace(res.workspace);
  }

  async function handleDeleteCard(id: string) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/cards/${id}`, {
          method: 'DELETE',
        }),
      (curr) => ({ workspace: localDeleteCard(curr, id) }),
    );
    applyWorkspace(res.workspace);
  }

  async function handleRecordTransaction(payload: {
    cardId: string;
    type: TransactionType;
    category: TransactionCategory;
    merchant: string;
    location: string;
    amount: number;
    notes?: string;
    receiptImage?: string;
    activityPhoto?: string;
    activityCaption?: string;
    overrideBalanceAfter?: number;
  }) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      (curr) => ({ workspace: localRecordTransaction(curr, payload) }),
    );
    applyWorkspace(res.workspace);
  }

  async function handleDeleteTx(txId: string) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/transactions/${txId}`, {
          method: 'DELETE',
        }),
      (curr) => ({ workspace: localDeleteTx(curr, txId) }),
    );
    setSelectedTxIds((prev) => prev.filter((id) => id !== txId));
    applyWorkspace(res.workspace);
  }

  async function handleCreateBatch(payload: {
    title: string;
    employeeName: string;
    employeeId: string;
    department: string;
    companyName: string;
    approverName: string;
    notes: string;
    transactionIds: string[];
    status: 'draft' | 'submitted';
  }): Promise<ReimburseBatch> {
    const res = await withServerSync(
      () =>
        apiFetch<{ batch: ReimburseBatch; workspace: WorkspaceData }>('/api/batches', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      (curr) => localCreateBatch(curr, payload),
    );
    applyWorkspace(res.workspace);
    return res.batch;
  }

  async function handleUpdateBatchStatus(
    batchId: string,
    status: 'draft' | 'submitted' | 'approved',
  ) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/batches/${batchId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      (curr) => ({ workspace: localUpdateBatchStatus(curr, batchId, status) }),
    );
    applyWorkspace(res.workspace);
  }

  async function handleDeleteBatch(batchId: string) {
    const res = await withServerSync(
      () =>
        apiFetch<{ workspace: WorkspaceData }>(`/api/batches/${batchId}`, {
          method: 'DELETE',
        }),
      (curr) => ({ workspace: localDeleteBatch(curr, batchId) }),
    );
    applyWorkspace(res.workspace);
  }

  async function handleHeaderPrimaryAction() {
    if (!workspace) return;
    if (!isPremium) {
      setActiveTab('pricing');
      return;
    }
    if (workspace.batches.length > 0) {
      const latest = workspace.batches[0];
      const txs = workspace.transactions.filter((t) =>
        latest.transactionIds.includes(t.id),
      );
      await generateReimbursePdf({ batch: latest, transactions: txs, cards: workspace.cards });
      return;
    }
    setActiveTab('reimburse');
  }

  const metrics = useMemo(() => {
    if (!workspace) {
      return {
        totalBalance: 0,
        totalDebit: 0,
        unclaimedAmount: 0,
        unclaimedCount: 0,
        batchesTotal: 0,
        visibleCardsCount: 0,
      };
    }
    const visibleCards = isPremium ? workspace.cards : workspace.cards.slice(0, 2);
    const totalBalance = visibleCards.reduce((sum, c) => sum + c.balance, 0);
    const totalDebit = workspace.transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    const unclaimed = workspace.transactions.filter(
      (t) => t.type === 'debit' && t.reimburseStatus === 'unclaimed',
    );
    const unclaimedAmount = unclaimed.reduce((sum, t) => sum + t.amount, 0);
    const batchesTotal = workspace.batches.reduce((sum, b) => sum + b.totalAmount, 0);
    return {
      totalBalance,
      totalDebit,
      unclaimedAmount,
      unclaimedCount: unclaimed.length,
      batchesTotal,
      visibleCardsCount: visibleCards.length,
    };
  }, [workspace, isPremium]);

  const navItems: Array<{ id: ActiveTab; label: string; icon: typeof Nfc }> = [
    { id: 'scan', label: 'Scan NFC', icon: Nfc },
    { id: 'history', label: 'Histori', icon: History },
    { id: 'reimburse', label: 'Reimburse', icon: FileSpreadsheet },
    { id: 'wallet', label: 'Dompet Kartu', icon: Wallet },
    { id: 'pricing', label: 'Paket Harga', icon: Crown },
  ];

  const landingNavLinks = [
    { href: '#cara-kerja', label: 'Cara kerja' },
    { href: '#keunggulan', label: 'Keunggulan' },
    { href: '#harga', label: 'Harga' },
    { href: '#untuk-siapa', label: 'Untuk siapa' },
    { href: '#faq', label: 'FAQ' },
  ];

  const mobileNavItems: Array<{ id: ActiveTab; label: string; icon: typeof Nfc }> = [
    { id: 'landing', label: 'Beranda', icon: Home },
    { id: 'scan', label: 'Scan NFC', icon: Nfc },
    { id: 'history', label: 'Histori', icon: History },
    { id: 'reimburse', label: 'Reimburse', icon: FileSpreadsheet },
  ];

  function openWorkspaceTab(tab: ActiveTab) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-white text-neutral-950 pb-20 lg:pb-12">
      {/* Sticky Top Bar following strict 3-zone contract */}
      <header className="no-print sticky top-0 z-30 h-14 lg:h-16 bg-white/95 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              openWorkspaceTab('landing');
            }}
            className="inline-flex items-center gap-2.5 text-lg font-extrabold font-display tracking-tight text-neutral-950 whitespace-nowrap shrink-0"
          >
            <span
              className="w-8 h-8 rounded-lg bg-neutral-950 text-white inline-flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Wifi className="w-4 h-4 rotate-90" />
            </span>
            <span>TapRekap</span>
          </a>

          <nav
            aria-label="Navigasi Utama"
            className="hidden lg:flex items-center gap-7 text-sm font-medium"
          >
            {activeTab === 'landing'
              ? landingNavLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="py-1 text-neutral-600 hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0"
                  >
                    {link.label}
                  </a>
                ))
              : navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openWorkspaceTab(item.id)}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activeTab === item.id
                        ? 'border-blue-600 text-neutral-950 font-semibold'
                        : 'border-transparent text-neutral-600 hover:text-neutral-950'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
          </nav>

          <div className="shrink-0">
            {activeTab === 'landing' ? (
              <button
                type="button"
                onClick={() => openWorkspaceTab('scan')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Nfc className="w-3.5 h-3.5" />
                <span>Buka Aplikasi NFC</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleHeaderPrimaryAction}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPremium ? (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor PDF</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-3.5 h-3.5" />
                    <span>Upgrade Premium</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-8">
        {activeTab === 'landing' ? (
          <>
            {apiError && (
              <div
                role="alert"
                className="no-print rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {apiError}
              </div>
            )}
            {!workspace ? (
              <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center text-sm text-neutral-500">
                Menyiapkan TapRekap...
              </div>
            ) : (
              <LandingPage
                cards={workspace.cards}
                transactions={workspace.transactions}
                subscription={workspace.subscription}
                paymentHistory={workspace.paymentHistory || []}
                onEnterApp={(targetTab = 'scan') => openWorkspaceTab(targetTab)}
                onSelectPlan={handleSelectPlan}
                onStartQrisPayment={handleStartQrisPayment}
                onResumeQrisOrder={(order) => setActiveQrisOrder(order)}
              />
            )}
          </>
        ) : (
          <>
            {/* Workspace Context & Plan Status Strip */}
            <div className="no-print flex flex-col md:flex-row md:items-end justify-between gap-4 pt-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight text-neutral-950 text-balance">
                  {activeTab === 'scan'
                    ? 'Panel Pembaca NFC & Sinkronisasi Cloud'
                    : 'Cek Saldo NFC & Rekap Reimburse e-Money'}
                </h1>
                <p className="mt-1 text-sm text-neutral-600">
                  {workspace
                    ? `${isPremium ? 'Paket Premium Aktif' : 'Paket Gratis (Tanpa Login)'} · ${workspace.profile.employeeName} · Sinkron ${formatDateTimeId(workspace.updatedAt)}`
                    : 'Memuat data sinkronisasi cloud...'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openWorkspaceTab('pricing')}
                  className="lg:hidden min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-semibold text-neutral-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>{isPremium ? 'Premium' : 'Paket Harga'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(true)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white border border-neutral-200 hover:border-neutral-300 text-xs font-semibold text-neutral-900 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Cloud className="w-4 h-4 text-blue-600" />
                  <span>Workspace: {workspaceCode}</span>
                </button>
              </div>
            </div>

            {apiError && (
              <div
                role="alert"
                className="no-print rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {apiError}
              </div>
            )}

        {/* 4-Column KPI Summary Row */}
        <section className="no-print grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-50/70 border border-neutral-200 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-neutral-500">Total Saldo Kartu</div>
            <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-neutral-950">
              {loading ? '—' : formatRupiah(metrics.totalBalance)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {workspace
                ? isPremium
                  ? `${metrics.visibleCardsCount} kartu tersimpan`
                  : `${metrics.visibleCardsCount}/2 kartu (Gratis)`
                : 'Memuat...'}
            </div>
          </div>

          <div className="bg-neutral-50/70 border border-neutral-200 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-neutral-500">Total Pengeluaran</div>
            <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-neutral-950">
              {loading ? '—' : formatRupiah(metrics.totalDebit)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Tol, parkir, BBM & transport
            </div>
          </div>

          <div className="bg-neutral-50/70 border border-neutral-200 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-neutral-500">Siap Direimburse</div>
            <div className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-blue-600">
              {loading ? '—' : formatRupiah(metrics.unclaimedAmount)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {metrics.unclaimedCount} transaksi belum direkap
            </div>
          </div>

          <div className="bg-neutral-50/70 border border-neutral-200 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-neutral-500">Status Paket Aktif</div>
            <div className="mt-1.5 text-xl sm:text-2xl font-bold font-display text-neutral-950">
              {loading ? '—' : isPremium ? 'Premium' : 'Gratis'}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {isPremium
                ? 'PDF, CSV, Cetak, QR & Lampiran Aktif'
                : 'Cek saldo tanpa batas · 5 tx/kartu'}
            </div>
          </div>
        </section>

        {/* Main Workspace Content */}
        {loading || !workspace ? (
          <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center text-sm text-neutral-500">
            Menghubungkan ke basis data cloud...
          </div>
        ) : (
          <>
            {activeTab === 'scan' && (
              <div id="nfc-scanner-dock" className="space-y-6 scroll-mt-20">
                <NfcScannerPanel
                  isPremium={Boolean(isPremium)}
                  cards={workspace.cards}
                  activeCardId={activeCardId}
                  onSelectCard={setActiveCardId}
                  onSaveCardFromScan={handleSaveCard}
                  onDeleteCard={handleDeleteCard}
                  onRecordTransaction={handleRecordTransaction}
                  onRequireUpgrade={(reason) => setUpgradeReason(reason)}
                />

                {/* Card Strip Overview */}
                {workspace.cards.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-base font-bold text-neutral-950 font-display flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-neutral-600" />
                        <span>
                          Kartu Tersimpan ({isPremium ? workspace.cards.length : `${Math.min(workspace.cards.length, 2)}/2 Gratis`})
                        </span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('wallet')}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        Kelola Semua Kartu
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {(isPremium ? workspace.cards : workspace.cards.slice(0, 2)).map((card) => (
                        <CardVisual
                          key={card.id}
                          card={card}
                          compact
                          selected={card.id === activeCardId}
                          onSelect={(c) => setActiveCardId(c.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Recent Transactions Snapshot */}
                <TransactionsLedger
                  isPremium={Boolean(isPremium)}
                  cards={workspace.cards}
                  transactions={workspace.transactions}
                  selectedTxIds={selectedTxIds}
                  onToggleSelectTx={(id) =>
                    setSelectedTxIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                  onSelectManyTx={setSelectedTxIds}
                  onDeleteTx={handleDeleteTx}
                  onOpenReimburseWithSelection={() => setActiveTab('reimburse')}
                  onRequireUpgrade={(reason) => setUpgradeReason(reason)}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <TransactionsLedger
                isPremium={Boolean(isPremium)}
                cards={workspace.cards}
                transactions={workspace.transactions}
                selectedTxIds={selectedTxIds}
                onToggleSelectTx={(id) =>
                  setSelectedTxIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
                onSelectManyTx={setSelectedTxIds}
                onDeleteTx={handleDeleteTx}
                onOpenReimburseWithSelection={() => setActiveTab('reimburse')}
                onRequireUpgrade={(reason) => setUpgradeReason(reason)}
              />
            )}

            {activeTab === 'reimburse' && (
              <ReimburseManager
                isPremium={Boolean(isPremium)}
                profile={workspace.profile}
                cards={workspace.cards}
                transactions={workspace.transactions}
                batches={workspace.batches}
                preselectedTxIds={selectedTxIds}
                onClearPreselected={() => setSelectedTxIds([])}
                onCreateBatch={handleCreateBatch}
                onUpdateBatchStatus={handleUpdateBatchStatus}
                onDeleteBatch={handleDeleteBatch}
                onRequireUpgrade={(reason) => setUpgradeReason(reason)}
              />
            )}

            {activeTab === 'wallet' && (
              <WalletManager
                isPremium={Boolean(isPremium)}
                cards={workspace.cards}
                transactions={workspace.transactions}
                activeCardId={activeCardId}
                onSelectCard={setActiveCardId}
                onSaveCard={handleSaveCard}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onOpenQr={(card) => setQrCard(card)}
                onRequireUpgrade={(reason) => setUpgradeReason(reason)}
              />
            )}

            {activeTab === 'pricing' && (
              <PricingSection
                subscription={workspace.subscription}
                paymentHistory={workspace.paymentHistory || []}
                onSelectPlan={handleSelectPlan}
                onStartQrisPayment={handleStartQrisPayment}
                onResumeQrisOrder={(order) => setActiveQrisOrder(order)}
              />
            )}
          </>
        )}
          </>
        )}
      </main>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Navigasi Mobile"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                active ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {workspace && (
        <CloudSyncModal
          key={`${workspaceCode}-${syncModalOpen}`}
          open={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          workspaceCode={workspaceCode}
          profile={workspace.profile}
          onSwitchWorkspace={handleSwitchWorkspace}
          onSaveProfile={handleSaveProfile}
        />
      )}

      <UpgradeModal
        open={upgradeReason !== null}
        reason={upgradeReason || ''}
        onClose={() => setUpgradeReason(null)}
        onStartQrisPayment={handleStartQrisPayment}
      />

      <QrisCheckoutModal
        order={activeQrisOrder}
        onClose={() => setActiveQrisOrder(null)}
        onConfirmPaid={handleConfirmQrisPayment}
        onCancelOrder={handleCancelQrisOrder}
      />

      <CardQrModal card={qrCard} onClose={() => setQrCard(null)} />
    </div>
  );
}
