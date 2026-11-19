export type CardIssuer = 'mandiri' | 'bca' | 'bri' | 'bni' | 'kmt';

export type TransactionCategory =
  | 'tol'
  | 'parkir'
  | 'transportasi'
  | 'bbm'
  | 'belanja'
  | 'topup'
  | 'lainnya';

export type TransactionType = 'debit' | 'topup';

export type ReimburseStatus = 'unclaimed' | 'in_batch' | 'submitted' | 'approved';

export type PlanTier = 'free' | 'premium';

export type BillingCycle = 'weekly' | 'monthly' | 'yearly';

export interface SubscriptionState {
  tier: PlanTier;
  billingCycle?: BillingCycle | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
}

export interface EMoneyCard {
  id: string;
  uid: string;
  issuer: CardIssuer;
  cardNumberMasked: string;
  cardNumberFull?: string;
  verificationCode: string;
  label: string;
  holderName: string;
  balance: number;
  lastTappedAt: string;
  readSource: 'web_nfc' | 'manual_sync' | 'simulasi' | 'card_number';
  createdAt: string;
}

export interface EMoneyTransaction {
  id: string;
  cardId: string;
  cardUid: string;
  issuer: CardIssuer;
  cardLabel: string;
  type: TransactionType;
  category: TransactionCategory;
  merchant: string;
  location: string;
  amount: number;
  balanceAfter: number;
  timestamp: string;
  reimburseStatus: ReimburseStatus;
  reimburseBatchId?: string | null;
  notes?: string;
  receiptImage?: string;
  activityPhoto?: string;
  activityCaption?: string;
}

export interface ReimburseBatch {
  id: string;
  reportNumber: string;
  title: string;
  employeeName: string;
  employeeId: string;
  department: string;
  companyName: string;
  approverName: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
  status: 'draft' | 'submitted' | 'approved';
  transactionIds: string[];
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProfile {
  workspaceCode: string;
  employeeName: string;
  employeeId: string;
  department: string;
  companyName: string;
  approverName: string;
}

export interface QrisPaymentOrder {
  id: string;
  orderCode: string;
  billingCycle: BillingCycle;
  amount: number;
  qrisPayload: string;
  merchantName: string;
  nmid: string;
  status: 'pending' | 'paid' | 'expired';
  createdAt: string;
  expiresAt: string;
  paidAt?: string | null;
}

export interface WorkspaceData {
  profile: WorkspaceProfile;
  subscription: SubscriptionState;
  cards: EMoneyCard[];
  transactions: EMoneyTransaction[];
  batches: ReimburseBatch[];
  paymentHistory: QrisPaymentOrder[];
  updatedAt: string;
  ephemeralRuntime?: boolean;
}

export interface NfcScanResult {
  uid: string;
  serialNumber: string;
  issuerGuess: CardIssuer;
  recordsCount: number;
  rawText?: string;
  parsedBalance?: number;
  nonNdefChip?: boolean;
  timestamp: string;
  source: 'web_nfc' | 'simulasi';
}

export interface FlazzAiInsight {
  ringkasanInstan: string;
  sorotanPemakaian: string[];
  rekomendasiReimburse: string;
  protocolVerdict: string;
  totalDebit: number;
  totalTopup: number;
  analyzedAt: string;
  model: string;
}

export interface FlazzParsedTransactionDraft {
  type: TransactionType;
  category: TransactionCategory;
  merchant: string;
  location: string;
  amount: number;
  notes?: string;
  timestampHint?: string;
}

export interface FlazzAiParseResponse {
  detectedBalance: number | null;
  cardNumberHint: string | null;
  summary: string;
  transactions: FlazzParsedTransactionDraft[];
  analyzedAt: string;
  model: string;
}

export interface FlazzAiStatusResponse {
  configured: boolean;
  model: string;
  flazzProtocol: {
    aidGen1: string;
    aidGen2: string;
    standard: string;
  };
}

