export interface CheckoutAttemptReference {
  readonly version: 1;
  readonly id: string;
  readonly intentHash: string;
  readonly createdAt: number;
  readonly quoteExpiresAt: string;
  readonly orderId?: string;
}
export interface CheckoutRecovery {
  readonly state: 'pending' | 'confirmed' | 'failed' | 'expired' | 'ambiguous';
  readonly orderId?: string;
  readonly orderNumber?: string | number;
  readonly paymentMethod?: string;
}
const key = (uid: string) => `ob-checkout-attempt-v1:${encodeURIComponent(uid)}`;

export function readCheckoutAttempt(uid: string, storage: Storage = localStorage): CheckoutAttemptReference | null {
  const raw = storage.getItem(key(uid));
  if (!raw) return null;
  const value = JSON.parse(raw) as CheckoutAttemptReference;
  // Corrupt state is a recovery problem, never permission to create a second order.
  if (value.version !== 1 || !value.id || !value.intentHash || !value.quoteExpiresAt) throw new Error('Saved checkout needs support. Do not place another order yet.');
  return value;
}

export async function checkoutIntentHash(payload: Record<string, unknown>, expectedAmountPaise: number): Promise<string> {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
  };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical({ ...payload, expectedAmountPaise }))));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function beginCheckoutAttempt(uid: string, payload: Record<string, unknown>, amount: number, quoteExpiresAt: string, storage: Storage = localStorage): Promise<CheckoutAttemptReference> {
  if (!uid) throw new Error('Sign in before ordering');
  if (readCheckoutAttempt(uid, storage)) throw new Error('A previous checkout is unresolved. Check order status before ordering again.');
  if (!Number.isFinite(Date.parse(quoteExpiresAt)) || Date.parse(quoteExpiresAt) <= Date.now()) throw new Error('Quote expired. Refresh checkout.');
  const attempt: CheckoutAttemptReference = { version: 1, id: crypto.randomUUID(), intentHash: await checkoutIntentHash(payload, amount), createdAt: Date.now(), quoteExpiresAt };
  storage.setItem(key(uid), JSON.stringify(attempt)); // Fail closed when persistence is unavailable.
  return attempt;
}

export function recordCheckoutOrder(uid: string, attemptId: string, orderId: string, storage: Storage = localStorage): void {
  const current = readCheckoutAttempt(uid, storage);
  if (current?.id === attemptId) storage.setItem(key(uid), JSON.stringify({ ...current, orderId }));
}

/** Only an authoritative confirmed/closed result permits replacing an attempt. */
export function finishCheckoutAttempt(uid: string, attemptId: string, recovery: CheckoutRecovery, storage: Storage = localStorage): void {
  if (!['confirmed', 'failed', 'expired'].includes(recovery.state)) throw new Error('Checkout outcome is still unknown');
  if (readCheckoutAttempt(uid, storage)?.id === attemptId) storage.removeItem(key(uid));
}

export async function withCheckoutLock<T>(uid: string, run: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Safe checkout is unavailable in this browser. Update the app or contact support.');
  return navigator.locks.request(key(uid), { mode: 'exclusive' }, run);
}
