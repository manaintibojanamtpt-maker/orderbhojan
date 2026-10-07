import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentScriptLoader } from '../src/features/checkout/infrastructure/paymentScriptLoader';

function fixture(existing = false) {
  const scripts: Tag[] = [];
  class Tag extends EventTarget { id = ''; src = ''; async = false; remove() { const i = scripts.indexOf(this); if (i >= 0) scripts.splice(i, 1); } }
  const doc = { getElementById: () => scripts[0] ?? null, createElement: () => new Tag(), head: { appendChild: (t: Tag) => scripts.push(t) } };
  if (existing) { const tag = new Tag(); tag.id = 'sdk'; scripts.push(tag); }
  let ready = false; let active = false;
  return { scripts, ready: () => { ready = true; }, active: () => { active = true; }, load: createPaymentScriptLoader({ id: 'sdk', src: 'https://example.test/sdk.js', document: () => doc as unknown as Document, ready: () => ready, active: () => active, timeoutMs: 15 }) };
}
test('timeout including adopted script removes tag; retry succeeds without reload', async () => {
  for (const existing of [false, true]) {
    const f = fixture(existing); const first = f.load(); const old = f.scripts[0];
    assert.equal(await first, false); assert.equal(f.scripts.length, 0);
    const next = f.load(); old.dispatchEvent(new Event('load')); // late event cannot settle next generation
    assert.equal(f.scripts.length, 1); f.ready(); f.scripts[0].dispatchEvent(new Event('load'));
    assert.equal(await next, true);
  }
});
test('concurrent callers share one attempt; error cleans up and allows retry', async () => {
  const f = fixture(); const a = f.load(); const b = f.load(); assert.equal(a, b); assert.equal(f.scripts.length, 1);
  f.scripts[0].dispatchEvent(new Event('error')); assert.deepEqual(await Promise.all([a,b]), [false,false]);
  const c = f.load(); f.ready(); f.scripts[0].dispatchEvent(new Event('load')); assert.equal(await c, true);
});
test('does not modify an active checkout', async () => {
  const f = fixture(true); f.active(); assert.equal(await f.load(), false); assert.equal(f.scripts.length, 1);
});
