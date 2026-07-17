import { getMarketplaceApiClient } from '@/marketplace-api';

const VERIFIED_PAYMENT_STATUSES = new Set(['success', 'verified', 'paid']);
const TERMINAL_FAILURE_STATUSES = new Set(['expired', 'failed']);

export function formatUpiAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return safe.toFixed(2);
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent);
}

export function isVerifiedPaymentStatus(status: string | undefined): boolean {
  return VERIFIED_PAYMENT_STATUSES.has(String(status ?? 'pending').toLowerCase().trim());
}

export function isTerminalPaymentFailure(status: string | undefined): boolean {
  return TERMINAL_FAILURE_STATUSES.has(String(status ?? '').toLowerCase().trim());
}

/**
 * Opens the native UPI app chooser on mobile. Uses a transient anchor click instead of
 * `window.location.href` to avoid WebView handlers (e.g. WhatsApp) intercepting the URL.
 */
export function launchUpiIntent(upiUrl: string): void {
  if (typeof window === 'undefined' || !upiUrl.startsWith('upi://')) {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = upiUrl;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
  }, 0);
}

export interface OrderPaymentSnapshot {
  readonly paymentStatus: string;
  readonly orderStatus: string;
  readonly expiresAt?: string;
}

export async function fetchOrderPaymentSnapshot(params: {
  readonly orderId: string;
  readonly phone: string;
  readonly isAuthenticated: boolean;
}): Promise<OrderPaymentSnapshot> {
  const client = getMarketplaceApiClient();

  if (params.isAuthenticated) {
    const summary = await client.getOrder(params.orderId);
    return {
      paymentStatus: String(summary.paymentStatus ?? 'pending'),
      orderStatus: String(summary.status ?? 'PENDING_PAYMENT'),
      expiresAt: summary.expiresAt,
    };
  }

  const tracking = await client.getGuestTracking(params.orderId, params.phone);
  return {
    paymentStatus: String(tracking.paymentStatus ?? tracking.invoice?.paymentStatus ?? 'pending'),
    orderStatus: String(tracking.status ?? 'PENDING_PAYMENT'),
    expiresAt: tracking.expiresAt,
  };
}

export type UpiPollResult = 'verified' | 'expired' | 'timeout';

export async function pollUpiPaymentStatus(params: {
  readonly orderId: string;
  readonly phone: string;
  readonly isAuthenticated: boolean;
  readonly signal?: AbortSignal;
  readonly onTick?: (snapshot: OrderPaymentSnapshot) => void;
  readonly intervalMs?: number;
  readonly maxAttempts?: number;
}): Promise<UpiPollResult> {
  const intervalMs = params.intervalMs ?? 5_000;
  const maxAttempts = params.maxAttempts ?? 72;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error('Payment verification cancelled');
    }

    const snapshot = await fetchOrderPaymentSnapshot(params);
    params.onTick?.(snapshot);

    if (isVerifiedPaymentStatus(snapshot.paymentStatus)) {
      return 'verified';
    }

    const orderStatus = snapshot.orderStatus.toUpperCase();
    if (isTerminalPaymentFailure(snapshot.paymentStatus) || orderStatus === 'EXPIRED') {
      return 'expired';
    }

    if (snapshot.expiresAt) {
      const expiresMs = Date.parse(snapshot.expiresAt);
      if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
        return 'expired';
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs, params.signal);
    }
  }

  return 'timeout';
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new Error('Payment verification cancelled'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function buildUpiQrImageUrl(upiUrl: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(upiUrl)}`;
}
