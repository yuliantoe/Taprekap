import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import type {
  BillingCycle,
  CardIssuer,
  EMoneyCard,
  EMoneyTransaction,
  PlanTier,
  QrisPaymentOrder,
  ReimburseBatch,
  SubscriptionState,
  TransactionCategory,
  TransactionType,
  WorkspaceData,
  WorkspaceProfile,
} from './src/types.ts';
import { buildDynamicQrisPayload, PREMIUM_PRICING } from './src/lib/qris.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'taprekap-db.json');
const PORT = Number(process.env.PORT || 3000);

interface DatabaseStore {
  workspaces: Record<string, WorkspaceData>;
}

const sseClients = new Map<string, Set<Response>>();

function normalizeWorkspaceCode(raw?: string | string[] | null): string {
  const val = Array.isArray(raw) ? raw[0] : raw;
  const cleaned = (val || 'KANTOR-ID-01')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
  return cleaned || 'KANTOR-ID-01';
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
  const head = digits.slice(0, 4);
  const tail = digits.slice(-4);
  return `${head} •••• •••• ${tail}`;
}

function inferIssuerFromCardNumber(digits: string): CardIssuer {
  if (digits.startsWith('6032')) return 'mandiri';
  if (digits.startsWith('0148') || digits.startsWith('5200')) return 'bca';
  if (digits.startsWith('6013')) return 'bri';
  if (digits.startsWith('7546')) return 'bni';
  if (digits.startsWith('8801')) return 'kmt';
  return 'mandiri';
}

function createSeedWorkspace(code: string): WorkspaceData {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysAgo = (d: number, hour = 9) => {
    const dt = new Date(now.getTime() - d * 24 * 3600 * 1000);
    dt.setHours(hour, 15, 0, 0);
    return dt.toISOString();
  };

  // Seed starts on Paket Gratis (tanpa login) with 2 saved cards and 6+ transactions on card 1
  // so Free plan limits (max 2 cards, 5 latest transactions per card) and Premium unlock are immediately testable.
  const cards: EMoneyCard[] = [
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
  ];

  const transactions: EMoneyTransaction[] = [
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
  ];

  const batches: ReimburseBatch[] = [
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
  ];

  const profile: WorkspaceProfile = {
    workspaceCode: code,
    employeeName: 'Raka Pratama',
    employeeId: 'EMP-20419',
    department: 'Operasional & Implementasi',
    companyName: 'PT Nusantara Solusi Digital',
    approverName: 'Dewi Anggraini (Finance Manager)',
  };

  const subscription: SubscriptionState = {
    tier: 'free',
    billingCycle: null,
    activatedAt: null,
    expiresAt: null,
  };

  return {
    profile,
    subscription,
    cards,
    transactions,
    batches,
    paymentHistory: [],
    updatedAt: now.toISOString(),
  };
}

let dbCache: DatabaseStore | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function normalizeWorkspaceData(ws: WorkspaceData): WorkspaceData {
  if (!ws.subscription) {
    ws.subscription = {
      tier: 'free',
      billingCycle: null,
      activatedAt: null,
      expiresAt: null,
    };
  }
  if (!Array.isArray(ws.paymentHistory)) {
    ws.paymentHistory = [];
  }
  for (const card of ws.cards) {
    if (!card.verificationCode) {
      card.verificationCode = createVerificationCode(card.uid);
    }
  }
  return ws;
}

async function ensureDb(): Promise<DatabaseStore> {
  if (dbCache) return dbCache;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseStore;
    for (const key of Object.keys(parsed.workspaces || {})) {
      parsed.workspaces[key] = normalizeWorkspaceData(parsed.workspaces[key]);
    }
    dbCache = parsed;
  } catch {
    dbCache = {
      workspaces: {
        'KANTOR-ID-01': createSeedWorkspace('KANTOR-ID-01'),
      },
    };
    await persistDb();
  }
  return dbCache;
}

async function persistDb(): Promise<void> {
  if (!dbCache) return;
  const payload = JSON.stringify(dbCache, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.tmp`;
    await fs.writeFile(tmpFile, payload, 'utf-8');
    await fs.rename(tmpFile, DB_FILE);
  });
  await writeQueue;
}

async function getWorkspace(code: string): Promise<WorkspaceData> {
  const db = await ensureDb();
  if (!db.workspaces[code]) {
    db.workspaces[code] = code === 'KANTOR-ID-01'
      ? createSeedWorkspace(code)
      : {
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
          updatedAt: new Date().toISOString(),
        };
    await persistDb();
  }
  return normalizeWorkspaceData(db.workspaces[code]);
}

function broadcastWorkspace(code: string, data: WorkspaceData) {
  const clients = sseClients.get(code);
  if (!clients || clients.size === 0) return;
  const serialized = `event: sync\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(serialized);
    } catch {
      clients.delete(res);
    }
  }
}

function getCodeFromReq(req: Request): string {
  return normalizeWorkspaceCode(
    (req.headers['x-workspace-code'] as string | undefined) ||
      (req.query.workspace as string | undefined),
  );
}

async function startServer() {
  await ensureDb();
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/stream', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!sseClients.has(code)) {
      sseClients.set(code, new Set());
    }
    sseClients.get(code)!.add(res);

    const ws = await getWorkspace(code);
    res.write(`event: sync\ndata: ${JSON.stringify(ws)}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.get(code)?.delete(res);
    });
  });

  app.get('/api/workspace', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    res.json(ws);
  });

  app.put('/api/workspace/subscription', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as {
      tier: PlanTier;
      billingCycle?: BillingCycle | null;
    };

    const now = new Date();
    const tier: PlanTier = body.tier === 'premium' ? 'premium' : 'free';
    if (tier === 'free') {
      ws.subscription = {
        tier: 'free',
        billingCycle: null,
        activatedAt: null,
        expiresAt: null,
      };
    } else {
      const cycle: BillingCycle =
        body.billingCycle === 'weekly' || body.billingCycle === 'yearly'
          ? body.billingCycle
          : 'monthly';
      const durationDays = cycle === 'weekly' ? 7 : cycle === 'yearly' ? 365 : 30;
      const expiresAt = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);
      ws.subscription = {
        tier: 'premium',
        billingCycle: cycle,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    }

    ws.updatedAt = now.toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json(ws);
  });

  app.post('/api/payments/qris', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as { billingCycle?: BillingCycle };
    const cycle: BillingCycle =
      body.billingCycle === 'weekly' || body.billingCycle === 'yearly'
        ? body.billingCycle
        : 'monthly';

    const pricing = PREMIUM_PRICING[cycle];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderCode = `QRIS-${now.toISOString().slice(2, 7).replace('-', '')}-${randSuffix}`;
    const qrisPayload = buildDynamicQrisPayload({
      amount: pricing.amount,
      orderCode,
    });

    const order: QrisPaymentOrder = {
      id: createId('qris'),
      orderCode,
      billingCycle: cycle,
      amount: pricing.amount,
      qrisPayload,
      merchantName: 'TAPREKAP INDONESIA',
      nmid: 'ID1026009841201',
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      paidAt: null,
    };

    ws.paymentHistory.unshift(order);
    ws.updatedAt = now.toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.status(201).json({ order, workspace: ws });
  });

  app.post('/api/payments/qris/:id/confirm', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const order = ws.paymentHistory.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Tagihan QRIS tidak ditemukan' });
      return;
    }

    const now = new Date();
    order.status = 'paid';
    order.paidAt = now.toISOString();

    const durationDays =
      order.billingCycle === 'weekly' ? 7 : order.billingCycle === 'yearly' ? 365 : 30;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 3600 * 1000);
    ws.subscription = {
      tier: 'premium',
      billingCycle: order.billingCycle,
      activatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    ws.updatedAt = now.toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ order, workspace: ws });
  });

  app.delete('/api/payments/qris/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const order = ws.paymentHistory.find((o) => o.id === req.params.id);
    if (order && order.status === 'pending') {
      order.status = 'expired';
      ws.updatedAt = new Date().toISOString();
      await persistDb();
      broadcastWorkspace(code, ws);
    }
    res.json({ workspace: ws });
  });

  app.put('/api/workspace/profile', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as Partial<WorkspaceProfile>;
    ws.profile = {
      ...ws.profile,
      employeeName: String(body.employeeName ?? ws.profile.employeeName).slice(0, 80),
      employeeId: String(body.employeeId ?? ws.profile.employeeId).slice(0, 40),
      department: String(body.department ?? ws.profile.department).slice(0, 80),
      companyName: String(body.companyName ?? ws.profile.companyName).slice(0, 100),
      approverName: String(body.approverName ?? ws.profile.approverName).slice(0, 80),
      workspaceCode: code,
    };
    ws.updatedAt = new Date().toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json(ws);
  });

  app.post('/api/cards', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as {
      uid?: string;
      cardNumberFull?: string;
      issuer?: CardIssuer;
      cardNumberMasked?: string;
      label?: string;
      holderName?: string;
      balance?: number;
      readSource?: 'web_nfc' | 'manual_sync' | 'simulasi' | 'card_number';
    };

    const cleanDigits = String(body.cardNumberFull || '').replace(/\D/g, '');
    if (body.readSource === 'card_number' && ws.subscription.tier !== 'premium') {
      res.status(403).json({
        error: 'Fitur tambah kartu lewat nomor kartu tersedia di Paket Premium.',
        code: 'PLAN_PREMIUM_REQUIRED',
      });
      return;
    }

    if (body.readSource === 'card_number' && cleanDigits.length < 12) {
      res.status(400).json({ error: 'Masukkan minimal 12–16 digit nomor kartu e-Money.' });
      return;
    }

    const normalizedUid =
      String(body.uid || '')
        .trim()
        .toUpperCase()
        .slice(0, 48) ||
      `CARD-${cleanDigits.slice(-8)}`;

    const now = new Date().toISOString();
    const existing = ws.cards.find(
      (c) =>
        c.uid.toUpperCase() === normalizedUid ||
        (cleanDigits.length >= 12 && c.cardNumberFull === cleanDigits),
    );

    if (existing) {
      existing.lastTappedAt = now;
      if (typeof body.balance === 'number' && !Number.isNaN(body.balance)) {
        existing.balance = Math.max(0, Math.round(body.balance));
      }
      if (body.label) existing.label = String(body.label).slice(0, 60);
      if (body.holderName) existing.holderName = String(body.holderName).slice(0, 60);
      if (body.issuer) existing.issuer = body.issuer;
      if (body.readSource) existing.readSource = body.readSource;
      if (cleanDigits.length >= 12) {
        existing.cardNumberFull = cleanDigits;
        existing.cardNumberMasked = maskCardNumber(cleanDigits);
      }
      ws.updatedAt = now;
      await persistDb();
      broadcastWorkspace(code, ws);
      res.json({ card: existing, created: false, workspace: ws });
      return;
    }

    // Free Tier Limit: max 2 saved cards
    if (ws.subscription.tier === 'free' && ws.cards.length >= 2) {
      res.status(403).json({
        error:
          'Paket Gratis maksimal menyimpan 2 kartu. Upgrade ke Paket Premium (mulai 5K/minggu) untuk menyimpan semua kartu.',
        code: 'PLAN_LIMIT_CARDS',
      });
      return;
    }

    const inferredIssuer =
      body.issuer || (cleanDigits ? inferIssuerFromCardNumber(cleanDigits) : 'mandiri');

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
      cardNumberMasked:
        body.cardNumberMasked ||
        (cleanDigits
          ? maskCardNumber(cleanDigits)
          : `${prefixMap[inferredIssuer]} •••• •••• ${tail}`),
      cardNumberFull: cleanDigits || undefined,
      verificationCode: createVerificationCode(normalizedUid),
      label: String(body.label || 'Kartu e-Money Baru').slice(0, 60),
      holderName: String(body.holderName || ws.profile.employeeName).slice(0, 60),
      balance: Math.max(0, Math.round(Number(body.balance) || 0)),
      lastTappedAt: now,
      readSource: body.readSource || 'web_nfc',
      createdAt: now,
    };

    ws.cards.unshift(card);
    ws.updatedAt = now;
    await persistDb();
    broadcastWorkspace(code, ws);
    res.status(201).json({ card, created: true, workspace: ws });
  });

  app.patch('/api/cards/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const card = ws.cards.find((c) => c.id === req.params.id);
    if (!card) {
      res.status(404).json({ error: 'Kartu tidak ditemukan' });
      return;
    }

    const body = req.body as Partial<EMoneyCard>;
    if (body.label !== undefined) card.label = String(body.label).slice(0, 60);
    if (body.holderName !== undefined) card.holderName = String(body.holderName).slice(0, 60);
    if (body.issuer !== undefined) card.issuer = body.issuer;
    if (body.balance !== undefined && !Number.isNaN(Number(body.balance))) {
      card.balance = Math.max(0, Math.round(Number(body.balance)));
    }
    card.lastTappedAt = new Date().toISOString();
    ws.updatedAt = card.lastTappedAt;
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ card, workspace: ws });
  });

  app.delete('/api/cards/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    ws.cards = ws.cards.filter((c) => c.id !== req.params.id);
    ws.updatedAt = new Date().toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ workspace: ws });
  });

  app.post('/api/transactions', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as {
      cardId: string;
      type: TransactionType;
      category: TransactionCategory;
      merchant: string;
      location?: string;
      amount: number;
      timestamp?: string;
      notes?: string;
      overrideBalanceAfter?: number;
      receiptImage?: string;
      activityPhoto?: string;
      activityCaption?: string;
    };

    const card = ws.cards.find((c) => c.id === body.cardId);
    if (!card) {
      res.status(404).json({ error: 'Kartu tidak ditemukan' });
      return;
    }

    if ((body.receiptImage || body.activityPhoto) && ws.subscription.tier !== 'premium') {
      res.status(403).json({
        error: 'Lampiran struk resmi operator dan foto kegiatan tersedia di Paket Premium.',
        code: 'PLAN_PREMIUM_REQUIRED',
      });
      return;
    }

    const amount = Math.max(0, Math.round(Number(body.amount) || 0));
    if (amount <= 0) {
      res.status(400).json({ error: 'Nominal transaksi harus lebih dari Rp 0' });
      return;
    }

    const txType: TransactionType = body.type === 'topup' ? 'topup' : 'debit';
    const nextBalance =
      typeof body.overrideBalanceAfter === 'number' && !Number.isNaN(body.overrideBalanceAfter)
        ? Math.max(0, Math.round(body.overrideBalanceAfter))
        : txType === 'topup'
          ? card.balance + amount
          : Math.max(0, card.balance - amount);

    const now = body.timestamp || new Date().toISOString();
    card.balance = nextBalance;
    card.lastTappedAt = now;

    const tx: EMoneyTransaction = {
      id: createId('tx'),
      cardId: card.id,
      cardUid: card.uid,
      issuer: card.issuer,
      cardLabel: card.label,
      type: txType,
      category: body.category || (txType === 'topup' ? 'topup' : 'tol'),
      merchant: String(body.merchant || 'Transaksi e-Money').slice(0, 90),
      location: String(body.location || 'Indonesia').slice(0, 60),
      amount,
      balanceAfter: nextBalance,
      timestamp: now,
      reimburseStatus: 'unclaimed',
      notes: body.notes ? String(body.notes).slice(0, 180) : undefined,
      receiptImage: body.receiptImage ? String(body.receiptImage).slice(0, 1_500_000) : undefined,
      activityPhoto: body.activityPhoto ? String(body.activityPhoto).slice(0, 1_500_000) : undefined,
      activityCaption: body.activityCaption ? String(body.activityCaption).slice(0, 140) : undefined,
    };

    ws.transactions.unshift(tx);
    ws.updatedAt = new Date().toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.status(201).json({ transaction: tx, workspace: ws });
  });

  app.patch('/api/transactions/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const tx = ws.transactions.find((t) => t.id === req.params.id);
    if (!tx) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan' });
      return;
    }
    const body = req.body as Partial<EMoneyTransaction>;
    if ((body.receiptImage || body.activityPhoto) && ws.subscription.tier !== 'premium') {
      res.status(403).json({
        error: 'Lampiran struk resmi operator dan foto kegiatan tersedia di Paket Premium.',
        code: 'PLAN_PREMIUM_REQUIRED',
      });
      return;
    }
    if (body.merchant !== undefined) tx.merchant = String(body.merchant).slice(0, 90);
    if (body.location !== undefined) tx.location = String(body.location).slice(0, 60);
    if (body.category !== undefined) tx.category = body.category;
    if (body.notes !== undefined) tx.notes = String(body.notes).slice(0, 180);
    if (body.reimburseStatus !== undefined) tx.reimburseStatus = body.reimburseStatus;
    if (body.receiptImage !== undefined) tx.receiptImage = body.receiptImage;
    if (body.activityPhoto !== undefined) tx.activityPhoto = body.activityPhoto;
    if (body.activityCaption !== undefined) {
      tx.activityCaption = String(body.activityCaption).slice(0, 140);
    }
    ws.updatedAt = new Date().toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ transaction: tx, workspace: ws });
  });

  app.delete('/api/transactions/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const txId = req.params.id;
    ws.transactions = ws.transactions.filter((t) => t.id !== txId);
    for (const batch of ws.batches) {
      if (batch.transactionIds.includes(txId)) {
        batch.transactionIds = batch.transactionIds.filter((id) => id !== txId);
        batch.totalAmount = ws.transactions
          .filter((t) => batch.transactionIds.includes(t.id))
          .reduce((acc, t) => acc + t.amount, 0);
      }
    }
    ws.updatedAt = new Date().toISOString();
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ workspace: ws });
  });

  app.post('/api/batches', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const body = req.body as {
      title: string;
      employeeName?: string;
      employeeId?: string;
      department?: string;
      companyName?: string;
      approverName?: string;
      notes?: string;
      transactionIds: string[];
      status?: 'draft' | 'submitted' | 'approved';
    };

    const validTxIds = Array.isArray(body.transactionIds)
      ? body.transactionIds.filter((id) => ws.transactions.some((t) => t.id === id))
      : [];

    if (validTxIds.length === 0) {
      res.status(400).json({ error: 'Pilih minimal 1 transaksi untuk direkap' });
      return;
    }

    const selectedTxs = ws.transactions.filter((t) => validTxIds.includes(t.id));
    const timestamps = selectedTxs.map((t) => t.timestamp).sort();
    const totalAmount = selectedTxs.reduce((sum, t) => sum + t.amount, 0);
    const now = new Date().toISOString();
    const batchStatus = body.status || 'draft';
    const seq = String(ws.batches.length + 1).padStart(3, '0');
    const yearMonth = now.slice(0, 7);

    const batch: ReimburseBatch = {
      id: createId('batch'),
      reportNumber: `RMB-${yearMonth}-${seq}`,
      title: String(body.title || 'Laporan Reimburse e-Money').slice(0, 100),
      employeeName: String(body.employeeName || ws.profile.employeeName).slice(0, 80),
      employeeId: String(body.employeeId || ws.profile.employeeId).slice(0, 40),
      department: String(body.department || ws.profile.department).slice(0, 80),
      companyName: String(body.companyName || ws.profile.companyName).slice(0, 100),
      approverName: String(body.approverName || ws.profile.approverName).slice(0, 80),
      periodStart: (timestamps[0] || now).slice(0, 10),
      periodEnd: (timestamps[timestamps.length - 1] || now).slice(0, 10),
      notes: String(body.notes || '').slice(0, 240),
      status: batchStatus,
      transactionIds: validTxIds,
      totalAmount,
      createdAt: now,
      updatedAt: now,
    };

    for (const tx of selectedTxs) {
      tx.reimburseStatus = batchStatus === 'approved' ? 'approved' : batchStatus === 'submitted' ? 'submitted' : 'in_batch';
      tx.reimburseBatchId = batch.id;
    }

    ws.batches.unshift(batch);
    ws.updatedAt = now;
    await persistDb();
    broadcastWorkspace(code, ws);
    res.status(201).json({ batch, workspace: ws });
  });

  app.patch('/api/batches/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const batch = ws.batches.find((b) => b.id === req.params.id);
    if (!batch) {
      res.status(404).json({ error: 'Rekap reimburse tidak ditemukan' });
      return;
    }

    const body = req.body as Partial<ReimburseBatch>;
    if (body.title !== undefined) batch.title = String(body.title).slice(0, 100);
    if (body.notes !== undefined) batch.notes = String(body.notes).slice(0, 240);
    if (body.status !== undefined) {
      batch.status = body.status;
      for (const tx of ws.transactions) {
        if (batch.transactionIds.includes(tx.id)) {
          tx.reimburseStatus =
            body.status === 'approved'
              ? 'approved'
              : body.status === 'submitted'
                ? 'submitted'
                : 'in_batch';
        }
      }
    }
    batch.updatedAt = new Date().toISOString();
    ws.updatedAt = batch.updatedAt;
    await persistDb();
    broadcastWorkspace(code, ws);
    res.json({ batch, workspace: ws });
  });

  app.delete('/api/batches/:id', async (req: Request, res: Response) => {
    const code = getCodeFromReq(req);
    const ws = await getWorkspace(code);
    const batch = ws.batches.find((b) => b.id === req.params.id);
    if (batch) {
      for (const tx of ws.transactions) {
        if (batch.transactionIds.includes(tx.id)) {
          tx.reimburseStatus = 'unclaimed';
          tx.reimburseBatchId = null;
        }
      }
      ws.batches = ws.batches.filter((b) => b.id !== req.params.id);
      ws.updatedAt = new Date().toISOString();
      await persistDb();
      broadcastWorkspace(code, ws);
    }
    res.json({ workspace: ws });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TapRekap server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
