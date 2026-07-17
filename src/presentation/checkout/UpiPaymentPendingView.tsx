import { useEffect, useRef, useState } from 'react';
import { TransactionalPageShell } from '@bhojan/storefront-design-system/cart/TransactionalPageShell';
import { SoftButton } from '@bhojan/storefront-design-system/primitives/SoftButton';
import {
  buildUpiQrImageUrl,
  isMobileDevice,
  launchUpiIntent,
} from '@/features/checkout/infrastructure/upiCheckout';

export interface UpiPaymentPendingViewProps {
  readonly orderNumber: string;
  readonly amount: number;
  readonly upiUrl: string;
  readonly expiresAt?: string;
  readonly verifying: boolean;
  readonly pollMessage?: string | null;
  readonly errorMessage?: string | null;
  readonly onOpenUpi: () => void;
  readonly onCheckPayment: () => void;
  readonly onTrack: () => void;
  readonly onBrowse: () => void;
}

function formatAmount(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

function formatExpiry(expiresAt?: string): string | undefined {
  if (!expiresAt) return undefined;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return undefined;
  return new Date(expiresMs).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UpiPaymentPendingView({
  orderNumber,
  amount,
  upiUrl,
  expiresAt,
  verifying,
  pollMessage,
  errorMessage,
  onOpenUpi,
  onCheckPayment,
  onTrack,
  onBrowse,
}: UpiPaymentPendingViewProps) {
  const mobile = isMobileDevice();
  const expiryLabel = formatExpiry(expiresAt);
  const launchedRef = useRef(false);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (!mobile || launchedRef.current) return;
    launchedRef.current = true;
    const timer = window.setTimeout(() => {
      launchUpiIntent(upiUrl);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [mobile, upiUrl]);

  return (
    <TransactionalPageShell
      title="Complete UPI payment"
      subtitle={`Order #${orderNumber} · ${formatAmount(amount)} · payment pending`}
    >
      <div className="space-y-4">
        <p className="text-sm text-white/75">
          Your order is reserved but not confirmed yet. Complete payment in your UPI app. We will
          confirm only after payment is verified.
        </p>

        {expiryLabel ? (
          <p className="text-xs text-amber-200/90">Complete payment by {expiryLabel} or the order will expire.</p>
        ) : null}

        {!mobile ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="mb-3 text-sm text-white/70">Scan this QR with GPay, PhonePe, or Paytm on your phone</p>
            {!qrFailed ? (
              <img
                src={buildUpiQrImageUrl(upiUrl)}
                alt={`UPI QR code for order ${orderNumber}`}
                className="mx-auto h-[220px] w-[220px] rounded-xl bg-white p-2"
                onError={() => setQrFailed(true)}
              />
            ) : (
              <p className="text-sm text-white/60">
                QR preview unavailable. Use the UPI link below on your phone.
              </p>
            )}
            <p className="mt-3 break-all text-xs text-white/45">{upiUrl}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/70">
              Tap below if your UPI app did not open automatically.
            </p>
            <div className="mt-3">
              <SoftButton type="button" fullWidth onClick={onOpenUpi}>
                Open UPI app
              </SoftButton>
            </div>
          </div>
        )}

        {pollMessage ? (
          <p className="text-sm text-white/60" aria-live="polite">
            {pollMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <SoftButton type="button" disabled={verifying} onClick={onCheckPayment}>
            {verifying ? 'Checking payment…' : 'I have paid — check status'}
          </SoftButton>
          <SoftButton type="button" tone="secondary" onClick={onTrack}>
            View order status
          </SoftButton>
          <SoftButton type="button" tone="ghost" onClick={onBrowse}>
            Continue browsing
          </SoftButton>
        </div>
      </div>
    </TransactionalPageShell>
  );
}
