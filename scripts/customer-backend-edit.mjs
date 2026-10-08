// Applies narrowly scoped customer changes to the authoritative sibling checkout.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('../manaintibojanam-backend');
const files = new Map();
function edit(p, fn) { files.set(p, fn(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'))); }
function replace(s,a,b) { if(!s.includes(a)) throw new Error('Backend source changed: '+a.slice(0,80)); return s.replace(a,b); }
files.set('backend-lib/marketplace/customerCheckoutAttempt.ts', `import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export function checkoutAttemptRef(db: Firestore, uid: string, id: string) {
  if (!uid || !/^[a-zA-Z0-9_-]{16,128}$/.test(id)) throw Object.assign(new Error('Authenticated checkout attempt required'), { statusCode: 400 });
  return db.collection('customer_checkout_attempts').doc(createHash('sha256').update(uid + ':' + id).digest('hex'));
}
export function checkoutRequestHash(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export async function readCheckoutReplay<T>(db: Firestore, uid: string, id: string, request: unknown): Promise<T | null> {
  const doc = await checkoutAttemptRef(db, uid, id).get();
  if (!doc.exists) return null;
  if (doc.data()?.hash !== checkoutRequestHash(request)) throw Object.assign(new Error('Checkout attempt payload conflict'), { statusCode: 409 });
  return doc.data()!.result as T;
}
/** Order/draft, counters and response journal commit in the SAME Firestore transaction. No TTL reuse. */
export async function commitCheckoutAttempt<T>(db: Firestore, uid: string, id: string, request: unknown, result: T, write: (tx: Transaction) => void): Promise<T> {
  const ref = checkoutAttemptRef(db, uid, id);
  const hash = checkoutRequestHash(request);
  return db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    if (previous.exists) {
      if (previous.data()?.hash !== hash) throw Object.assign(new Error('Checkout attempt payload conflict'), { statusCode: 409 });
      return previous.data()!.result as T;
    }
    write(tx);
    tx.create(ref, { userId: uid, hash, result, createdAt: new Date().toISOString() });
    return result;
  });
}
/** External provider calls cannot be atomic with Firestore. Never take over an ambiguous reservation. */
export async function createPaymentIntentOnce<T>(db: Firestore, draftId: string, create: () => Promise<T>): Promise<T> {
  const ref = db.collection('customer_payment_intents').doc(draftId);
  const replay = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      if (snap.data()?.state === 'complete') return snap.data()!.result as T;
      throw Object.assign(new Error('Payment intent outcome is pending. Check order status; do not pay again.'), { statusCode: 409 });
    }
    tx.create(ref, { state: 'pending', createdAt: new Date().toISOString() });
    return null;
  });
  if (replay) return replay;
  const result = await create();
  await ref.update({ state: 'complete', result });
  return result;
}
`);
edit('backend-lib/marketplace/projectCheckout.ts', s=>{
  s="import { readCheckoutReplay, commitCheckoutAttempt } from './customerCheckoutAttempt.js';\n"+s;
  s=replace(s,'export interface MarketplacePlaceRequest extends MarketplaceQuoteRequest {',`export interface MarketplacePlaceRequest extends MarketplaceQuoteRequest {
  clientAttemptId?: string;
  expectedAmountPaise?: number;
  quoteExpiresAt?: string;`);
  s=replace(s,"  if (!request.phone?.trim()) {",`  if (request.clientAttemptId) {
    const replay = await readCheckoutReplay<MarketplacePlaceResult>(db, request.userId || '', request.clientAttemptId, request);
    if (replay) return replay;
    if (!request.quoteExpiresAt || !Number.isFinite(Date.parse(request.quoteExpiresAt)) || Date.parse(request.quoteExpiresAt) <= Date.now() || Date.parse(request.quoteExpiresAt) > Date.now() + 10 * 60_000) {
      throw Object.assign(new Error('Checkout quote expired; refresh before creating an attempt'), { statusCode: 409 });
    }
  }
  if (!request.phone?.trim()) {`);
  s=replace(s,'  const docId =\n',`  if (request.clientAttemptId && (!Number.isInteger(request.expectedAmountPaise) || request.expectedAmountPaise !== Math.round(quote.grandTotal * 100))) {
    throw Object.assign(new Error('Checkout total changed; review a fresh quote'), { statusCode: 409 });
  }
  const docId =
`);
  const marker="  if (paymentMethod === 'upi') {\n    const paymentConfig";
  const a=s.indexOf(marker,s.indexOf('export async function placeMarketplaceOrder'));
  const b=s.indexOf('\n}\n\nexport function createCheckoutCorrelationId',a);
  if(a<0||b<0) throw new Error('Missing checkout write block');
  s=s.slice(0,a)+`  let result: MarketplacePlaceResult;
  const extra: Record<string, unknown> = {};
  if (paymentMethod === 'upi') {
    const providers = ((tenantRaw.paymentConfig as any)?.providers ?? {});
    const upiId = providers.upi?.upiId;
    if (!upiId || !isValidUpiId(upiId)) throw Object.assign(new Error('Direct UPI is not configured for this kitchen'), { statusCode: 400 });
    const expiresAt = new Date(Date.now() + UPI_PAYMENT_EXPIRY_MS).toISOString();
    extra.expiresAt = expiresAt;
    const upiUrl = buildUpiPayUrl({ upiId, merchantName: providers.upi?.merchantName || tenantRaw.name || 'Merchant', amount: quote.grandTotal, orderId: docId, transactionNote: 'OrderBhojan #' + orderNumber });
    result = { kind: 'upi', orderId: docId, orderNumber, tenantId, quote, upiUrl, paymentStatus: 'pending', expiresAt };
  } else if (paymentMethod === 'razorpay') {
    extra.amountInPaise = Math.round(quote.grandTotal * 100);
    result = { kind: 'razorpay', draftId: docId, orderNumber, tenantId, quote, amountInPaise: Number(extra.amountInPaise) };
  } else result = { kind: 'cod', orderId: docId, orderNumber, tenantId, quote };
  const write = (tx: import('firebase-admin/firestore').Transaction) => {
    tx.create(db.collection(paymentMethod === 'razorpay' ? 'order_drafts' : 'orders').doc(docId), {
      ...orderPayload, ...extra,
      customerAttemptId: request.clientAttemptId ?? null,
      createdAt: fieldValue.serverTimestamp(), updatedAt: fieldValue.serverTimestamp(),
    });
    if (paymentMethod !== 'razorpay') for (const item of orderItems) {
      if (item.menuItemId) tx.update(db.collection('menu').doc(item.menuItemId), { itemOrderCount: fieldValue.increment(item.quantity) });
    }
  };
  if (request.clientAttemptId) return commitCheckoutAttempt(db, request.userId || '', request.clientAttemptId, request, result, write);
  // Backward-compatible legacy client, with atomic order/counter writes as well.
  await db.runTransaction(async tx => { write(tx); });
  return result;`+s.slice(b);
  return s;
});
edit('backend-lib/marketplace/marketplaceRoutes.ts',s=>{
  s="import { checkoutAttemptRef } from './customerCheckoutAttempt.js';\n"+s;
  return replace(s,'  if (verifyFirebaseToken) {\n    app.get(`${prefix}/orders`,',`  if (verifyFirebaseToken) {
    app.get(\`\${prefix}/checkout/attempts/:attemptId\`, verifyFirebaseToken, async (req: any, res: Response) => {
      try {
        const record = await checkoutAttemptRef(db, req.user.uid, String(req.params.attemptId)).get();
        if (!record.exists) return res.status(404).json({ ok: false, error: { code: 'ATTEMPT_UNKNOWN', message: 'Attempt outcome is unknown. Do not place another order yet.', retryable: false } });
        const result = record.data()!.result;
        const orderId = result.orderId || result.draftId;
        const order = await db.collection('orders').doc(orderId).get();
        const draft = !order.exists ? await db.collection('order_drafts').doc(orderId).get() : order;
        const raw = draft.data();
        if (!raw || raw.userId !== req.user.uid) return res.status(409).json({ ok: false, error: { code: 'ATTEMPT_UNKNOWN', message: 'Order status is unavailable', retryable: false } });
        const payment = String(raw.paymentStatus || '').toLowerCase();
        const status = String(raw.status || '').toLowerCase();
        const paid = ['paid', 'verified', 'success', 'captured'].includes(payment);
        const terminal = ['cancelled', 'canceled', 'failed', 'expired'].includes(status);
        // Payment failure alone does not close an order or prove a late payment impossible.
        const state = paid ? 'confirmed' : terminal ? (status === 'expired' ? 'expired' : 'failed') : result.kind === 'cod' ? 'confirmed' : 'pending';
        sendMarketplaceJson(res, success({ state, orderId, orderNumber: result.orderNumber, paymentMethod: result.kind, paymentStatus: payment, expiresAt: result.expiresAt }));
      } catch (error: any) {
        res.status(error.statusCode || 500).json({ ok: false, error: { code: 'RECOVERY_FAILED', message: error.message, retryable: false } });
      }
    });
    app.get(\`\${prefix}/orders\`,`);
});
edit('backend-lib/shared/idempotency.ts',s=>replace(s,'    if (ORDER_COMMAND_PATH.test(req.path)) {',`    // Customer checkout owns the journal atomically with order creation; mounted /api paths may be relative.
    if (ORDER_COMMAND_PATH.test(req.path) || /^(?:\\/api)?\\/marketplace\\/checkout\\/place$/.test(req.path)) {`));
edit('server.ts',s=>{
  s="import { createPaymentIntentOnce } from './backend-lib/marketplace/customerCheckoutAttempt.js';\n"+s;
  s=replace(s,'        if (!isRazorpayDraftBindEnforced()) {',"        if (!draftDocData.customerAttemptId && !isRazorpayDraftBindEnforced()) {");
  s=replace(s,'    const order = await razorpay.orders.create(options);',`    const order = draftId
      ? await createPaymentIntentOnce(_db, String(draftId), () => razorpay.orders.create(options))
      : await razorpay.orders.create(options);`);
  return s;
});
// All anchors validated before any write. Existing unrelated Phase A/B changes are retained.
for (const [p,s] of files) fs.writeFileSync(path.join(root,p),s);
console.log('Updated customer checkout only:', [...files.keys()].join(', '));
