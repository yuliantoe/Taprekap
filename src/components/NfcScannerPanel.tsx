import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  ExternalLink,
  History,
  Link2,
  Nfc,
  Plus,
  Receipt,
  RefreshCw,
  Smartphone,
  Sparkles,
  StopCircle,
  Upload,
  Usb,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CardIssuer,
  EMoneyCard,
  EMoneyTransaction,
  FlazzAiInsight,
  FlazzAiParseResponse,
  FlazzAiStatusResponse,
  NfcScanResult,
  TransactionCategory,
  TransactionType,
} from '../types';
import { formatDateTimeId, formatRupiah, ISSUER_META } from '../lib/formatters';
import { compressImageToDataUrl } from '../lib/imageUtils';
import {
  FLAZZ_PROTOCOL_SPEC,
  isWebUsbSupported,
  probeUsbCcidFlazzReader,
} from '../lib/flazzProtocol';
import {
  getNfcCapabilities,
  inferIssuerFromCardNumberPrefix,
  queryNfcPermissionState,
  startWebNfcScan,
} from '../lib/nfc';

interface CardTapLookupResult {
  found: boolean;
  card: EMoneyCard | null;
  transactions: EMoneyTransaction[];
  totalTransactionsCount: number;
  autoLinkedUid?: boolean;
}

interface NfcScannerPanelProps {
  isPremium: boolean;
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  activeCardId: string | null;
  flazzAiStatus: FlazzAiStatusResponse | null;
  onSelectCard: (cardId: string) => void;
  onLookupCardByTap: (params: {
    uid?: string;
    cardNumber?: string;
    issuer?: CardIssuer;
    autoLinkIfSingle?: boolean;
  }) => Promise<CardTapLookupResult>;
  onAnalyzeFlazzTap: (
    cardId: string,
    scanUid?: string,
    scanSource?: string,
  ) => Promise<FlazzAiInsight>;
  onParseFlazzSource: (params: {
    cardId?: string;
    imageBase64?: string;
    mimeType?: string;
    rawTextOrHex?: string;
  }) => Promise<FlazzAiParseResponse>;
  onBatchImportTransactions: (payload: {
    cardId: string;
    updatedBalance?: number | null;
    items: Array<{
      type: TransactionType;
      category: TransactionCategory;
      merchant: string;
      location: string;
      amount: number;
      notes?: string;
    }>;
  }) => Promise<number>;
  onLinkCardUid?: (cardId: string, uid: string) => Promise<void>;
  onUpdateCardBalance?: (cardId: string, balance: number) => Promise<void>;
  onSaveCardFromScan: (payload: {
    uid: string;
    cardNumberFull?: string;
    issuer: CardIssuer;
    label: string;
    balance: number;
    readSource: 'web_nfc' | 'simulasi';
  }) => Promise<EMoneyCard>;
  onDeleteCard?: (cardId: string) => Promise<void>;
  onRecordTransaction: (payload: {
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
  }) => Promise<void>;
  onRequireUpgrade: (reason: string) => void;
}

const PRESET_SCANS: Array<{
  uid: string;
  issuer: CardIssuer;
  label: string;
  merchant: string;
  location: string;
  category: TransactionCategory;
  amount: number;
}> = [
  {
    uid: '04:A2:8F:19:4C:52:80',
    issuer: 'mandiri',
    label: 'e-Money Operasional Utama',
    merchant: 'Gerbang Tol Dalam Kota — Semanggi',
    location: 'Jakarta Selatan',
    category: 'tol',
    amount: 10500,
  },
  {
    uid: '04:5D:12:CA:91:3A:81',
    issuer: 'bca',
    label: 'Flazz Kunjungan Klien',
    merchant: 'Sky Parking Plaza Indonesia',
    location: 'Jakarta Pusat',
    category: 'parkir',
    amount: 18000,
  },
  {
    uid: '04:91:E4:20:6B:11:84',
    issuer: 'bri',
    label: 'Brizzi Tol Luar Kota',
    merchant: 'Gerbang Tol Karawang Barat',
    location: 'Karawang, Jawa Barat',
    category: 'tol',
    amount: 24500,
  },
  {
    uid: '04:77:B8:03:D2:49:80',
    issuer: 'bni',
    label: 'TapCash Transportasi KRL/MRT',
    merchant: 'TransJakarta — Halte Bundaran HI',
    location: 'Jakarta Pusat',
    category: 'transportasi',
    amount: 3500,
  },
];

export function NfcScannerPanel({
  isPremium,
  cards,
  transactions,
  activeCardId,
  flazzAiStatus,
  onSelectCard,
  onLookupCardByTap,
  onAnalyzeFlazzTap,
  onParseFlazzSource,
  onBatchImportTransactions,
  onLinkCardUid,
  onUpdateCardBalance,
  onSaveCardFromScan,
  onRecordTransaction,
  onDeleteCard,
  onRequireUpgrade,
}: NfcScannerPanelProps) {
  const caps = getNfcCapabilities();
  const usbSupported = isWebUsbSupported();
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfoNote, setScanInfoNote] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<NfcScanResult | null>(null);
  const [matchedCard, setMatchedCard] = useState<EMoneyCard | null>(null);
  const [lastTapReadAt, setLastTapReadAt] = useState<string | null>(null);
  const [quickPreview, setQuickPreview] = useState<{
    uid: string;
    issuer: CardIssuer;
    label: string;
    balance: number;
    merchant: string;
    location: string;
    category: TransactionCategory;
    amount: number;
    timestamp: string;
  } | null>(null);
  const [tapCountSession, setTapCountSession] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // BCA Flazz AI Key Instant Reader & Mutasi Extractor state
  const [aiInsight, setAiInsight] = useState<FlazzAiInsight | null>(null);
  const [aiInsightCardId, setAiInsightCardId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [parsePanelOpen, setParsePanelOpen] = useState(false);
  const [parseImage, setParseImage] = useState<string | undefined>(undefined);
  const [parseRawText, setParseRawText] = useState('');
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<FlazzAiParseResponse | null>(null);
  const [importingParsed, setImportingParsed] = useState(false);
  const [usbProbing, setUsbProbing] = useState(false);

  const [newIssuer, setNewIssuer] = useState<CardIssuer>('bca');
  const [newCardNumber, setNewCardNumber] = useState('');
  const [newLabel, setNewLabel] = useState('BCA Flazz Kunjungan');
  const [newBalance, setNewBalance] = useState('150000');
  const [tapBalanceOverride, setTapBalanceOverride] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);

  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState('');
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [syncDiffPrompt, setSyncDiffPrompt] = useState<{
    cardId: string;
    prevBalance: number;
    nextBalance: number;
    diff: number;
    type: TransactionType;
  } | null>(null);

  const [txType, setTxType] = useState<TransactionType>('debit');
  const [txCategory, setTxCategory] = useState<TransactionCategory>('tol');
  const [txMerchant, setTxMerchant] = useState('Gerbang Tol Dalam Kota');
  const [txLocation, setTxLocation] = useState('Jakarta');
  const [txAmount, setTxAmount] = useState('15000');
  const [txNotes, setTxNotes] = useState('');
  const [activityCaption, setActivityCaption] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | undefined>(undefined);
  const [activityPhoto, setActivityPhoto] = useState<string | undefined>(undefined);
  const [submittingTx, setSubmittingTx] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const availableCards = isPremium ? cards : cards.slice(0, 2);
  const syncedMatchedCard = matchedCard
    ? cards.find((c) => c.id === matchedCard.id) || matchedCard
    : null;
  const selectedCard =
    syncedMatchedCard ||
    availableCards.find((c) => c.id === activeCardId) ||
    availableCards[0] ||
    null;

  const selectedCardAllTxs = selectedCard
    ? transactions.filter((t) => t.cardId === selectedCard.id)
    : [];
  const selectedCardVisibleTxs = isPremium
    ? selectedCardAllTxs
    : selectedCardAllTxs.slice(0, 5);

  function focusResultPanel() {
    setTimeout(() => {
      document
        .getElementById('nfc-result-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  async function runInstantFlazzAiRead(
    card: EMoneyCard,
    scanUid?: string,
    scanSource?: string,
  ) {
    setAiLoading(true);
    setAiError(null);
    setAiInsightCardId(card.id);
    try {
      const insight = await onAnalyzeFlazzTap(card.id, scanUid || card.uid, scanSource);
      setAiInsight(insight);
    } catch (err) {
      setAiInsight(null);
      setAiError(
        err instanceof Error ? err.message : 'Gagal membaca analisis AI Flazz BCA.',
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function applyDetectedScanResult(result: NfcScanResult, nonNdefNote?: string) {
    setLastScan(result);
    setQuickPreview(null);
    setTapCountSession((n) => n + 1);

    // Always attempt automatic instant lookup by UID + issuer auto-link for physical Flazz/e-Money
    try {
      const lookup = await onLookupCardByTap({
        uid: result.uid || undefined,
        issuer: result.issuerGuess,
        autoLinkIfSingle: result.issuerGuess === 'bca' || Boolean(result.nonNdefChip),
      });
      if (lookup.found && lookup.card) {
        setMatchedCard(lookup.card);
        setLastTapReadAt(new Date().toISOString());
        onSelectCard(lookup.card.id);
        setScanInfoNote(
          lookup.autoLinkedUid
            ? `UID kartu fisik (${lookup.card.uid}) otomatis ditautkan ke ${lookup.card.label} untuk tap berikutnya.`
            : null,
        );
        setFeedbackBanner(
          `Tap ${ISSUER_META[lookup.card.issuer].name} terbaca otomatis · Saldo ${formatRupiah(lookup.card.balance)} · ${lookup.transactions.length} histori pemakaian dimuat instan.`,
        );
        focusResultPanel();
        if (lookup.card.issuer === 'bca') {
          void runInstantFlazzAiRead(lookup.card, result.uid || lookup.card.uid, result.source);
        }
        return;
      }
    } catch {
      // Fallback to in-memory card match below
    }

    const existing = result.uid
      ? cards.find((c) => c.uid.toUpperCase() === result.uid.toUpperCase())
      : result.issuerGuess === 'bca'
        ? cards.find((c) => c.issuer === 'bca')
        : undefined;

    if (existing) {
      setMatchedCard(existing);
      setLastTapReadAt(new Date().toISOString());
      onSelectCard(existing.id);
      setScanInfoNote(nonNdefNote || null);
      setFeedbackBanner(
        `Tap ${ISSUER_META[existing.issuer].name} terbaca instan (${existing.uid}) · Saldo ${formatRupiah(existing.balance)}.`,
      );
      focusResultPanel();
      if (existing.issuer === 'bca') {
        void runInstantFlazzAiRead(existing, result.uid || existing.uid, result.source);
      }
      return;
    }

    // If no Flazz card is registered in this workspace yet and slot allows, auto-save so tap opens immediately
    if (
      (result.issuerGuess === 'bca' || result.nonNdefChip) &&
      (isPremium || cards.length < 2)
    ) {
      try {
        const autoUid =
          result.uid ||
          `FLAZZ-${Math.random().toString(16).slice(2, 6).toUpperCase()}:${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
        const saved = await onSaveCardFromScan({
          uid: autoUid,
          issuer: result.issuerGuess,
          label:
            result.issuerGuess === 'bca'
              ? 'BCA Flazz Tap Otomatis'
              : `${ISSUER_META[result.issuerGuess].name} Tap`,
          balance: result.parsedBalance ?? 100000,
          readSource: result.source,
        });
        setMatchedCard(saved);
        setLastTapReadAt(new Date().toISOString());
        onSelectCard(saved.id);
        setScanInfoNote(
          'Kartu baru langsung tersimpan otomatis. Gunakan "AI Baca Struk / myBCA" jika ingin impor histori pemakaian atau perbarui saldo terakhir.',
        );
        setFeedbackBanner(
          `Kartu ${ISSUER_META[saved.issuer].name} otomatis aktif & siap dibaca (${saved.uid}).`,
        );
        focusResultPanel();
        if (saved.issuer === 'bca') {
          void runInstantFlazzAiRead(saved, saved.uid, result.source);
        }
        return;
      } catch {
        // Fall through to registration form if auto-save fails
      }
    }

    setMatchedCard(null);
    setLastTapReadAt(null);
    setNewIssuer(result.issuerGuess);
    setNewLabel(`${ISSUER_META[result.issuerGuess].name} Saya`);
    setNewBalance(String(result.parsedBalance ?? 100000));
    setScanInfoNote(
      nonNdefNote ||
        (result.nonNdefChip
          ? 'Chip kartu terdeteksi oleh sensor NFC! Hubungkan tap ini ke kartu yang sudah tersimpan di sistem atau simpan sebagai kartu baru.'
          : null),
    );
    setFeedbackBanner(
      result.uid
        ? `UID NFC terbaca (${result.uid}). Hubungkan ke kartu di sistem atau simpan sebagai kartu baru.`
        : 'Kartu non-NDEF terdeteksi! Pilih kartu yang ditempel di sebelah kanan untuk membaca datanya.',
    );

    focusResultPanel();
  }

  const startNfcRef = useRef<() => Promise<void>>(async () => {});

  async function handleStartNfc() {
    setScanError(null);
    setScanInfoNote(null);

    if (!caps.supported) {
      setScanError(
        'Browser perangkat ini tidak mendukung Web NFC (NDEFReader). Gunakan Google Chrome di perangkat Android (bukan tab pratinjau/iframe), atau pilih Input Kartu Fisik / Simulasi di bawah.',
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsScanning(true);

    try {
      await startWebNfcScan(
        controller.signal,
        (result) => {
          void applyDetectedScanResult(result);
        },
        (result, note) => {
          void applyDetectedScanResult(result, note);
        },
      );
    } catch (err) {
      setIsScanning(false);
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message =
        err instanceof Error ? err.message : 'Gagal mengaktifkan sensor NFC.';
      if (message.toLowerCase().includes('permission') || caps.inIframe) {
        setScanError(
          'Akses sensor NFC dibatasi di dalam iframe pratinjau. Klik "Buka Tab Penuh" di samping untuk menempelkan kartu BCA Flazz / Mandiri e-Money secara langsung.',
        );
      } else {
        setScanError(message);
      }
    }
  }

  startNfcRef.current = handleStartNfc;

  useEffect(() => {
    let active = true;
    if (!caps.inIframe && caps.supported) {
      queryNfcPermissionState().then((state) => {
        if (active && state === 'granted') {
          void startNfcRef.current();
        }
      });
    }
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [caps.inIframe, caps.supported]);

  function handleStopNfc() {
    abortRef.current?.abort();
    setIsScanning(false);
  }

  async function handleLinkTapToExistingCard(card: EMoneyCard) {
    setLinkingCardId(card.id);
    setScanError(null);
    try {
      const scannedUid = lastScan?.uid?.trim();
      const prevBal = card.balance;
      const parsedOverride =
        tapBalanceOverride.trim() !== '' && !Number.isNaN(Number(tapBalanceOverride))
          ? Math.max(0, Math.round(Number(tapBalanceOverride)))
          : null;

      if (scannedUid && onLinkCardUid) {
        await onLinkCardUid(card.id, scannedUid);
      }
      if (parsedOverride !== null && onUpdateCardBalance) {
        await onUpdateCardBalance(card.id, parsedOverride);
      }

      const lookup = await onLookupCardByTap({
        uid: scannedUid || card.uid,
        cardNumber: card.cardNumberFull,
      });
      const resolvedCard = lookup.card || {
        ...card,
        balance: parsedOverride ?? card.balance,
      };
      setMatchedCard(resolvedCard);
      setLastTapReadAt(new Date().toISOString());
      setLastScan(null);
      setScanInfoNote(null);
      setTapBalanceOverride('');
      onSelectCard(resolvedCard.id);

      if (parsedOverride !== null && parsedOverride !== prevBal) {
        setSyncDiffPrompt({
          cardId: resolvedCard.id,
          prevBalance: prevBal,
          nextBalance: parsedOverride,
          diff: Math.abs(prevBal - parsedOverride),
          type: parsedOverride < prevBal ? 'debit' : 'topup',
        });
      }

      setFeedbackBanner(
        scannedUid
          ? `UID ${scannedUid} ditautkan ke ${resolvedCard.label} · Saldo ${formatRupiah(resolvedCard.balance)}.`
          : `Data sistem ${ISSUER_META[resolvedCard.issuer].name} (${resolvedCard.label}) terbaca · Saldo ${formatRupiah(resolvedCard.balance)}.`,
      );
      focusResultPanel();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal membaca kartu');
    } finally {
      setLinkingCardId(null);
    }
  }

  async function handleDirectBalanceSync(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard || !onUpdateCardBalance) return;
    const parsed = Number(balanceDraft);
    if (Number.isNaN(parsed) || parsed < 0) return;

    const nextBal = Math.max(0, Math.round(parsed));
    const prevBal = selectedCard.balance;
    setUpdatingBalance(true);
    setScanError(null);
    try {
      await onUpdateCardBalance(selectedCard.id, nextBal);
      setEditingBalance(false);
      setLastTapReadAt(new Date().toISOString());
      if (nextBal !== prevBal) {
        setSyncDiffPrompt({
          cardId: selectedCard.id,
          prevBalance: prevBal,
          nextBalance: nextBal,
          diff: Math.abs(prevBal - nextBal),
          type: nextBal < prevBal ? 'debit' : 'topup',
        });
      }
      setFeedbackBanner(
        `Saldo ${ISSUER_META[selectedCard.issuer].name} diperbarui menjadi ${formatRupiah(nextBal)} dan disinkronkan ke cloud.`,
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal memperbarui saldo kartu');
    } finally {
      setUpdatingBalance(false);
    }
  }

  async function handleRecordBalanceDiff() {
    if (!syncDiffPrompt || !selectedCard) return;
    setSubmittingTx(true);
    setScanError(null);
    try {
      await onRecordTransaction({
        cardId: syncDiffPrompt.cardId,
        type: syncDiffPrompt.type,
        category: syncDiffPrompt.type === 'topup' ? 'topup' : txCategory,
        merchant:
          syncDiffPrompt.type === 'topup'
            ? `Top Up ${ISSUER_META[selectedCard.issuer].name}`
            : txMerchant.trim() || 'Transaksi Tol / Parkir',
        location: txLocation.trim() || 'Indonesia',
        amount: syncDiffPrompt.diff,
        notes: `Sinkron saldo (${formatRupiah(syncDiffPrompt.prevBalance)} → ${formatRupiah(syncDiffPrompt.nextBalance)})`,
        overrideBalanceAfter: syncDiffPrompt.nextBalance,
      });
      setSyncDiffPrompt(null);
      setFeedbackBanner(
        `Selisih ${formatRupiah(syncDiffPrompt.diff)} tercatat ke histori mutasi ${ISSUER_META[selectedCard.issuer].name}.`,
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal mencatat selisih transaksi');
    } finally {
      setSubmittingTx(false);
    }
  }

  function handleOpenManualPhysicalCard(presetIssuer: CardIssuer = 'mandiri') {
    setScanError(null);
    setScanInfoNote(
      'Mode input kartu fisik: masukkan 4–16 digit awal nomor kartu (opsional) atau pilih Mandiri e-Money / BCA Flazz, lalu masukkan saldo terakhir kartu.',
    );
    const uid = `NFC-${Math.random().toString(16).slice(2, 6).toUpperCase()}:${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
    setLastScan({
      uid,
      serialNumber: uid,
      issuerGuess: presetIssuer,
      recordsCount: 0,
      nonNdefChip: true,
      timestamp: new Date().toISOString(),
      source: 'web_nfc',
    });
    setMatchedCard(null);
    setQuickPreview(null);
    setNewIssuer(presetIssuer);
    setNewCardNumber('');
    setNewLabel(`${ISSUER_META[presetIssuer].name} Fisik`);
    setNewBalance('150000');
    focusResultPanel();
  }

  async function handleSimulateTap(preset: (typeof PRESET_SCANS)[number]) {
    setScanError(null);
    setScanInfoNote(null);
    const simulated: NfcScanResult = {
      uid: preset.uid,
      serialNumber: preset.uid,
      issuerGuess: preset.issuer,
      recordsCount: 1,
      timestamp: new Date().toISOString(),
      source: 'simulasi',
    };
    setLastScan(simulated);
    setTapCountSession((n) => n + 1);

    try {
      const lookup = await onLookupCardByTap({
        uid: preset.uid,
        issuer: preset.issuer,
        autoLinkIfSingle: true,
      });
      if (lookup.found && lookup.card) {
        setQuickPreview(null);
        setMatchedCard(lookup.card);
        setLastTapReadAt(new Date().toISOString());
        onSelectCard(lookup.card.id);
        setTxType('debit');
        setTxCategory(preset.category);
        setTxMerchant(preset.merchant);
        setTxLocation(preset.location);
        setTxAmount(String(preset.amount));
        setFeedbackBanner(
          `Tap ${ISSUER_META[lookup.card.issuer].name} terbaca otomatis (${lookup.card.uid}) · Saldo ${formatRupiah(lookup.card.balance)} · ${lookup.transactions.length} histori pemakaian dimuat instan.`,
        );
        focusResultPanel();
        if (lookup.card.issuer === 'bca') {
          void runInstantFlazzAiRead(lookup.card, preset.uid, 'simulasi');
        }
        return;
      }
    } catch {
      // fallback to local check below
    }

    let card = cards.find((c) => c.uid.toUpperCase() === preset.uid.toUpperCase());
    if (!card) {
      if (!isPremium && cards.length >= 2) {
        setMatchedCard(null);
        setLastTapReadAt(null);
        setQuickPreview({
          uid: preset.uid,
          issuer: preset.issuer,
          label: preset.label,
          balance: 250000,
          merchant: preset.merchant,
          location: preset.location,
          category: preset.category,
          amount: preset.amount,
          timestamp: simulated.timestamp,
        });
        setFeedbackBanner(
          `Cek saldo cepat (tanpa simpan): ${ISSUER_META[preset.issuer].name} (${preset.uid}) · Saldo Rp 250.000.`,
        );
        focusResultPanel();
        return;
      }
      card = await onSaveCardFromScan({
        uid: preset.uid,
        issuer: preset.issuer,
        label: preset.label,
        balance: 250000,
        readSource: 'simulasi',
      });
    }
    setQuickPreview(null);
    setMatchedCard(card);
    setLastTapReadAt(new Date().toISOString());
    onSelectCard(card.id);
    setTxType('debit');
    setTxCategory(preset.category);
    setTxMerchant(preset.merchant);
    setTxLocation(preset.location);
    setTxAmount(String(preset.amount));
    setFeedbackBanner(
      `Tap NFC terbaca otomatis: ${ISSUER_META[card.issuer].name} · Saldo ${formatRupiah(card.balance)}.`,
    );
    focusResultPanel();
    if (card.issuer === 'bca') {
      void runInstantFlazzAiRead(card, preset.uid, 'simulasi');
    }
  }

  async function handleProbeUsbReader() {
    setUsbProbing(true);
    setScanError(null);
    const res = await probeUsbCcidFlazzReader();
    setScanInfoNote(res.note);
    setUsbProbing(false);
  }

  async function handleParseImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      setParseImage(compressed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Gagal membaca file gambar.');
    }
  }

  async function handleRunAiSourceParse(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard) return;
    setParseLoading(true);
    setParseError(null);
    setParsedResult(null);
    try {
      const mimeMatch = parseImage?.match(/^data:([^;]+);base64,/);
      const parsed = await onParseFlazzSource({
        cardId: selectedCard.id,
        imageBase64: parseImage,
        mimeType: mimeMatch?.[1] || 'image/jpeg',
        rawTextOrHex: parseRawText.trim() || undefined,
      });
      setParsedResult(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Gagal mengekstrak mutasi Flazz via AI.',
      );
    } finally {
      setParseLoading(false);
    }
  }

  async function handleCommitParsedFlazzTransactions() {
    if (!selectedCard || !parsedResult) return;
    setImportingParsed(true);
    setParseError(null);
    try {
      const importedCount = await onBatchImportTransactions({
        cardId: selectedCard.id,
        updatedBalance: parsedResult.detectedBalance,
        items: parsedResult.transactions.map((t) => ({
          type: t.type,
          category: t.category,
          merchant: t.merchant,
          location: t.location,
          amount: t.amount,
          notes: t.notes || (t.timestampHint ? `Waktu struk: ${t.timestampHint}` : undefined),
        })),
      });
      setParsedResult(null);
      setParseImage(undefined);
      setParseRawText('');
      setParsePanelOpen(false);
      setFeedbackBanner(
        `AI Key Flazz BCA menyimpan ${importedCount} mutasi pemakaian baru${
          parsedResult.detectedBalance !== null
            ? ` & memperbarui saldo menjadi ${formatRupiah(parsedResult.detectedBalance)}`
            : ''
        }.`,
      );
      void runInstantFlazzAiRead(selectedCard, selectedCard.uid, 'ai_parse');
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Gagal menyimpan mutasi ke histori kartu.',
      );
    } finally {
      setImportingParsed(false);
    }
  }

  async function handleRegisterUnknownCard(e: React.FormEvent, replaceOldestSlot = false) {
    e.preventDefault();
    if (!lastScan && !quickPreview) return;

    const targetUid = quickPreview?.uid || lastScan?.uid || '';
    const targetIssuer = quickPreview?.issuer || newIssuer;
    const targetLabel =
      quickPreview?.label || newLabel.trim() || `${ISSUER_META[targetIssuer].name}`;
    const targetBalance = quickPreview?.balance ?? (Number(newBalance) || 0);
    const cleanDigits = newCardNumber.replace(/\D/g, '');

    if (!isPremium && cards.length >= 2 && !replaceOldestSlot) {
      onRequireUpgrade(
        'Paket Gratis dibatasi maksimal 2 kartu tersimpan. Upgrade ke Paket Premium (mulai 5K/minggu) untuk menyimpan semua kartu, atau pilih ganti salah satu kartu demo.',
      );
      return;
    }

    setSavingCard(true);
    setScanError(null);
    try {
      if (!isPremium && cards.length >= 2 && replaceOldestSlot && onDeleteCard) {
        const oldest = cards[cards.length - 1];
        if (oldest) {
          await onDeleteCard(oldest.id);
        }
      }
      const saved = await onSaveCardFromScan({
        uid: targetUid,
        cardNumberFull: cleanDigits.length >= 12 ? cleanDigits : undefined,
        issuer: targetIssuer,
        label: targetLabel,
        balance: targetBalance,
        readSource: lastScan?.source || 'web_nfc',
      });
      setQuickPreview(null);
      setMatchedCard(saved);
      onSelectCard(saved.id);
      setScanInfoNote(null);
      setFeedbackBanner(`Kartu ${saved.label} tersimpan dan siap dilacak real-time.`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal menyimpan kartu');
    } finally {
      setSavingCard(false);
    }
  }

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'receipt' | 'activity',
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPremium) {
      e.target.value = '';
      onRequireUpgrade(
        'Lampiran struk resmi operator dan foto kegiatan lapangan tersedia di Paket Premium (mulai 5K/minggu).',
      );
      return;
    }
    try {
      const compressed = await compressImageToDataUrl(file);
      if (kind === 'receipt') setReceiptImage(compressed);
      else setActivityPhoto(compressed);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal memproses foto');
    }
  }

  async function handleQuickTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard) return;
    const numericAmount = Number(txAmount);
    if (!numericAmount || numericAmount <= 0) return;

    setSubmittingTx(true);
    setScanError(null);
    try {
      await onRecordTransaction({
        cardId: selectedCard.id,
        type: txType,
        category: txType === 'topup' ? 'topup' : txCategory,
        merchant: txMerchant.trim() || 'Transaksi e-Money',
        location: txLocation.trim() || 'Indonesia',
        amount: numericAmount,
        notes: txNotes.trim() || undefined,
        receiptImage: isPremium ? receiptImage : undefined,
        activityPhoto: isPremium ? activityPhoto : undefined,
        activityCaption: isPremium && activityCaption.trim() ? activityCaption.trim() : undefined,
      });
      setTxNotes('');
      setActivityCaption('');
      setReceiptImage(undefined);
      setActivityPhoto(undefined);
      setFeedbackBanner(
        `Mutasi ${txType === 'topup' ? 'Top Up' : 'Pengeluaran'} ${formatRupiah(numericAmount)} tersimpan ke cloud.`,
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal menyimpan transaksi');
    } finally {
      setSubmittingTx(false);
    }
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: NFC Reader Dock */}
      <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-950 font-display">
              Cek Saldo NFC Gratis — Tanpa Login
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Tempelkan Mandiri e-Money, BCA Flazz, BRI Brizzi, atau BNI TapCash tanpa batas jumlah scan.
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Nfc className="w-5 h-5" />
          </div>
        </div>

        {/* Active Scanner Target Zone */}
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-6 flex flex-col items-center text-center">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-white border border-neutral-200">
            {isScanning && (
              <span
                className="absolute inset-0 rounded-full border-2 border-blue-600 animate-ping opacity-30"
                aria-hidden="true"
              />
            )}
            <Smartphone
              className={`w-9 h-9 ${isScanning ? 'text-blue-600' : 'text-neutral-800'}`}
            />
          </div>

          <div className="mt-4 text-sm font-semibold text-neutral-950">
            {isScanning
              ? 'Menunggu kartu ditempelkan di belakang ponsel...'
              : 'Siap membaca sensor NFC tanpa batas'}
          </div>
          <p className="mt-1 text-xs text-neutral-600 max-w-xs">
            {caps.platformHint}
            {tapCountSession > 0 ? ` · ${tapCountSession}x scan sesi ini` : ''}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 w-full">
            {!isScanning ? (
              <button
                type="button"
                onClick={handleStartNfc}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Nfc className="w-4 h-4" />
                <span>Mulai Scan NFC Gratis</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopNfc}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <StopCircle className="w-4 h-4" />
                <span>Hentikan Scan</span>
              </button>
            )}

            {caps.inIframe && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Buka Tab Penuh</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleOpenManualPhysicalCard('bca')}
            className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Atau input manual kartu fisik (Flazz / e-Money)
          </button>

          {usbSupported && (
            <button
              type="button"
              disabled={usbProbing}
              onClick={handleProbeUsbReader}
              className="mt-2 text-[11px] font-medium text-neutral-600 hover:text-neutral-950 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>
                {usbProbing
                  ? 'Memindai USB Reader...'
                  : 'Hubungkan Reader USB CCID (Desktop / OTG)'}
              </span>
            </button>
          )}
        </div>

        {/* Flazz BCA AI Key & AID Protocol Info Strip */}
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-neutral-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">AI Key Flazz BCA · Baca Histori Instan</span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500 truncate mt-0.5">
              AID {FLAZZ_PROTOCOL_SPEC.aidGen1} / {FLAZZ_PROTOCOL_SPEC.aidGen2} ·{' '}
              {flazzAiStatus?.model || 'gemini-4-hydrogen'}
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
              flazzAiStatus?.configured
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {flazzAiStatus?.configured ? 'AI Key Aktif' : 'Perlu Secret Key'}
          </span>
        </div>

        {scanError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 leading-relaxed"
          >
            <span className="font-semibold">Info NFC: </span>
            {scanError}
          </div>
        )}

        {scanInfoNote && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950 leading-relaxed">
            <span className="font-semibold">Catatan Chip Bank: </span>
            {scanInfoNote}
          </div>
        )}

        {feedbackBanner && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>{feedbackBanner}</span>
          </div>
        )}

        {/* Desktop / iOS Simulator Controls */}
        <div className="mt-6 pt-5 border-t border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Simulasi Tap Kartu (Desktop / iOS)
            </span>
            <span className="text-[11px] text-slate-500">
              Cek saldo & mutasi instan
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {PRESET_SCANS.map((preset) => (
              <button
                key={preset.uid}
                type="button"
                onClick={() => handleSimulateTap(preset)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-left transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {ISSUER_META[preset.issuer].name}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums truncate">
                  {preset.uid.slice(0, 11)}…
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Active Card Result & Real-Time Mutation Form */}
      <div
        id="nfc-result-panel"
        className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 scroll-mt-20"
      >
        {quickPreview ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Hasil Cek Saldo Cepat (Tanpa Simpan)
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 font-mono tabular-nums">
                  UID {quickPreview.uid} · {formatDateTimeId(quickPreview.timestamp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickPreview(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-blue-700">
                  {ISSUER_META[quickPreview.issuer].name}
                </div>
                <div className="text-base font-bold text-slate-950 mt-0.5">
                  {quickPreview.label}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Contoh transaksi: {quickPreview.merchant} ({formatRupiah(quickPreview.amount)})
                </div>
              </div>
              <div className="sm:text-right shrink-0">
                <div className="text-[11px] text-slate-500">Saldo Terbaca</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                  {formatRupiah(quickPreview.balance)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 leading-relaxed">
              Slot penyimpanan Paket Gratis sudah penuh ({cards.length}/2 kartu). Anda tetap bisa cek saldo tanpa batas, atau ganti salah satu kartu lama agar kartu ini tersimpan di cloud.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {onDeleteCard && cards.length >= 2 && (
                <button
                  type="button"
                  disabled={savingCard}
                  onClick={(e) => handleRegisterUnknownCard(e, true)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  {savingCard ? 'Mengganti...' : 'Ganti Kartu Lama & Simpan Kartu Ini'}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onRequireUpgrade(
                    'Upgrade ke Paket Premium (mulai 5K/minggu) untuk menyimpan semua kartu tanpa batas.',
                  )
                }
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Crown className="w-4 h-4 text-amber-400" />
                <span>Upgrade Premium (Simpan Semua)</span>
              </button>
            </div>
          </div>
        ) : lastScan && !matchedCard ? (
          <div>
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  {lastScan.uid
                    ? 'Kartu NFC Terdeteksi — Hubungkan atau Simpan'
                    : 'Kartu Bank Non-NDEF Terdeteksi — Pilih Kartu'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 font-mono tabular-nums">
                  {lastScan.uid
                    ? `UID Terbaca: ${lastScan.uid} · ${formatDateTimeId(lastScan.timestamp)}`
                    : `Sinyal Chip NFC · ${formatDateTimeId(lastScan.timestamp)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLastScan(null);
                  setScanInfoNote(null);
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
            </div>

            {availableCards.length > 0 && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
                <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  <span>
                    {lastScan.uid
                      ? 'Hubungkan Tap UID ini ke Kartu di Sistem (Tap berikutnya otomatis terbaca):'
                      : 'Pilih kartu yang baru ditempel untuk membaca & update saldo di sistem:'}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                    Update Saldo Terbaca (Rp · opsional — dari struk/myBCA/Livin)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={tapBalanceOverride}
                    onChange={(e) => setTapBalanceOverride(e.target.value)}
                    placeholder="Kosongkan untuk pakai saldo tersimpan di sistem"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-blue-200 bg-white text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={linkingCardId === c.id}
                      onClick={() => handleLinkTapToExistingCard(c)}
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-blue-200 bg-white hover:border-blue-400 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-slate-950 truncate">
                        {ISSUER_META[c.issuer].name} · {c.label}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-600">
                        {formatRupiah(c.balance)} · {c.cardNumberMasked}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={(e) => handleRegisterUnknownCard(e, false)} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pilih Penerbit Kartu
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ISSUER_META) as CardIssuer[]).map((issuerKey) => (
                    <button
                      key={issuerKey}
                      type="button"
                      onClick={() => {
                        setNewIssuer(issuerKey);
                        setNewLabel(`${ISSUER_META[issuerKey].name} Operasional`);
                      }}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        newIssuer === issuerKey
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {ISSUER_META[issuerKey].name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor Kartu (Opsional · Auto-deteksi)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newCardNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewCardNumber(val);
                      const detected = inferIssuerFromCardNumberPrefix(val);
                      if (detected) {
                        setNewIssuer(detected);
                      }
                    }}
                    placeholder="6032... (Mandiri) / 0148... (Flazz)"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Saldo Saat Ini (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Label Kartu (untuk laporan kantor)
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Misal: e-Money Tol Operasional"
                  required
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {(!isPremium && cards.length >= 2) ? (
                  <>
                    {onDeleteCard && (
                      <button
                        type="button"
                        disabled={savingCard}
                        onClick={(e) => handleRegisterUnknownCard(e, true)}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        {savingCard ? 'Menyimpan...' : 'Ganti Kartu Demo & Simpan Kartu Ini'}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingCard}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>Upgrade Premium untuk Kartu ke-{cards.length + 1}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={savingCard}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{savingCard ? 'Menyimpan...' : 'Simpan Kartu ke Cloud'}</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : selectedCard ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Saldo Real-Time & Catat Mutasi Tap
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  {isPremium
                    ? 'Lampirkan struk resmi operator, keterangan & foto kegiatan agar ikut tercetak di PDF.'
                    : 'Catat transaksi kartu aktif (Paket Gratis menampilkan 5 transaksi terakhir per kartu).'}
                </p>
              </div>
              {availableCards.length > 1 && (
                <select
                  aria-label="Pilih Kartu Aktif"
                  value={selectedCard.id}
                  onChange={(e) => {
                    setMatchedCard(null);
                    onSelectCard(e.target.value);
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  {availableCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {ISSUER_META[c.issuer].shortName} — {c.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Selected Card Summary Strip + Direct Balance Update */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {ISSUER_META[selectedCard.issuer].name} · {selectedCard.label}
                      </span>
                      {lastTapReadAt && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          Terbaca Otomatis
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums truncate mt-0.5">
                      {selectedCard.cardNumberMasked} · UID {selectedCard.uid} · Update{' '}
                      {formatDateTimeId(selectedCard.lastTappedAt)}
                    </div>
                  </div>
                </div>
                <div className="sm:text-right shrink-0">
                  <div className="text-[11px] text-slate-500">Saldo Tersimpan di Sistem</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {formatRupiah(selectedCard.balance)}
                  </div>
                  {onUpdateCardBalance && !editingBalance && (
                    <button
                      type="button"
                      onClick={() => {
                        setBalanceDraft(String(selectedCard.balance));
                        setEditingBalance(true);
                      }}
                      className="mt-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Perbarui Saldo Kartu
                    </button>
                  )}
                </div>
              </div>

              {editingBalance && onUpdateCardBalance && (
                <form
                  onSubmit={handleDirectBalanceSync}
                  className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={balanceDraft}
                    onChange={(e) => setBalanceDraft(e.target.value)}
                    placeholder="Saldo terkini (Rp)"
                    required
                    className="flex-1 min-w-[160px] min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono tabular-nums text-slate-950 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={updatingBalance}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {updatingBalance ? 'Menyimpan...' : 'Simpan Saldo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBalance(false)}
                    className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 cursor-pointer"
                  >
                    Batal
                  </button>
                </form>
              )}

              {syncDiffPrompt && syncDiffPrompt.cardId === selectedCard.id && (
                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700">
                    Terdeteksi selisih saldo{' '}
                    <strong className="font-mono text-slate-950">
                      {syncDiffPrompt.type === 'debit' ? '-' : '+'}
                      {formatRupiah(syncDiffPrompt.diff)}
                    </strong>
                    . Catat otomatis ke histori transaksi?
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={submittingTx}
                      onClick={handleRecordBalanceDiff}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-neutral-950 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      {syncDiffPrompt.type === 'debit'
                        ? 'Catat Pengeluaran'
                        : 'Catat Top Up'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncDiffPrompt(null)}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      Lewati
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Key Flazz BCA Instant Usage Reader & Mutasi Extractor */}
            {(selectedCard.issuer === 'bca' || (aiInsight && aiInsightCardId === selectedCard.id)) && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-neutral-950 truncate">
                        AI Key Flazz BCA — Pembaca Histori Pemakaian Instan
                      </div>
                      <div className="text-[10px] font-mono text-neutral-600 truncate">
                        {FLAZZ_PROTOCOL_SPEC.standard} · AID {FLAZZ_PROTOCOL_SPEC.aidGen1}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() =>
                        runInstantFlazzAiRead(selectedCard, selectedCard.uid, 'manual_ai_refresh')
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-[11px] font-semibold text-blue-700 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
                      <span>{aiLoading ? 'Membaca AI...' : 'Baca Ulang AI'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setParsePanelOpen((prev) => !prev);
                        setParseError(null);
                      }}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{parsePanelOpen ? 'Tutup Ekstraktor' : 'AI Baca Struk / myBCA'}</span>
                    </button>
                  </div>
                </div>

                {aiLoading && (
                  <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-xs text-blue-900 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                    <span>Menganalisis saldo & histori pemakaian BCA Flazz via AI Key...</span>
                  </div>
                )}

                {aiError && !aiLoading && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}

                {aiInsight && aiInsightCardId === selectedCard.id && !aiLoading && (
                  <div className="rounded-lg border border-blue-100 bg-white p-3.5 space-y-2.5">
                    <p className="text-xs font-medium text-neutral-900 leading-relaxed">
                      {aiInsight.ringkasanInstan}
                    </p>
                    {aiInsight.sorotanPemakaian.length > 0 && (
                      <ul className="space-y-1 text-[11px] text-neutral-700">
                        {aiInsight.sorotanPemakaian.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                      <span>{aiInsight.rekomendasiReimburse}</span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {aiInsight.protocolVerdict}
                      </span>
                    </div>
                  </div>
                )}

                {parsePanelOpen && (
                  <form
                    onSubmit={handleRunAiSourceParse}
                    className="rounded-lg border border-blue-200 bg-white p-3.5 space-y-3"
                  >
                    <div className="text-xs font-semibold text-neutral-900">
                      Ekstrak Histori & Saldo Flazz Otomatis (Foto Struk EDC / Screenshot myBCA / Log APDU)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="min-h-[42px] px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-medium text-neutral-800 flex items-center justify-between gap-2 cursor-pointer">
                        <span className="inline-flex items-center gap-2 truncate">
                          <Camera className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="truncate">
                            {parseImage ? 'Gambar Siap Dianalisis' : 'Pilih Foto Struk / myBCA'}
                          </span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleParseImageSelect}
                          className="sr-only"
                        />
                        {parseImage && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.preventDefault();
                              setParseImage(undefined);
                            }}
                            className="text-neutral-400 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </label>

                      <button
                        type="submit"
                        disabled={parseLoading || (!parseImage && !parseRawText.trim())}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{parseLoading ? 'Mengekstrak...' : 'Baca Mutasi via AI Key'}</span>
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={parseRawText}
                      onChange={(e) => setParseRawText(e.target.value)}
                      placeholder="Atau tempel catatan mutasi myBCA Flazz / log APDU hex (contoh: Tol Cikarang Rp 27.000, Saldo Rp 115.000)..."
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                    />

                    {parseError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        {parseError}
                      </div>
                    )}

                    {parsedResult && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-emerald-950">
                            {parsedResult.summary}
                          </span>
                          {parsedResult.detectedBalance !== null && (
                            <span className="font-mono font-bold text-emerald-800">
                              Saldo Terbaca: {formatRupiah(parsedResult.detectedBalance)}
                            </span>
                          )}
                        </div>
                        {parsedResult.transactions.length > 0 && (
                          <div className="divide-y divide-emerald-200/70 bg-white rounded-md border border-emerald-200">
                            {parsedResult.transactions.map((item, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-neutral-900 truncate">
                                    {item.merchant}
                                  </div>
                                  <div className="text-[10px] text-neutral-500">
                                    {item.location} · {item.category}
                                  </div>
                                </div>
                                <div className="font-mono font-bold text-neutral-950 shrink-0">
                                  {item.type === 'topup' ? '+' : '-'}
                                  {formatRupiah(item.amount)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={importingParsed}
                          onClick={handleCommitParsedFlazzTransactions}
                          className="min-h-[38px] px-4 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            {importingParsed
                              ? 'Menyimpan...'
                              : `Simpan ${parsedResult.transactions.length} Transaksi${
                                  parsedResult.detectedBalance !== null ? ' & Update Saldo' : ''
                                } ke Histori Flazz`}
                          </span>
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Live Card Transaction History Automatically Read From System */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    Histori Transaksi Terbaca ({selectedCardVisibleTxs.length}
                    {!isPremium && selectedCardAllTxs.length > 5
                      ? ` dari ${selectedCardAllTxs.length} — Paket Gratis`
                      : ''}
                    )
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {selectedCard.verificationCode}
                </span>
              </div>

              {selectedCardVisibleTxs.length === 0 ? (
                <div className="px-4 py-4 text-xs text-slate-500">
                  Belum ada histori transaksi tercatat untuk kartu ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {selectedCardVisibleTxs.map((tx) => (
                    <div
                      key={tx.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {tx.merchant}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {formatDateTimeId(tx.timestamp)} · {tx.location}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div
                          className={`font-bold ${
                            tx.type === 'topup' ? 'text-emerald-700' : 'text-slate-950'
                          }`}
                        >
                          {tx.type === 'topup' ? '+' : '-'}
                          {formatRupiah(tx.amount)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Saldo {formatRupiah(tx.balanceAfter)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Real-time Transaction Logger */}
            <form onSubmit={handleQuickTransaction} className="mt-5 space-y-4">
              <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 w-fit">
                <button
                  type="button"
                  onClick={() => setTxType('debit')}
                  className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    txType === 'debit'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pengeluaran (Debit)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('topup')}
                  className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    txType === 'topup'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Isi Saldo (Top Up)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {txType === 'debit' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kategori Pengeluaran
                    </label>
                    <select
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value as TransactionCategory)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      <option value="tol">Jalan Tol</option>
                      <option value="parkir">Parkir</option>
                      <option value="transportasi">KRL / MRT / TransJakarta</option>
                      <option value="bbm">BBM / SPBU</option>
                      <option value="belanja">Merchant / Retail</option>
                      <option value="lainnya">Operasional Lainnya</option>
                    </select>
                  </div>
                )}

                <div className={txType === 'topup' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Merchant / Gerbang Tol / Stasiun
                  </label>
                  <input
                    type="text"
                    value={txMerchant}
                    onChange={(e) => setTxMerchant(e.target.value)}
                    placeholder="Contoh: Gerbang Tol Pasteur"
                    required
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Kota / Lokasi
                  </label>
                  <input
                    type="text"
                    value={txLocation}
                    onChange={(e) => setTxLocation(e.target.value)}
                    placeholder="Contoh: Jakarta Selatan"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Keterangan / Keperluan Kantor
                </label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Contoh: Kunjungan klien PT Maju Bersama"
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Premium Struk Resmi Operator & Foto Kegiatan */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Struk Resmi Operator & Foto Kegiatan</span>
                    {!isPremium && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                  {!isPremium && (
                    <button
                      type="button"
                      onClick={() =>
                        onRequireUpgrade(
                          'Lampiran struk resmi operator, keterangan kegiatan, dan foto lapangan ikut dilaporkan ke PDF di Paket Premium (mulai 5K/minggu).',
                        )
                      }
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      Aktifkan Premium
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                      <span className="inline-flex items-center gap-2 truncate">
                        <Receipt className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="truncate">
                          {receiptImage ? 'Struk Terlampir' : 'Upload Struk Operator'}
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileSelect(e, 'receipt')}
                        className="sr-only"
                      />
                      {receiptImage && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.preventDefault();
                            setReceiptImage(undefined);
                          }}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                    {receiptImage && (
                      <img
                        src={receiptImage}
                        alt="Pratinjau struk resmi operator"
                        className="mt-2 h-20 w-full object-cover rounded-lg border border-slate-200"
                      />
                    )}
                  </div>

                  <div>
                    <label className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-between gap-2 cursor-pointer">
                      <span className="inline-flex items-center gap-2 truncate">
                        <Camera className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="truncate">
                          {activityPhoto ? 'Foto Kegiatan Terlampir' : 'Upload Foto Kegiatan'}
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileSelect(e, 'activity')}
                        className="sr-only"
                      />
                      {activityPhoto && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.preventDefault();
                            setActivityPhoto(undefined);
                          }}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                    {activityPhoto && (
                      <img
                        src={activityPhoto}
                        alt="Pratinjau foto kegiatan"
                        className="mt-2 h-20 w-full object-cover rounded-lg border border-slate-200"
                      />
                    )}
                  </div>
                </div>

                {isPremium && (
                  <input
                    type="text"
                    value={activityCaption}
                    onChange={(e) => setActivityCaption(e.target.value)}
                    placeholder="Keterangan singkat foto kegiatan / nomor struk operator..."
                    className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                )}
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Estimasi saldo setelah transaksi:{' '}
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatRupiah(
                      txType === 'topup'
                        ? selectedCard.balance + (Number(txAmount) || 0)
                        : Math.max(0, selectedCard.balance - (Number(txAmount) || 0)),
                    )}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submittingTx}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${submittingTx ? 'animate-spin' : ''}`} />
                  <span>{submittingTx ? 'Menyimpan...' : 'Catat & Sinkron ke Cloud'}</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
              <Wallet className="w-6 h-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900 font-display">
              Belum Ada Kartu Terhubung
            </h3>
            <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
              Klik "Mulai Scan NFC Gratis" di ponsel Android atau coba Simulasi Tap Kartu untuk mendaftarkan kartu pertama Anda.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
