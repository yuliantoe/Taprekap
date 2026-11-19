import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  EMoneyCard,
  EMoneyTransaction,
  FlazzAiInsight,
  FlazzAiParseResponse,
  FlazzAiStatusResponse,
  TransactionCategory,
  TransactionType,
} from '../src/types.ts';
import { FLAZZ_PROTOCOL_SPEC } from '../src/lib/flazzProtocol.ts';

const FLAZZ_AI_MODEL = 'gemini-4-hydrogen';
const FLAZZ_AI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function getConfiguredGeminiApiKey(): string | null {
  const raw = (process.env.GEMINI_API_KEY || '').trim();
  if (!raw || raw === 'MY_GEMINI_API_KEY') return null;
  return raw;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = getConfiguredGeminiApiKey();
  if (!apiKey) {
    throw new FlazzAiHttpError(
      503,
      'GEMINI_API_KEY belum dikonfigurasi di server. Atur kunci API di panel Settings > Secrets AI Studio (atau Environment Variables di Vercel).',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class FlazzAiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isTransientCapacityError(err: unknown): boolean {
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  const lower = rawMsg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  );
}

async function callGenerateContentWithRetry(
  ai: GoogleGenAI,
  params: Omit<Parameters<typeof ai.models.generateContent>[0], 'model'>,
) {
  const modelsToTry = [FLAZZ_AI_MODEL, FLAZZ_AI_MODEL, FLAZZ_AI_FALLBACK_MODEL];
  let lastErr: unknown;

  for (let i = 0; i < modelsToTry.length; i += 1) {
    const model = modelsToTry[i];
    try {
      const result = await ai.models.generateContent({
        ...params,
        model,
      });
      return { result, usedModel: model };
    } catch (err) {
      lastErr = err;
      if (!isTransientCapacityError(err) || i === modelsToTry.length - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 450 * (i + 1)));
    }
  }
  throw lastErr;
}

function mapGeminiError(err: unknown): FlazzAiHttpError {
  if (err instanceof FlazzAiHttpError) return err;
  const rawMsg = err instanceof Error ? err.message : String(err || 'Gagal memanggil Gemini AI');
  const lower = rawMsg.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return new FlazzAiHttpError(
      403,
      'Kunci GEMINI_API_KEY ditolak atau belum valid. Periksa kembali di panel Settings > Secrets.',
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return new FlazzAiHttpError(
      429,
      'Kuota Gemini AI sedang penuh (429). Coba lagi beberapa saat atau periksa kuota di Settings > Secrets.',
    );
  }
  if (isTransientCapacityError(err)) {
    return new FlazzAiHttpError(
      503,
      'Server Gemini AI sedang mengalami lonjakan permintaan sementara (503). Histori kartu Flazz Anda tetap dimuat; klik "Baca Ulang AI" beberapa saat lagi.',
    );
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return new FlazzAiHttpError(502, `Model AI ${FLAZZ_AI_MODEL} tidak ditemukan: ${rawMsg}`);
  }
  return new FlazzAiHttpError(502, `Gagal membaca histori Flazz via Gemini AI: ${rawMsg}`);
}

export function getFlazzAiStatus(): FlazzAiStatusResponse {
  return {
    configured: Boolean(getConfiguredGeminiApiKey()),
    model: FLAZZ_AI_MODEL,
    flazzProtocol: {
      aidGen1: FLAZZ_PROTOCOL_SPEC.aidGen1,
      aidGen2: FLAZZ_PROTOCOL_SPEC.aidGen2,
      standard: FLAZZ_PROTOCOL_SPEC.standard,
    },
  };
}

export async function analyzeFlazzTapHistory(params: {
  card: EMoneyCard;
  transactions: EMoneyTransaction[];
  scanUid?: string;
  scanSource?: string;
}): Promise<FlazzAiInsight> {
  const ai = createGeminiClient();
  const { card, transactions, scanUid, scanSource } = params;

  const totalDebit = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalTopup = transactions
    .filter((t) => t.type === 'topup')
    .reduce((sum, t) => sum + t.amount, 0);
  const unclaimedCount = transactions.filter(
    (t) => t.type === 'debit' && t.reimburseStatus === 'unclaimed',
  ).length;

  const prompt = [
    'Anda adalah mesin pembaca & auditor mutasi kartu BCA Flazz pada aplikasi TapRekap.',
    'Analisis data kartu BCA Flazz yang baru saja di-tap berikut ini dalam bahasa Indonesia yang ringkas, faktual, dan profesional untuk karyawan maupun Finance.',
    `Profil Protokol Chip: ${FLAZZ_PROTOCOL_SPEC.name} (${FLAZZ_PROTOCOL_SPEC.standard}), AID Gen1 ${FLAZZ_PROTOCOL_SPEC.aidGen1}, AID Gen2 ${FLAZZ_PROTOCOL_SPEC.aidGen2}.`,
    `Kartu: ${card.label} (${card.cardNumberMasked}) | UID Terbaca: ${scanUid || card.uid} | Sumber Tap: ${scanSource || card.readSource}`,
    `Saldo Terkini: Rp ${card.balance.toLocaleString('id-ID')} | Total Pengeluaran Tercatat: Rp ${totalDebit.toLocaleString('id-ID')} | Total Top Up: Rp ${totalTopup.toLocaleString('id-ID')} | Belum Direimburse: ${unclaimedCount} transaksi.`,
    'Daftar histori pemakaian terbaru:',
    transactions.length === 0
      ? '- Belum ada transaksi tercatat di sistem untuk kartu ini.'
      : transactions
          .slice(0, 15)
          .map(
            (tx, i) =>
              `${i + 1}. [${tx.timestamp}] (${tx.type}/${tx.category}) ${tx.merchant} (${tx.location}) = Rp ${tx.amount.toLocaleString('id-ID')}, saldo akhir Rp ${tx.balanceAfter.toLocaleString('id-ID')}, status=${tx.reimburseStatus}${tx.notes ? `, catatan="${tx.notes}"` : ''}`,
          )
          .join('\n'),
  ].join('\n');

  try {
    const { result: response, usedModel } = await callGenerateContentWithRetry(ai, {
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'Berikan output JSON sesuai schema tanpa markdown tambahan. Gunakan Bahasa Indonesia yang jelas, ringkas, dan akurat sesuai angka mutasi yang diberikan (jangan mengarang nominal transaksi yang tidak ada).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ringkasanInstan: {
              type: Type.STRING,
              description: 'Ringkasan 1-2 kalimat mengenai saldo dan histori pemakaian kartu Flazz saat di-tap.',
            },
            sorotanPemakaian: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 poin sorotan singkat mengenai pola pemakaian tol, parkir, transportasi, atau isi ulang.',
            },
            rekomendasiReimburse: {
              type: Type.STRING,
              description: 'Saran 1 kalimat terkait kesiapan klaim reimburse ke bagian Finance.',
            },
            protocolVerdict: {
              type: Type.STRING,
              description: 'Verifikasi singkat profil chip/AID Flazz BCA dan status sinkronisasi tap.',
            },
          },
          required: [
            'ringkasanInstan',
            'sorotanPemakaian',
            'rekomendasiReimburse',
            'protocolVerdict',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      ringkasanInstan?: string;
      sorotanPemakaian?: string[];
      rekomendasiReimburse?: string;
      protocolVerdict?: string;
    };

    return {
      ringkasanInstan:
        parsed.ringkasanInstan ||
        `Kartu ${card.label} terbaca dengan saldo Rp ${card.balance.toLocaleString('id-ID')} dan ${transactions.length} riwayat transaksi.`,
      sorotanPemakaian: Array.isArray(parsed.sorotanPemakaian)
        ? parsed.sorotanPemakaian.slice(0, 4)
        : [],
      rekomendasiReimburse:
        parsed.rekomendasiReimburse ||
        (unclaimedCount > 0
          ? `${unclaimedCount} transaksi pengeluaran siap direkap menjadi laporan PDF reimburse.`
          : 'Semua transaksi terpantau rapi.'),
      protocolVerdict:
        parsed.protocolVerdict ||
        `Sinkron UID ${scanUid || card.uid} (${FLAZZ_PROTOCOL_SPEC.aidGen1} / ${FLAZZ_PROTOCOL_SPEC.aidGen2}) aktif.`,
      totalDebit,
      totalTopup,
      analyzedAt: new Date().toISOString(),
      model: usedModel,
    };
  } catch (err) {
    throw mapGeminiError(err);
  }
}

const VALID_CATEGORIES: TransactionCategory[] = [
  'tol',
  'parkir',
  'transportasi',
  'bbm',
  'belanja',
  'topup',
  'lainnya',
];

export async function parseFlazzHistorySource(params: {
  imageBase64?: string;
  mimeType?: string;
  rawTextOrHex?: string;
  card?: EMoneyCard | null;
}): Promise<FlazzAiParseResponse> {
  const ai = createGeminiClient();
  const { imageBase64, mimeType, rawTextOrHex, card } = params;

  if (!imageBase64 && (!rawTextOrHex || !rawTextOrHex.trim())) {
    throw new FlazzAiHttpError(
      400,
      'Unggah foto struk/screenshot mutasi myBCA Flazz atau tempel teks mutasi/log APDU terlebih dahulu.',
    );
  }

  const instructionText = [
    'Ekstrak data transaksi BCA Flazz dari gambar struk / screenshot mutasi myBCA / teks mutasi / hex log APDU berikut.',
    card
      ? `Kartu tujuan: ${card.label} (${card.cardNumberMasked}), saldo tercatat saat ini Rp ${card.balance.toLocaleString('id-ID')}.`
      : 'Kartu tujuan: BCA Flazz.',
    'Kembalikan semua transaksi yang terlihat dengan nominal integer Rupiah yang akurat, kategori (tol, parkir, transportasi, bbm, belanja, topup, lainnya), tipe (debit atau topup), nama merchant/gerbang tol, dan kota/lokasi.',
    rawTextOrHex?.trim() ? `Input teks / log APDU:\n${rawTextOrHex.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const contents = imageBase64
    ? {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
            },
          },
          { text: instructionText },
        ],
      }
    : instructionText;

  try {
    const { result: response, usedModel } = await callGenerateContentWithRetry(ai, {
      contents,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'Anda adalah parser mutasi BCA Flazz berpresisi tinggi. Hanya ekstrak data yang benar-benar ada di gambar atau teks masukan. Jika saldo akhir terlihat, isi detectedBalance sebagai integer.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedBalance: {
              type: Type.INTEGER,
              description: 'Saldo terakhir kartu Flazz dalam Rupiah jika terlihat, atau -1 jika tidak ada.',
            },
            cardNumberHint: {
              type: Type.STRING,
              description: 'Nomor kartu Flazz jika terlihat, atau string kosong.',
            },
            summary: {
              type: Type.STRING,
              description: 'Ringkasan 1 kalimat hasil pembacaan AI dalam Bahasa Indonesia.',
            },
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: 'debit atau topup' },
                  category: {
                    type: Type.STRING,
                    description: 'tol, parkir, transportasi, bbm, belanja, topup, atau lainnya',
                  },
                  merchant: { type: Type.STRING, description: 'Nama merchant, gerbang tol, atau stasiun' },
                  location: { type: Type.STRING, description: 'Kota atau area transaksi' },
                  amount: { type: Type.INTEGER, description: 'Nominal transaksi dalam Rupiah (> 0)' },
                  notes: { type: Type.STRING, description: 'Keterangan singkat atau kode referensi' },
                  timestampHint: { type: Type.STRING, description: 'Tanggal/jam dari struk jika terbaca' },
                },
                required: ['type', 'category', 'merchant', 'location', 'amount'],
              },
            },
          },
          required: ['summary', 'transactions'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      detectedBalance?: number;
      cardNumberHint?: string;
      summary?: string;
      transactions?: Array<{
        type?: string;
        category?: string;
        merchant?: string;
        location?: string;
        amount?: number;
        notes?: string;
        timestampHint?: string;
      }>;
    };

    const transactions = (Array.isArray(parsed.transactions) ? parsed.transactions : [])
      .map((item) => {
        const txType: TransactionType = item.type === 'topup' ? 'topup' : 'debit';
        const rawCat = (item.category || '').toLowerCase() as TransactionCategory;
        const category: TransactionCategory = VALID_CATEGORIES.includes(rawCat)
          ? rawCat
          : txType === 'topup'
            ? 'topup'
            : 'tol';
        const amount = Math.max(0, Math.round(Number(item.amount) || 0));
        return {
          type: txType,
          category,
          merchant: String(item.merchant || 'Transaksi Flazz BCA').slice(0, 90),
          location: String(item.location || 'Indonesia').slice(0, 60),
          amount,
          notes: item.notes ? String(item.notes).slice(0, 160) : undefined,
          timestampHint: item.timestampHint ? String(item.timestampHint).slice(0, 40) : undefined,
        };
      })
      .filter((t) => t.amount > 0);

    const detectedBalance =
      typeof parsed.detectedBalance === 'number' && parsed.detectedBalance >= 0
        ? Math.round(parsed.detectedBalance)
        : null;

    return {
      detectedBalance,
      cardNumberHint: parsed.cardNumberHint?.trim() || null,
      summary:
        parsed.summary ||
        `AI mengekstrak ${transactions.length} transaksi Flazz BCA${detectedBalance !== null ? ` (saldo Rp ${detectedBalance.toLocaleString('id-ID')})` : ''}.`,
      transactions,
      analyzedAt: new Date().toISOString(),
      model: usedModel,
    };
  } catch (err) {
    throw mapGeminiError(err);
  }
}
