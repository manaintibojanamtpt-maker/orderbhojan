import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketplaceHttpClient } from '../src/marketplace-api/client';

const client = (overrides = {}) => new MarketplaceHttpClient({ baseUrl: 'https://example.test', apiVersion: '1', timeoutMs: 35, retryAttempts: 3, retryDelayMs: 100, ...overrides });
const stalled = () => new Promise<never>(() => {});
const good = () => Promise.resolve(new Response(JSON.stringify({ ok: true, value: 'recovered' }), { headers: { 'Content-Type': 'application/json' } }));

test('deadline bounds fetch even with an external signal and a non-cooperative transport', async t => {
  t.mock.method(globalThis, 'fetch', stalled);
  await assert.rejects(client().request({ path: '/', signal: new AbortController().signal }), { code: 'TIMEOUT' });
});
test('deadline bounds token acquisition and does not send after a late token', async t => {
  let resolve!: (token: string) => void;
  const fetch = t.mock.method(globalThis, 'fetch', good);
  await assert.rejects(client({ getAuthToken: () => new Promise<string>(r => { resolve = r; }) }).request({ path: '/' }), { code: 'TIMEOUT' });
  resolve('late'); await new Promise(r => setTimeout(r, 5));
  assert.equal(fetch.mock.callCount(), 0);
});
test('deadline bounds response parsing', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: stalled }) as Response);
  await assert.rejects(client().request({ path: '/' }), { code: 'TIMEOUT' });
});
test('caller cancellation interrupts backoff and never retries', async t => {
  const abort = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async () => { setTimeout(() => abort.abort(), 5); throw new TypeError('Failed to fetch'); });
  await assert.rejects(client({ timeoutMs: 1000 }).request({ path: '/', signal: abort.signal }), { code: 'CANCELLED' });
  assert.equal(fetch.mock.callCount(), 1);
});
test('GET recovers within one budget; mutating requests never auto-retry', async t => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, 'fetch', () => ++calls === 1 ? Promise.reject(new TypeError('network')) : good());
  assert.equal(await client({ timeoutMs: 1000, retryDelayMs: 1 }).request({ path: '/' }), 'recovered');
  assert.equal(fetch.mock.callCount(), 2);
  calls = 0;
  await assert.rejects(client().request({ path: '/', method: 'POST', body: {} }), { code: 'NETWORK_ERROR' });
  assert.equal(calls, 1);
});
test('pre-aborted caller never authenticates or fetches', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', good);
  await assert.rejects(client().request({ path: '/', signal: AbortSignal.abort() }), { code: 'CANCELLED' });
  assert.equal(fetch.mock.callCount(), 0);
});
