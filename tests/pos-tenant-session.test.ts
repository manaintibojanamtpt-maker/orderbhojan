/**
 * POS tenant authorization, client side.
 *
 * The properties that matter are all negative: the terminal must not bind a
 * tenant it was not given, must not invent one when the server is unreachable,
 * and must not switch on trust. Each of those has a test here, because they are
 * the failure modes a convenience feature introduces.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmTenantAuthorizedWith,
  loadAuthorizedPosTenantsWith,
  rememberActiveTenant,
  type PosTenantSessionDeps,
} from '../src/features/pos/services/posTenantSession';

/** Minimal Response stand-in: the session only reads `ok` and `json()`. */
const jsonResponse = (body: unknown, ok = true) =>
  ({
    ok,
    json: async () => body,
  }) as unknown as Response;

type Route = (url: string) => Response | null;

const depsWith = (
  routes: Record<string, Route>,
  token: string | null = 'token-abc'
): PosTenantSessionDeps => ({
  getToken: async () => token,
  request: async (url) => {
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) return handler(url);
    }
    return null;
  },
});

const listRoute = (tenants: Array<Record<string, unknown>>, uid = 'staff_1'): Route => () =>
  jsonResponse({ success: true, uid, tenants });

/**
 * The tenant session remembers the active tenant in `localStorage`. Node has no
 * DOM, so a minimal store stands in for it — enough for the read/write path the
 * service uses, and nothing more.
 */
const installLocalStorage = (): Map<string, string> => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
  return store;
};

const storage = installLocalStorage();

test('POS tenant session: fail closed', async (t) => {
  await t.test('a signed-out terminal gets no tenant', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({ '/api/v1/pos/tenants': listRoute([{ tenantId: 't1', role: 'owner' }]) }, null)
    );

    assert.equal(result.status, 'locked_out');
    assert.equal(result.reason, 'unauthenticated');
    assert.equal(
      result.tenantId,
      null,
      'no token means no tenant — there is no default to fall back on'
    );
  });

  await t.test('an account with no POS membership gets no tenant', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({ '/api/v1/pos/tenants': listRoute([]) })
    );

    assert.equal(result.status, 'locked_out');
    assert.equal(result.reason, 'no_tenants');
    assert.equal(result.tenantId, null);
  });

  await t.test('a membership with no usable role is not treated as a cashier', async () => {
    // The server drops roleless memberships, so an entry that still arrives
    // without a role must not become a usable tenant.
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({
        '/api/v1/pos/tenants': listRoute([
          { tenantId: 'tenant_x', role: '' },
          { tenantId: 'tenant_y', role: '   ' },
        ]),
      })
    );

    assert.equal(result.status, 'locked_out');
    assert.equal(result.tenantId, null);
  });

  await t.test('a malformed tenant entry never yields an empty tenant id', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({
        '/api/v1/pos/tenants': listRoute([
          { tenantId: '', role: 'owner' },
          { tenantId: '  ', role: 'manager' },
          { tenantId: 'tenant_ok', role: 'cashier' },
        ]),
      })
    );

    assert.equal(result.status, 'ready');
    assert.equal(result.tenantId, 'tenant_ok');
    assert.equal(result.tenants?.length, 1, 'only the well-formed entry survives');
  });

  await t.test('a 500 response is locked out, not treated as authorized', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({ '/api/v1/pos/tenants': () => jsonResponse({}, false) })
    );

    assert.equal(result.status, 'locked_out');
    assert.equal(result.tenantId, null);
  });

  await t.test('an unreachable server is reported as an error, not as "no tenants"', async () => {
    // The distinction matters: "error" lets the shell keep an already-bound
    // tenant and keep draining its queue, while "no_tenants" locks it out.
    const result = await loadAuthorizedPosTenantsWith({
      getToken: async () => 'token-abc',
      request: async () => {
        throw new Error('network down');
      },
    });

    assert.equal(result.status, 'locked_out');
    assert.equal(result.reason, 'error');
    assert.equal(result.tenantId, null);
  });
});

test('POS tenant session: selection', async (t) => {
  // Each selection case starts from a clean store: remembering the previous
  // case's tenant would make these assert the wrong thing.
  t.beforeEach(() => storage.clear());

  await t.test('binds the single authorized tenant', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({
        '/api/v1/pos/tenants': listRoute([
          { tenantId: 'tenant_a', role: 'owner', name: 'Biryani House' },
        ]),
      })
    );

    assert.equal(result.status, 'ready');
    assert.equal(result.tenantId, 'tenant_a');
    assert.equal(result.role, 'owner');
    assert.equal(result.tenants?.[0]?.name, 'Biryani House');
  });

  await t.test('falls back to the tenant id when the server has no name', async () => {
    const result = await loadAuthorizedPosTenantsWith(
      depsWith({
        '/api/v1/pos/tenants': listRoute([{ tenantId: 'tenant_a', role: 'cashier', name: null }]),
      })
    );

    assert.equal(result.status, 'ready');
    assert.equal(result.tenants?.[0]?.name, null, 'an unnamed tenant is still identifiable by id');
    assert.equal(result.tenantId, 'tenant_a');
  });

  await t.test('prefers the remembered tenant when the server still authorizes it', async () => {
    rememberActiveTenant('staff_remember', 'tenant_b');

    const result = await loadAuthorizedPosTenantsWith(
      depsWith(
        {
          '/api/v1/pos/tenants': listRoute(
            [
              { tenantId: 'tenant_a', role: 'owner' },
              { tenantId: 'tenant_b', role: 'manager' },
            ],
            'staff_remember'
          ),
        },
        'token-abc'
      )
    );

    assert.equal(result.tenantId, 'tenant_b', 'the previous choice is honoured');
    assert.equal(result.role, 'manager');
  });

  await t.test('ignores a remembered tenant the server no longer lists', async () => {
    rememberActiveTenant('staff_stale', 'tenant_revoked');

    const result = await loadAuthorizedPosTenantsWith(
      depsWith(
        {
          '/api/v1/pos/tenants': listRoute(
            [
              { tenantId: 'tenant_a', role: 'owner' },
              { tenantId: 'tenant_b', role: 'manager' },
            ],
            'staff_stale'
          ),
        },
        'token-abc'
      )
    );

    assert.notEqual(
      result.tenantId,
      'tenant_revoked',
      'a revoked tenant is never bound from local memory'
    );
    assert.equal(['tenant_a', 'tenant_b'].includes(result.tenantId as string), true);
  });

  await t.test('does not inherit the previous account\'s tenant', async () => {
    rememberActiveTenant('account_one', 'tenant_one');

    // account_two is genuinely authorized for tenant_two only. The remembered
    // value belongs to a different uid, so it must not carry over — even though
    // it names a real tenant.
    const result = await loadAuthorizedPosTenantsWith(
      depsWith(
        {
          '/api/v1/pos/tenants': listRoute([{ tenantId: 'tenant_two', role: 'cashier' }], 'account_two'),
        },
        'token-abc'
      )
    );

    assert.notEqual(
      result.tenantId,
      'tenant_one',
      'signing in as someone else on a shared till does not inherit their restaurant'
    );
    assert.equal(result.tenantId, 'tenant_two');
  });
});

test('POS tenant session: switching', async (t) => {
  await t.test('confirms with the server before accepting a switch', async () => {
    const seen: string[] = [];
    const deps: PosTenantSessionDeps = {
      getToken: async () => 'token-abc',
      request: async (url) => {
        seen.push(url);
        return jsonResponse({ authorized: true });
      },
    };

    assert.equal(await confirmTenantAuthorizedWith(deps, 'tenant_b'), true);
    assert.equal(seen.length, 1);
    assert.match(seen[0] as string, /\/api\/v1\/pos\/tenants\/tenant_b\/authorized/);
  });

  await t.test('refuses a switch the server does not confirm', async () => {
    const deps: PosTenantSessionDeps = {
      getToken: async () => 'token-abc',
      request: async () => jsonResponse({ authorized: false }),
    };

    assert.equal(await confirmTenantAuthorizedWith(deps, 'tenant_b'), false);
  });

  await t.test('refuses a switch when the server is unreachable', async () => {
    const deps: PosTenantSessionDeps = {
      getToken: async () => 'token-abc',
      request: async () => {
        throw new Error('offline');
      },
    };

    assert.equal(
      await confirmTenantAuthorizedWith(deps, 'tenant_b'),
      false,
      'an unconfirmed switch is refused, not attempted'
    );
  });

  await t.test('refuses an empty tenant id without calling the server', async () => {
    let called = false;
    const deps: PosTenantSessionDeps = {
      getToken: async () => 'token-abc',
      request: async () => {
        called = true;
        return jsonResponse({ authorized: true });
      },
    };

    assert.equal(await confirmTenantAuthorizedWith(deps, '   '), false);
    assert.equal(called, false);
  });

  await t.test('url-encodes the tenant so a hostile id cannot alter the path', async () => {
    const seen: string[] = [];
    const deps: PosTenantSessionDeps = {
      getToken: async () => 'token-abc',
      request: async (url) => {
        seen.push(url);
        return jsonResponse({ authorized: false });
      },
    };

    await confirmTenantAuthorizedWith(deps, 'tenant/../admin');
    assert.equal(
      (seen[0] as string).includes('tenant%2F..%2Fadmin'),
      true,
      'the tenant is encoded, so it cannot climb out of its path segment'
    );
  });

  await t.test('refuses when the session is signed out', async () => {
    const deps: PosTenantSessionDeps = {
      getToken: async () => null,
      request: async () => jsonResponse({ authorized: true }),
    };

    assert.equal(await confirmTenantAuthorizedWith(deps, 'tenant_b'), false);
  });
});