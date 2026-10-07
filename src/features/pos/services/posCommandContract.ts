/**
 * Client-side mirror of the BhojanOS order Command API vocabulary.
 *
 * Deliberately duplicated rather than imported from the backend so the POS
 * bundle never pulls in server code. `tests/pos-command-contract.test.ts`
 * asserts this list stays in sync with the server contract file.
 */

export const ORDER_COMMAND_TYPES = [
  'CreateOrder',
  'AcceptOrder',
  'RejectOrder',
  'MarkPreparing',
  'MarkReady',
  'UpdateOrderStatus',
  'RecordPayment',
  'CreateKot',
] as const;

export type OrderCommandType = (typeof ORDER_COMMAND_TYPES)[number];

export const isOrderCommandType = (value: unknown): value is OrderCommandType =>
  typeof value === 'string' && (ORDER_COMMAND_TYPES as readonly string[]).includes(value);

/** Payment methods staff may record by hand. Gateway methods are excluded. */
export const STAFF_RECORDED_PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'UPI_MANUAL',
  'CHEQUE',
  'BANK_TRANSFER',
] as const;

export type StaffRecordedPaymentMethod = (typeof STAFF_RECORDED_PAYMENT_METHODS)[number];

/** Methods whose success may only be declared by a verified provider webhook. */
export const PROVIDER_VERIFIED_PAYMENT_METHODS = [
  'RAZORPAY',
  'ONLINE',
  'UPI_GATEWAY',
  'CARD_GATEWAY',
  'NETBANKING',
  'WALLET',
] as const;

export interface OrderCommandRequest {
  commandId: string;
  type: OrderCommandType;
  tenantId: string;
  orderId: string;
  deviceId?: string;
  clientSequence: number;
  clientTime: string;
  /**
   * Optimistic precondition against `orders/{orderId}.version`.
   *
   * Omitted for `CreateOrder` (a new order has no prior version) and omitted
   * whenever the POS has no confirmed version to assert.
   *
   * Two distinct retry situations share this field and must not be conflated:
   *  - *Transport retry* — resend byte-identical, keeping `expectedVersion`.
   *    The server replays the committed receipt.
   *  - *Revised command after CONCURRENCY_CONFLICT* — keep the same
   *    `commandId`, replace `expectedVersion` with the `currentVersion` the
   *    server reported. No receipt was pinned for the conflict, so the revision
   *    is a legitimate retry rather than a key reused for different work.
   */
  expectedVersion?: number;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface OrderCommandAck {
  success: boolean;
  commandId: string;
  tenantId: string;
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  version: number;
  executedAt: string;
  replayed?: boolean;
  correlationId?: string;
  eventId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    currentVersion?: number;
    currentOrderStatus?: string;
  };
}