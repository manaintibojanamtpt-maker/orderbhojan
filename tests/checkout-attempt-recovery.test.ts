import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginCheckoutAttempt, readCheckoutAttempt, finishCheckoutAttempt, recordCheckoutOrder, checkoutIntentHash } from '../src/features/checkout/infrastructure/checkoutAttempt';
function storage() { const map = new Map<string,string>(); return { getItem: (k:string) => map.get(k) ?? null, setItem: (k:string,v:string) => { map.set(k,v); }, removeItem: (k:string) => { map.delete(k); } } as Storage; }
const expires = () => new Date(Date.now()+60_000).toISOString();
test('reload and account switch retain unresolved reference, without storing payment payload', async () => {
  const s = storage(); const a = await beginCheckoutAttempt('alice', { phone: 'secret', paymentMethod: 'upi' }, 100, expires(), s);
  recordCheckoutOrder('alice', a.id, 'order1', s);
  assert.equal(readCheckoutAttempt('alice', s)?.id, a.id); assert.equal(readCheckoutAttempt('bob', s), null);
  assert.ok(!JSON.stringify(readCheckoutAttempt('alice', s)).includes('secret'));
  await assert.rejects(beginCheckoutAttempt('alice', { changed: true }, 200, expires(), s), /unresolved/);
  assert.throws(() => finishCheckoutAttempt('alice', a.id, { state:'ambiguous' }, s), /unknown/);
  assert.throws(() => finishCheckoutAttempt('alice', a.id, { state:'pending' }, s), /unknown/);
  finishCheckoutAttempt('bob', a.id, { state:'confirmed' }, s); assert.ok(readCheckoutAttempt('alice', s));
  finishCheckoutAttempt('alice', a.id, { state:'confirmed' }, s); assert.equal(readCheckoutAttempt('alice', s), null);
});
test('expired new quote cannot create an attempt; item/address/payment changes alter intent', async () => {
  await assert.rejects(beginCheckoutAttempt('a', {}, 100, '2000-01-01', storage()), /expired/);
  const original = { lines:[{itemId:'a',quantity:1}], address:'flat1', paymentMethod:'upi' };
  const hash = await checkoutIntentHash(original, 100);
  for (const changed of [{...original,lines:[{itemId:'a',quantity:2}]}, {...original,address:'flat2'}, {...original,paymentMethod:'cod'}]) assert.notEqual(await checkoutIntentHash(changed,100),hash);
});
test('storage failure prevents submission rather than losing a pending order', async () => {
  const s = storage(); s.setItem = () => { throw new Error('quota'); };
  await assert.rejects(beginCheckoutAttempt('alice', {}, 100, expires(), s), /quota/);
});
