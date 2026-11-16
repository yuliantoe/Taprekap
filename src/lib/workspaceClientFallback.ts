import type {
  BillingCycle,
  CardIssuer,
  EMoneyCard,
  EMoneyTransaction,
  PlanTier,
  QrisPaymentOrder,
  ReimburseBatch,
  TransactionCategory,
  TransactionType,
  WorkspaceData,
  WorkspaceProfile,
} from '../types';
import { buildDynamicQrisPayload, PREMIUM_PRICING } from './qris';

const MIRROR_PREFIX = 'taprekap_ws_mirror_v1_';

export function readWorkspaceMirror(code: string): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(`${MIRROR_PREFIX}${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceData;
    if (!parsed || !parsed.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWorkspaceMirror(code: string, data: WorkspaceData): void {
  try {
    localStorage.setItem(`${MIRROR_PREFIX}${code}`, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function createVerificationCode(uid: string): string {
  const clean = uid.replace(/[^A-F0-9]/gi, '').slice(-6).toUpperCase() || 'A1B2C3';
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TRK-${clean}-${rand}`;
}

function maskCardNumber(full: string): string {
  const digits = full.replace(/\D/g, '');
  if (digits.length < 8) return full;
  return `${digits.slice(0, 4)} •••• •••• ${digits.slice(-4)}`;
}

function inferIssuerFromCardNumber(digits: string): CardIssuer {
  if (digits.startsWith('6032')) return 'mandiri';
  if (digits.startsWith('0148') || digits.startsWith('5200')) return 'bca';
  if (digits.startsWith('6013')) return 'bri';
  if (digits.startsWith('7546')) return 'bni';
  if (digits.startsWith('8801')) return 'kmt';
  return 'mandiri';
}

export function createClientSeedWorkspace(code: string): WorkspaceData {
  const existing = readWorkspaceMirror(code);
  if (existing) return existing;

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysAgo = (d: number, hour = 9) => {
    const dt = new Date(now.getTime() - d * 24 * 3600 * 1000);
    dt.setHours(hour, 15, 0, 0);
    return dt.toISOString();
  };

  if (code !== 'KANTOR-ID-01') {
    const emptyWs: WorkspaceData = {
      profile: {
        workspaceCode: code,
        employeeName: 'Pengguna Gratis',
        employeeId: 'EMP-001',
        department: 'Operasional',
        companyName: 'Nama Perusahaan Anda',
        approverName: 'Manajer Finance',
      },
      subscription: {
        tier: 'free',
        billingCycle: null,
        activatedAt: null,
        expiresAt: null,
      },
      cards: [],
      transactions: [],
      batches: [],
      paymentHistory: [],
      updatedAt: now.toISOString(),
    };
    writeWorkspaceMirror(code, emptyWs);
    return emptyWs;
  }

  const seeded: WorkspaceData = {
    profile: {
      workspaceCode: code,
      employeeName: 'Raka Pratama',
      employeeId: 'EMP-20419',
      department: 'Operasional & Implementasi',
      companyName: 'PT Nusantara Solusi Digital',
      approverName: 'Dewi Anggraini (Finance Manager)',
    },
    subscription: {
      tier: 'free',
      billingCycle: null,
      activatedAt: null,
      expiresAt: null,
    },
    cards: [
      {
        id: 'card_mandiri_01',
        uid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardNumberMasked: '6032 •••• •••• 4819',
        cardNumberFull: '6032981044124819',
        verificationCode: 'TRK-4C5280-9A1F',
        label: 'e-Money Operasional Utama',
        holderName: 'Raka Pratama',
        balance: 284500,
        lastTappedAt: hoursAgo(2),
        readSource: 'web_nfc',
        createdAt: daysAgo(14),
      },
      {
        id: 'card_bca_02',
        uid: '04:5D:12:CA:91:3A:81',
        issuer: 'bca',
        cardNumberMasked: '0148 •••• •••• 9023',
        cardNumberFull: '0148112099349023',
        verificationCode: 'TRK-913A81-4E2B',
        label: 'Flazz Kunjungan Klien',
        holderName: 'Raka Pratama',
        balance: 142000,
        lastTappedAt: daysAgo(1, 17),
        readSource: 'web_nfc',
        createdAt: daysAgo(21),
      },
    ],
    transactions: [
      {
        id: 'tx_01',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'debit',
        category: 'tol',
        merchant: 'Gerbang Tol Pasteur (Jasa Marga)',
        location: 'Bandung, Jawa Barat',
        amount: 112000,
        balanceAfter: 284500,
        timestamp: hoursAgo(2),
        reimburseStatus: 'unclaimed',
        notes: 'Perjalanan dinas audit vendor Bandung',
        activityCaption: 'Kunjungan lokasi gudang vendor Pasteur',
      },
      {
        id: 'tx_02',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'debit',
        category: 'parkir',
        merchant: 'Secure Parking Menara Sudirman',
        location: 'Jakarta Selatan',
        amount: 25000,
        balanceAfter: 396500,
        timestamp: daysAgo(1, 15),
        reimburseStatus: 'unclaimed',
        notes: 'Parkir meeting klien Q4',
      },
      {
        id: 'tx_03',
        cardId: 'card_bca_02',
        cardUid: '04:5D:12:CA:91:3A:81',
        issuer: 'bca',
        cardLabel: 'Flazz Kunjungan Klien',
        type: 'debit',
        category: 'tol',
        merchant: 'Gerbang Tol Cikarang Utama',
        location: 'Bekasi, Jawa Barat',
        amount: 27000,
        balanceAfter: 142000,
        timestamp: daysAgo(1, 17),
        reimburseStatus: 'unclaimed',
        notes: 'Kunjungan pabrik kawasan Jababeka',
      },
      {
        id: 'tx_04',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'debit',
        category: 'bbm',
        merchant: 'SPBU Pertamina 31.12902 Gatot Subroto',
        location: 'Jakarta Selatan',
        amount: 150000,
        balanceAfter: 421500,
        timestamp: daysAgo(2, 11),
        reimburseStatus: 'unclaimed',
        notes: 'Pengisian BBM kendaraan operasional',
      },
      {
        id: 'tx_05',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'debit',
        category: 'tol',
        merchant: 'Gerbang Tol Karawang Barat',
        location: 'Karawang, Jawa Barat',
        amount: 46500,
        balanceAfter: 571500,
        timestamp: daysAgo(3, 14),
        reimburseStatus: 'in_batch',
        reimburseBatchId: 'batch_01',
        notes: 'Survey cabang regional Jawa Barat',
      },
      {
        id: 'tx_06',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'topup',
        category: 'topup',
        merchant: 'Top Up via Livin Mandiri NFC',
        location: 'Mobile Banking',
        amount: 500000,
        balanceAfter: 618000,
        timestamp: daysAgo(4, 10),
        reimburseStatus: 'unclaimed',
        notes: 'Pengisian saldo operasional bulanan',
      },
      {
        id: 'tx_07',
        cardId: 'card_bca_02',
        cardUid: '04:5D:12:CA:91:3A:81',
        issuer: 'bca',
        cardLabel: 'Flazz Kunjungan Klien',
        type: 'debit',
        category: 'parkir',
        merchant: 'Centrepark Grand Indonesia',
        location: 'Jakarta Pusat',
        amount: 32000,
        balanceAfter: 169000,
        timestamp: daysAgo(4, 18),
        reimburseStatus: 'in_batch',
        reimburseBatchId: 'batch_01',
        notes: 'Presentasi proposal dengan partner',
      },
      {
        id: 'tx_08',
        cardId: 'card_mandiri_01',
        cardUid: '04:A2:8F:19:4C:52:80',
        issuer: 'mandiri',
        cardLabel: 'e-Money Operasional Utama',
        type: 'debit',
        category: 'tol',
        merchant: 'Gerbang Tol Cikampek Utama',
        location: 'Cikampek, Jawa Barat',
        amount: 38000,
        balanceAfter: 118000,
        timestamp: daysAgo(6, 9),
        reimburseStatus: 'unclaimed',
        notes: 'Perjalanan dinas pekan lalu (arsip >5 transaksi)',
      },
    ],
    batches: [
      {
        id: 'batch_01',
        reportNumber: 'RMB-2026-11-001',
        title: 'Reimburse Perjalanan Dinas & Parkir Pekan 1',
        employeeName: 'Raka Pratama',
        employeeId: 'EMP-20419',
        department: 'Operasional & Implementasi',
        companyName: 'PT Nusantara Solusi Digital',
        approverName: 'Dewi Anggraini (Finance Manager)',
        periodStart: daysAgo(7).slice(0, 10),
        periodEnd: daysAgo(0).slice(0, 10),
        notes: 'Pengajuan biaya tol dan parkir kunjungan cabang serta mitra.',
        status: 'submitted',
        transactionIds: ['tx_05', 'tx_07'],
        totalAmount: 78500,
        createdAt: daysAgo(2, 16),
        updatedAt: daysAgo(2, 16),
      },
    ],
    paymentHistory: [],
    updatedAt: now.toISOString(),
  };

  writeWorkspaceMirror(code, seeded);
  return seeded;
}

export function localSelectPlan(
  ws: WorkspaceData,
  tier: PlanTier,
  billingCycle?: BillingCycle,
): WorkspaceData {
  const now = new Date();
  const next: WorkspaceData = structuredClone(ws);
  if (tier === 'free') {
    next.subscription = {
      tier: 'free',
      billingCycle: null,
      activatedAt: null,
      expiresAt: null,
    };
  } else {
    const cycle: BillingCycle =
      billingCycle === 'weekly' || billingCycle === 'yearly' ? billingCycle : 'monthly';
    const days = cycle === 'weekly' ? 7 : cycle === 'yearly' ? 365 : 30;
    next.subscription = {
      tier: 'premium',
      billingCycle: cycle,
      activatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString(),
    };
  }
  next.updatedAt = now.toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localStartQris(
  ws: WorkspaceData,
  billingCycle: BillingCycle,
): { order: QrisPaymentOrder; workspace: WorkspaceData } {
  const next: WorkspaceData = structuredClone(ws);
  const pricing = PREMIUM_PRICING[billingCycle];
  const now = new Date();
  const orderCode = `QRIS-${now.toISOString().slice(2, 7).replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const order: QrisPaymentOrder = {
    id: createId('qris'),
    orderCode,
    billingCycle,
    amount: pricing.amount,
    qrisPayload: buildDynamicQrisPayload({ amount: pricing.amount, orderCode }),
    merchantName: 'TAPREKAP INDONESIA',
    nmid: 'ID1026009841201',
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    paidAt: null,
  };
  next.paymentHistory.unshift(order);
  next.updatedAt = now.toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return { order, workspace: next };
}

export function localConfirmQris(
  ws: WorkspaceData,
  orderId: string,
): { order: QrisPaymentOrder; workspace: WorkspaceData } {
  const next: WorkspaceData = structuredClone(ws);
  const order = next.paymentHistory.find((o) => o.id === orderId);
  if (!order) {
    throw new Error('Tagihan QRIS tidak ditemukan');
  }
  const now = new Date();
  order.status = 'paid';
  order.paidAt = now.toISOString();
  const days = order.billingCycle === 'weekly' ? 7 : order.billingCycle === 'yearly' ? 365 : 30;
  next.subscription = {
    tier: 'premium',
    billingCycle: order.billingCycle,
    activatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString(),
  };
  next.updatedAt = now.toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return { order, workspace: next };
}

export function localCancelQris(ws: WorkspaceData, orderId: string): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  const order = next.paymentHistory.find((o) => o.id === orderId);
  if (order && order.status === 'pending') {
    order.status = 'expired';
    next.updatedAt = new Date().toISOString();
    writeWorkspaceMirror(next.profile.workspaceCode, next);
  }
  return next;
}

export function localSaveProfile(
  ws: WorkspaceData,
  profile: Partial<WorkspaceProfile>,
): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  next.profile = {
    ...next.profile,
    ...profile,
    workspaceCode: next.profile.workspaceCode,
  };
  next.updatedAt = new Date().toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localSaveCard(
  ws: WorkspaceData,
  payload: {
    uid?: string;
    cardNumberFull?: string;
    issuer: CardIssuer;
    label: string;
    balance: number;
    readSource: 'web_nfc' | 'manual_sync' | 'simulasi' | 'card_number';
  },
): { card: EMoneyCard; workspace: WorkspaceData } {
  const next: WorkspaceData = structuredClone(ws);
  const cleanDigits = String(payload.cardNumberFull || '').replace(/\D/g, '');
  if (payload.readSource === 'card_number' && next.subscription.tier !== 'premium') {
    throw new Error('Fitur tambah kartu lewat nomor kartu tersedia di Paket Premium.');
  }
  if (payload.readSource === 'card_number' && cleanDigits.length < 12) {
    throw new Error('Masukkan minimal 12–16 digit nomor kartu e-Money.');
  }

  const normalizedUid =
    String(payload.uid || '').trim().toUpperCase().slice(0, 48) ||
    `CARD-${cleanDigits.slice(-8)}`;
  const now = new Date().toISOString();

  const existing = next.cards.find(
    (c) =>
      c.uid.toUpperCase() === normalizedUid ||
      (cleanDigits.length >= 12 && c.cardNumberFull === cleanDigits),
  );
  if (existing) {
    existing.lastTappedAt = now;
    existing.balance = Math.max(0, Math.round(payload.balance));
    if (payload.label) existing.label = payload.label.slice(0, 60);
    if (payload.issuer) existing.issuer = payload.issuer;
    existing.readSource = payload.readSource;
    if (cleanDigits.length >= 12) {
      existing.cardNumberFull = cleanDigits;
      existing.cardNumberMasked = maskCardNumber(cleanDigits);
    }
    next.updatedAt = now;
    writeWorkspaceMirror(next.profile.workspaceCode, next);
    return { card: existing, workspace: next };
  }

  if (next.subscription.tier === 'free' && next.cards.length >= 2) {
    throw new Error(
      'Paket Gratis maksimal menyimpan 2 kartu. Upgrade ke Paket Premium (mulai 5K/minggu) untuk menyimpan semua kartu.',
    );
  }

  const inferredIssuer =
    payload.issuer || (cleanDigits ? inferIssuerFromCardNumber(cleanDigits) : 'mandiri');
  const prefixMap: Record<CardIssuer, string> = {
    mandiri: '6032',
    bca: '0148',
    bri: '6013',
    bni: '7546',
    kmt: '8801',
  };
  const tail = cleanDigits
    ? cleanDigits.slice(-4)
    : normalizedUid.replace(/[^A-F0-9]/g, '').slice(-4) || '1001';

  const card: EMoneyCard = {
    id: createId('card'),
    uid: normalizedUid,
    issuer: inferredIssuer,
    cardNumberMasked: cleanDigits
      ? maskCardNumber(cleanDigits)
      : `${prefixMap[inferredIssuer]} •••• •••• ${tail}`,
    cardNumberFull: cleanDigits || undefined,
    verificationCode: createVerificationCode(normalizedUid),
    label: String(payload.label || 'Kartu e-Money Baru').slice(0, 60),
    holderName: next.profile.employeeName,
    balance: Math.max(0, Math.round(payload.balance || 0)),
    lastTappedAt: now,
    readSource: payload.readSource || 'web_nfc',
    createdAt: now,
  };
  next.cards.unshift(card);
  next.updatedAt = now;
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return { card, workspace: next };
}

export function localUpdateCard(
  ws: WorkspaceData,
  id: string,
  payload: Partial<EMoneyCard>,
): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  const card = next.cards.find((c) => c.id === id);
  if (!card) throw new Error('Kartu tidak ditemukan');
  Object.assign(card, payload, { lastTappedAt: new Date().toISOString() });
  next.updatedAt = card.lastTappedAt;
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localDeleteCard(ws: WorkspaceData, id: string): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  next.cards = next.cards.filter((c) => c.id !== id);
  next.updatedAt = new Date().toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localRecordTransaction(
  ws: WorkspaceData,
  payload: {
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
  },
): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  const card = next.cards.find((c) => c.id === payload.cardId);
  if (!card) throw new Error('Kartu tidak ditemukan');
  if ((payload.receiptImage || payload.activityPhoto) && next.subscription.tier !== 'premium') {
    throw new Error('Lampiran struk resmi operator dan foto kegiatan tersedia di Paket Premium.');
  }
  const amount = Math.max(0, Math.round(Number(payload.amount) || 0));
  if (amount <= 0) throw new Error('Nominal transaksi harus lebih dari Rp 0');
  const nextBalance =
    typeof payload.overrideBalanceAfter === 'number' && !Number.isNaN(payload.overrideBalanceAfter)
      ? Math.max(0, Math.round(payload.overrideBalanceAfter))
      : payload.type === 'topup'
        ? card.balance + amount
        : Math.max(0, card.balance - amount);
  const now = new Date().toISOString();
  card.balance = nextBalance;
  card.lastTappedAt = now;
  const tx: EMoneyTransaction = {
    id: createId('tx'),
    cardId: card.id,
    cardUid: card.uid,
    issuer: card.issuer,
    cardLabel: card.label,
    type: payload.type,
    category: payload.category,
    merchant: payload.merchant,
    location: payload.location,
    amount,
    balanceAfter: nextBalance,
    timestamp: now,
    reimburseStatus: 'unclaimed',
    notes: payload.notes,
    receiptImage: payload.receiptImage,
    activityPhoto: payload.activityPhoto,
    activityCaption: payload.activityCaption,
  };
  next.transactions.unshift(tx);
  next.updatedAt = now;
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localDeleteTx(ws: WorkspaceData, txId: string): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  next.transactions = next.transactions.filter((t) => t.id !== txId);
  for (const batch of next.batches) {
    if (batch.transactionIds.includes(txId)) {
      batch.transactionIds = batch.transactionIds.filter((id) => id !== txId);
      batch.totalAmount = next.transactions
        .filter((t) => batch.transactionIds.includes(t.id))
        .reduce((acc, t) => acc + t.amount, 0);
    }
  }
  next.updatedAt = new Date().toISOString();
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localCreateBatch(
  ws: WorkspaceData,
  payload: {
    title: string;
    employeeName: string;
    employeeId: string;
    department: string;
    companyName: string;
    approverName: string;
    notes: string;
    transactionIds: string[];
    status: 'draft' | 'submitted';
  },
): { batch: ReimburseBatch; workspace: WorkspaceData } {
  const next: WorkspaceData = structuredClone(ws);
  const validTxIds = payload.transactionIds.filter((id) =>
    next.transactions.some((t) => t.id === id),
  );
  if (validTxIds.length === 0) {
    throw new Error('Pilih minimal 1 transaksi untuk direkap');
  }
  const selectedTxs = next.transactions.filter((t) => validTxIds.includes(t.id));
  const timestamps = selectedTxs.map((t) => t.timestamp).sort();
  const now = new Date().toISOString();
  const seq = String(next.batches.length + 1).padStart(3, '0');
  const batch: ReimburseBatch = {
    id: createId('batch'),
    reportNumber: `RMB-${now.slice(0, 7)}-${seq}`,
    title: payload.title,
    employeeName: payload.employeeName,
    employeeId: payload.employeeId,
    department: payload.department,
    companyName: payload.companyName,
    approverName: payload.approverName,
    periodStart: (timestamps[0] || now).slice(0, 10),
    periodEnd: (timestamps[timestamps.length - 1] || now).slice(0, 10),
    notes: payload.notes,
    status: payload.status,
    transactionIds: validTxIds,
    totalAmount: selectedTxs.reduce((sum, t) => sum + t.amount, 0),
    createdAt: now,
    updatedAt: now,
  };
  for (const tx of selectedTxs) {
    tx.reimburseStatus = payload.status === 'submitted' ? 'submitted' : 'in_batch';
    tx.reimburseBatchId = batch.id;
  }
  next.batches.unshift(batch);
  next.updatedAt = now;
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return { batch, workspace: next };
}

export function localUpdateBatchStatus(
  ws: WorkspaceData,
  batchId: string,
  status: 'draft' | 'submitted' | 'approved',
): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  const batch = next.batches.find((b) => b.id === batchId);
  if (!batch) throw new Error('Rekap reimburse tidak ditemukan');
  batch.status = status;
  for (const tx of next.transactions) {
    if (batch.transactionIds.includes(tx.id)) {
      tx.reimburseStatus =
        status === 'approved' ? 'approved' : status === 'submitted' ? 'submitted' : 'in_batch';
    }
  }
  batch.updatedAt = new Date().toISOString();
  next.updatedAt = batch.updatedAt;
  writeWorkspaceMirror(next.profile.workspaceCode, next);
  return next;
}

export function localDeleteBatch(ws: WorkspaceData, batchId: string): WorkspaceData {
  const next: WorkspaceData = structuredClone(ws);
  const batch = next.batches.find((b) => b.id === batchId);
  if (batch) {
    for (const tx of next.transactions) {
      if (batch.transactionIds.includes(tx.id)) {
        tx.reimburseStatus = 'unclaimed';
        tx.reimburseBatchId = null;
      }
    }
    next.batches = next.batches.filter((b) => b.id !== batchId);
    next.updatedAt = new Date().toISOString();
    writeWorkspaceMirror(next.profile.workspaceCode, next);
  }
  return next;
}
