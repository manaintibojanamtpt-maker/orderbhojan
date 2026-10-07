import type { CheckoutRecovery } from '@/features/checkout/infrastructure/checkoutAttempt';
export function CheckoutRecoveryView({ recovery, checking, message, onCheck, onTrack, onContinue }: {
  recovery: CheckoutRecovery | null; checking: boolean; message: string | null;
  onCheck: () => void; onTrack: () => void; onContinue: () => void;
}) {
  const state = recovery?.state ?? 'pending';
  const closed = ['confirmed', 'failed', 'expired'].includes(state);
  return <main className="mx-auto max-w-xl space-y-5 p-6 text-white" aria-live="polite">
    <h1 className="text-2xl font-semibold">{state === 'confirmed' ? 'Order confirmed' : state === 'failed' ? 'Order closed' : state === 'expired' ? 'Payment attempt expired' : 'Check your previous order'}</h1>
    <p>{closed ? 'Your previous checkout status has been checked with the kitchen system.' : 'Your order or payment may still be processing. Check its status before making another payment.'}</p>
    {message && <p role="status">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <button className="min-h-12 rounded-xl bg-orange-600 px-5 py-3" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Check order status'}</button>
      {recovery?.orderId && <button className="min-h-12 rounded-xl border px-5 py-3" onClick={onTrack}>View order</button>}
      {closed && <button className="min-h-12 rounded-xl border px-5 py-3" onClick={onContinue}>Continue shopping</button>}
    </div>
    {!closed && <p>Keep this attempt until its outcome is known. If it stays unavailable, contact support from your orders page.</p>}
  </main>;
}
