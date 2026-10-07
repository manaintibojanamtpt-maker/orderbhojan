/**
 * Phase A / B — POS domain models.
 *
 * Offline-first: every staff action becomes a durable record in the local queue
 * with a stable `id` that doubles as the server-side idempotency key.
 *
 * Distinction that matters: `synced` is *optimistic local state* while
 * `confirmedVersion` / `confirmedStatus` are what the **server** last
 * acknowledged. The UI must show the difference.
 */

export type PosOrderSource = 'ORDERBHOJAN' | 'WALK_IN';

/** Canonical lifecycle values. Legacy spellings are mapped on read. */
export type PosOrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

export type PosOrderType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export type PosPaymentMethod = 'UPI' | 'COD' | 'RAZORPAY' | 'CASH' | 'CARD' | 'OTHER';

export type PosPaymentStatus = 'PENDING' | 'RECORDED' | 'VERIFIED' | 'FAILED' | 'REFUNDED' | 'EXPIRED';

/**
 * Settled = money is accounted for, by either a staff member or the gateway.
 * `RECORDED` (staff-collected) and `VERIFIED` (gateway-confirmed) are kept
 * distinct everywhere else; this helper exists only for the "is it paid?" UI
 * question. Callers that must know the provenance compare the raw value.
 */
export const SETTLED_PAYMENT_STATUSES: readonly PosPaymentStatus[] = ['RECORDED', 'VERIFIED'] as const;

export const isPaymentSettled = (status: PosPaymentStatus | string | undefined): boolean =>
  SETTLED_PAYMENT_STATUSES.includes(String(status).toUpperCase() as PosPaymentStatus);

/** True only when the payment gateway confirmed settlement. */
export const isGatewayVerified = (status: PosPaymentStatus | string | undefined): boolean =>
  String(status).toUpperCase() === 'VERIFIED';

export interface PosItemSnapshot {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  category?: string;
  notes?: string;
}

export interface PosOrderCustomer {
  name: string;
  phone: string;
  address?: string;
  tableNo?: string;
}

export interface PosOrderPricing {
  subtotal: number;
  taxes: number;
  deliveryFee: number;
  packingFee: number;
  discount: number;
  total: number;
}

export interface PosTimestamps {
  createdAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  completedAt?: string;
  rejectedAt?: string;
}

export interface PosOrder {
  id: string;
  onlineOrderId?: string;
  restaurantId: string;
  orderNumber?: number;
  orderSource: PosOrderSource;
  orderType: PosOrderType;
  orderStatus: PosOrderStatus;
  paymentMethod: PosPaymentMethod;
  paymentStatus: PosPaymentStatus;
  customer: PosOrderCustomer;
  items: PosItemSnapshot[];
  pricing: PosOrderPricing;
  timestamps: PosTimestamps;
  /** Canonical lifecycle field from the server; `orderStatus` is the local view. */
  canonicalOrderStatus?: string;
  rejectionReason?: string;
  /** Optimistic local flag. Never treat as proof the server accepted the change. */
  synced?: boolean;
  /** Last version the server acknowledged. Used for optimistic concurrency. */
  confirmedVersion?: number;
  /** Last status the server acknowledged. */
  confirmedStatus?: string;
  kotPrinted?: boolean;
  billPrinted?: boolean;
  /** Version currently held locally to detect competing writes. */
  localVersion?: number;
}

export type KotStatus = 'PENDING' | 'PREPARING' | 'READY';

export interface KotItem {
  itemId: string;
  name: string;
  quantity: number;
  notes?: string;
}

export interface Kot {
  id: string;
  kotNumber: number;
  orderId: string;
  onlineOrderId?: string;
  restaurantId: string;
  orderType: PosOrderType;
  tableNo?: string;
  items: KotItem[];
  status: KotStatus;
  createdAt: string;
  notes?: string;
  synced?: boolean;
}

export interface PosPaymentRecord {
  id: string;
  orderId: string;
  restaurantId: string;
  amount: number;
  method: PosPaymentMethod;
  status: PosPaymentStatus;
  recordedAt: string;
  reference?: string;
  /** Local-only until the server acknowledges the RecordPayment command. */
  synced?: boolean;
  /** Command id used as the server idempotency key for this payment. */
  commandId?: string;
}

/**
 * Durable queue states.
 *  PENDING  — waiting for a flush attempt
 *  SYNCING  — in flight (recovered to PENDING after a restart)
 *  SYNCED   — durably acknowledged; retained per the retention policy
 *  FAILED   — permanently failed and requires staff action
 *  BLOCKED  — held because authentication expired; resumes after re-auth
 */
export type PosSyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'BLOCKED';

export type PosEntityType = 'ORDER' | 'KOT' | 'PAYMENT' | 'SETTINGS';
export type PosOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncQueueItem {
  id: string;
  // Tenant + device scoping for isolation and traceability.
  tenantId?: string;
  deviceId?: string;
  /** Tenant-scoped monotonic counter used to order dependent commands. */
  clientSequence?: number;
  /** Per-order monotonic counter used for dependency ordering. */
  orderSequence?: number;
  /** Cross-service trace id propagated to the server. */
  correlationId?: string;
  /** Server version this command was built against. */
  expectedVersion?: number;

  // Phase 4F hardened fields
  entityType?: PosEntityType;
  entityId?: string;
  operation?: PosOperation;
  payload?: Record<string, unknown>;

  lastAttemptAt?: string;
  /** Epoch ms gate; the item is not attempted before this time. */
  nextAttemptAt?: number;
  /** Epoch ms when the server acknowledged the command. */
  acknowledgedAt?: number;
  /**
   * Fencing token of the worker that claimed this command (SYNCING).
   * A worker whose token is behind the current fence has been replaced and must
   * not write an outcome for this record.
   */
  leaseFence?: number;
  /** Worker identity that claimed this command. */
  leaseOwner?: string;
  /**
   * How many times this command's `expectedVersion` was revised after a
   * concurrency conflict. Each revision is a *new attempt of the same intent*,
   * not a new command: the `commandId` never changes.
   */
  expectedVersionRevision?: number;
  lastError?: string;
  errorMessage?: string;
  /** Machine-readable failure classification for operator messaging. */
  failureCode?: string;
  /** Human-readable detail surfaced in the queue UI. */
  failureDetail?: string;

  // Backward compatibility fields with Phase 4E
  action?: 'CREATE_ORDER' | 'UPDATE_STATUS' | 'RECORD_PAYMENT' | 'CREATE_KOT' | string;
  entity?: 'orders' | 'kots' | 'payments';
  data?: Record<string, unknown>;

  createdAt: string;
  retryCount: number;
  status: PosSyncStatus;
}

export interface PosMenuItem {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  price: number;
  isAvailable: boolean;
  type?: 'veg' | 'non-veg';
}

export type PosAuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ORDER_CREATED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_RECORDED'
  | 'DAY_CLOSED'
  | 'DAY_REOPENED'
  | 'MENU_CHANGED'
  | 'ITEM_DISABLED'
  | 'ITEM_ENABLED'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'SYNC_FAILED'
  | 'SYNC_RESOLVED'
  | 'SYNC_AUTH_REQUIRED'
  | 'SYNC_BLOCKED'
  | 'AUTH_REAUTH';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: PosAuditAction;
  entity: string;
  entityId: string;
  staffId?: string;
  details: Record<string, unknown>;
}

export interface BusinessDayState {
  date: string;
  restaurantId: string;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  openingFloat: number;
  actualClosingCash?: number;
}

export interface EodCashReconciliation {
  openingFloat: number;
  totalCashSales: number;
  cashExpenses: number;
  expectedClosingCash: number;
  actualClosingCash: number;
  variance: number;
}

export interface EodItemSalesRow {
  itemId: string;
  name: string;
  category: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface EodSummary {
  date: string;
  restaurantId: string;
  totalOrdersCount: number;
  walkInOrdersCount: number;
  onlineOrdersCount: number;
  grossSales: number;
  netSales: number;
  totalTaxes: number;
  totalDiscounts: number;
  paymentBreakdown: { cash: number; upi: number; online: number; card: number; other: number };
  cashReconciliation: EodCashReconciliation;
  itemSales: EodItemSalesRow[];
}

export interface HourlySalesSlot {
  slotLabel: string;
  startHour: number;
  endHour: number;
  ordersCount: number;
  salesAmount: number;
}

export interface SlowMovingItem {
  itemId: string;
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
  statusCopy: string;
}

export interface ChannelBreakdown {
  onlineOrdersCount: number;
  onlineSales: number;
  onlineAov: number;
  walkInOrdersCount: number;
  walkInSales: number;
  walkInAov: number;
  itemChannelSplits: Array<{ itemId: string; name: string; onlineCount: number; walkInCount: number }>;
}

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  bestDay: { date: string; sales: number };
  worstDay: { date: string; sales: number };
  dailyBreakdown: Array<{ date: string; sales: number; orders: number }>;
}

export interface ReconciliationValidationResult {
  isValid: boolean;
  ordersTotal: number;
  collectedPaymentsTotal: number;
  channelSumTotal: number;
  itemRevenueSumTotal: number;
  variance: number;
  hasMismatch: boolean;
  message: string;
}

export interface OwnerIntelligenceSummary {
  totalSales: number;
  totalOrders: number;
  aov: number;
  onlineVsWalkIn: {
    onlineOrders: number;
    onlineSales: number;
    walkInOrders: number;
    walkInSales: number;
  };
  paymentSplit: { cash: number; upi: number; card: number; online: number; other: number };
  expectedCash: number;
  actualCash: number;
  cashVariance: number;
  hourlySales: HourlySalesSlot[];
  peakHour: HourlySalesSlot | null;
  topSellersByVolume: Array<{ itemId: string; name: string; quantity: number; revenue: number }>;
  topSellersByRevenue: Array<{ itemId: string; name: string; quantity: number; revenue: number }>;
  slowMovingItems: {
    today: SlowMovingItem[];
    sevenDays: SlowMovingItem[];
    thirtyDays: SlowMovingItem[];
  };
  channelComparison: ChannelBreakdown;
  deterministicInsights: string[];
  todayVsYesterday: {
    salesChangePct: number;
    ordersChangePct: number;
    aovChangePct: number;
    yesterdaySales: number;
    yesterdayOrders: number;
    yesterdayAov: number;
  };
  weeklySummary: WeeklySummary;
}