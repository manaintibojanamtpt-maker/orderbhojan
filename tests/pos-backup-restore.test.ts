/**
 * Restore: the operation that can destroy a day's trading data.
 *
 * Each test here corresponds to a way the previous implementation could quietly
 * lose or cross-contaminate data. The assertions are about what survives and
 * what is refused, not about internals.
 */

import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { posDb } from '../src/features/pos/db/posDatabase';
import {
  backupService,
  migrateBackup,
  POS_BACKUP_VERSION,
  type PosBackupData,
  type RestoreSyncHooks,
} from '../src/features/pos/services/backupService';
import type { AuditLogEntry, BusinessDayState, PosOrder, SyncQueueItem } from '../src/features/pos/domain/pos.types';

const TENANT = 'rst_restore_test';
const OTHER_TENANT = 'rst_someone_else';

const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const seedOrder = async (tenantId: string, orderId: string): Promise<void> => {
  await posDb.orders.put({
    id: orderId,
    restaurantId: tenantId,
    customer: { name: 'Test', phone: '' },
    items: [],
    pricing: { subtotal: 0, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 0 },
    timestamps: { createdAt: new Date().toISOString() },
  } as unknown as PosOrder);
};

const seedQueue = async (tenantId: string, id: string, status: SyncQueueItem['status']) => {
  const item = {
    id,
    tenantId,
    action: 'CREATE_ORDER',
    entity: 'orders',
    entityType: 'ORDER',
    operation: 'CREATE',
    entityId: 'order_1',
    orderId: 'order_1',
    payload: {},
    data: {},
    createdAt: new Date().toISOString(),
    clientSequence: 1,
    orderSequence: 1,
    retryCount: 0,
    status,
    ...(status === 'SYNCED' ? { acknowledgedAt: Date.now() } : {}),
  } as unknown as SyncQueueItem;
  await posDb.syncQueue.put(item);
  return item;
};

const credential = { verifiedBy: 'owner-uid-1', method: 'admin-session' } as const;

/** A hooks double that records the pause/resume order a restore must follow. */
const recordingHooks = (log: string[]): RestoreSyncHooks => ({
  pauseSync: async () => {
    log.push('paused');
  },
  resumeSync: async () => {
    log.push('resumed');
  },
});

test('backup migration', async (t) => {
  await t.test('reads the current version unchanged', () => {
    const source: PosBackupData = {
      version: POS_BACKUP_VERSION,
      timestamp: '2026-01-01T00:00:00.000Z',
      restaurantId: TENANT,
      orders: [],
      menu: [],
      kots: [],
      payments: [],
      syncQueue: [],
      auditLogs: [],
      businessDayState: [],
    };
    const migrated = migrateBackup(source);
    assert.equal(migrated?.version, POS_BACKUP_VERSION);
    assert.equal(migrated?.restaurantId, TENANT);
  });

  await t.test('brings a v1 backup forward instead of discarding it', () => {
    const migrated = migrateBackup({
      version: 1,
      timestamp: '2025-06-01T00:00:00.000Z',
      restaurantId: TENANT,
      orders: [{ id: 'o1' }],
      menu: [],
      kots: [],
      payments: [],
      syncQueue: [],
      // No auditLogs or businessDayState in a v1 export.
    });
    assert.ok(migrated, 'a v1 backup is still readable');
    assert.equal(migrated?.version, POS_BACKUP_VERSION);
    assert.deepEqual(migrated?.auditLogs, [], 'the missing table migrates to empty, not undefined');
    assert.deepEqual(migrated?.businessDayState, []);
    assert.equal(migrated?.orders.length, 1);
  });

  await t.test('refuses a version this build cannot read', () => {
    assert.equal(migrateBackup({ version: 99, orders: [] }), null);
    assert.equal(migrateBackup({ version: 0, orders: [] }), null);
    assert.equal(migrateBackup({ orders: [] }), null, 'a file with no version is not a backup');
    assert.equal(migrateBackup(null), null);
    assert.equal(migrateBackup('a string'), null);
  });

  await t.test('tolerates a missing table rather than throwing', () => {
    const migrated = migrateBackup({ version: 2, restaurantId: TENANT });
    assert.ok(migrated);
    for (const key of ['orders', 'menu', 'kots', 'payments', 'syncQueue', 'auditLogs'] as const) {
      assert.deepEqual(migrated?.[key], [], `${key} migrates to an empty array`);
    }
  });
});

test('backup export is tenant-scoped', async () => {
  await seedOrder(TENANT, `own_${uniqueSuffix()}`);
  await seedOrder(OTHER_TENANT, `other_${uniqueSuffix()}`);

  const backup = await backupService.createBackup(TENANT, false);

  assert.equal(backup.restaurantId, TENANT);
  assert.equal(
    backup.orders.every((order) => order.restaurantId === TENANT),
    true,
    'a backup never embeds another restaurant\'s orders'
  );
  assert.equal(
    backup.orders.some((order) => order.restaurantId === OTHER_TENANT),
    false
  );
});

test('restore refuses rather than guessing', async (t) => {
  await t.test('refuses without a verified credential', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    const result = await backupService.restoreBackup(
      backup,
      { verifiedBy: '', method: 'supervisor-pin' },
      TENANT
    );
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'UNAUTHORIZED');
  });

  await t.test('refuses a file that is not a backup', async () => {
    const result = await backupService.restoreBackup({ hello: 'world' }, credential, TENANT);
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'INVALID_FILE');
  });

  await t.test('refuses an unreadable version with an explanation', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    const result = await backupService.restoreBackup(
      { ...backup, version: POS_BACKUP_VERSION + 3 },
      credential,
      TENANT
    );
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'UNSUPPORTED_VERSION');
    assert.match(result.message, /version/i);
  });

  await t.test('refuses a backup from another restaurant', async () => {
    const backup = await backupService.createBackup(OTHER_TENANT, false);
    const result = await backupService.restoreBackup(backup, credential, TENANT);

    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'TENANT_MISMATCH');
    assert.match(result.message, /another restaurant|belongs to/i);
  });

  await t.test('refuses a backup that does not say which restaurant it is', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    const result = await backupService.restoreBackup(
      { ...backup, restaurantId: '' },
      credential,
      TENANT
    );
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'TENANT_MISMATCH');
  });

  await t.test('refuses when the terminal has no authorized tenant bound', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    const result = await backupService.restoreBackup(backup, credential, '');
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, 'INVALID_FILE');
    assert.match(result.message, /authorized restaurant/i);
  });

  await t.test('refuses while queued work is unacknowledged', async () => {
    const pendingId = `sync_pending_${uniqueSuffix()}`;
    await seedQueue(TENANT, pendingId, 'PENDING');

    try {
      const backup = await backupService.createBackup(TENANT, false);
      const result = await backupService.restoreBackup(backup, credential, TENANT);
      assert.equal(result.success, false);
      assert.equal(!result.success && result.code, 'UNSYNCED_WORK');
      assert.match(result.message, /not yet confirmed/i);
    } finally {
      await posDb.syncQueue.delete(pendingId);
    }
  });
});

test('restore preserves data and identity', async (t) => {
  await t.test('pauses sync before touching a table and resumes afterwards', async () => {
    const log: string[] = [];
    const backup = await backupService.createBackup(TENANT, false);

    const result = await backupService.restoreBackup(
      backup,
      credential,
      TENANT,
      recordingHooks(log)
    );

    assert.equal(result.success, true);
    assert.deepEqual(log, ['paused', 'resumed'], 'the queue must be paused for the whole restore');
  });

  await t.test('resumes sync even when the restore fails', async () => {
    const log: string[] = [];
    const hooks: RestoreSyncHooks = {
      pauseSync: async () => {
        log.push('paused');
      },
      resumeSync: async () => {
        log.push('resumed');
      },
    };

    // Force a failure by handing the transaction data it cannot accept.
    const broken = {
      ...(await backupService.createBackup(TENANT, false)),
      orders: [{ id: null } as unknown as PosOrder],
    };

    await backupService.restoreBackup(broken, credential, TENANT, hooks).catch(() => undefined);
    assert.deepEqual(
      log,
      ['paused', 'resumed'],
      'a failed restore must not leave the POS permanently paused'
    );
  });

  await t.test('keeps acknowledged queue entries that the file does not contain', async () => {
    // The backup is taken first, so the entry below does not exist in it. This
    // is the real-world case: a command acknowledged after the file was exported.
    const backup = await backupService.createBackup(TENANT, false);
    const localId = `sync_local_${uniqueSuffix()}`;
    await seedQueue(TENANT, localId, 'SYNCED');

    try {
      assert.equal(
        backup.syncQueue.some((item) => item.id === localId),
        false,
        'precondition: the backup predates this command'
      );

      const result = await backupService.restoreBackup(backup, credential, TENANT);
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.summary.preservedQueueEntries, 1);

      const after = await posDb.syncQueue.get(localId);
      assert.ok(after, 'a command acknowledged after the backup was taken is not discarded');
      assert.equal(after?.status, 'SYNCED');
    } finally {
      await posDb.syncQueue.delete(localId);
    }
  });

  await t.test('does not let a stale file entry resurrect an acknowledged command', async () => {
    const id = `sync_stale_${uniqueSuffix()}`;
    const stale = await seedQueue(TENANT, id, 'PENDING');
    const backup = await backupService.createBackup(TENANT, false);

    // The command is acknowledged locally after the backup was taken.
    await posDb.syncQueue.update(id, { status: 'SYNCED', acknowledgedAt: Date.now() });

    try {
      const result = await backupService.restoreBackup(backup, credential, TENANT);
      assert.equal(result.success, true);

      const after = await posDb.syncQueue.get(id);
      assert.equal(
        after?.status,
        'SYNCED',
        'the local acknowledgement wins over the file\'s stale PENDING copy, so the command is not re-sent'
      );
      assert.equal(after?.acknowledgedAt !== undefined, true);
      assert.equal(stale.status, 'PENDING', 'the file genuinely did contain a stale PENDING copy');
    } finally {
      await posDb.syncQueue.delete(id);
    }
  });

  await t.test('restores the audit log rather than emptying it', async () => {
    const markerId = `audit_restore_${uniqueSuffix()}`;
    const backup = await backupService.createBackup(TENANT, false);
    // `logAudit` records the tenant in `entityId`, which is how the export scopes
    // this table — an audit row carries no tenant column of its own.
    backup.auditLogs = [
      {
        id: markerId,
        timestamp: new Date().toISOString(),
        action: 'BACKUP_CREATED',
        entity: 'database',
        entityId: TENANT,
        details: { seededBy: 'restore-test' },
      } as unknown as AuditLogEntry,
    ];

    const result = await backupService.restoreBackup(backup, credential, TENANT);
    assert.equal(result.success, true);

    const restored = await posDb.auditLogs.get(markerId);
    assert.ok(restored, 'the audit trail survives a restore');
    assert.equal(restored?.details?.seededBy, 'restore-test');
  });

  await t.test('restores business day state so a closed day stays closed', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    const date = '2026-02-02';
    // `businessDayState` is keyed by date and records closure as a boolean.
    backup.businessDayState = [
      {
        date,
        restaurantId: TENANT,
        isClosed: true,
        closedAt: new Date().toISOString(),
        closedBy: 'manager-1',
      } as unknown as BusinessDayState,
    ];

    const result = await backupService.restoreBackup(backup, credential, TENANT);
    assert.equal(result.success, true);

    const state = await posDb.getBusinessDayState(TENANT, date);
    assert.equal(state?.isClosed, true, 'restore does not reopen a day the manager closed');
  });

  await t.test('records who restored, and how they were verified', async () => {
    const backup = await backupService.createBackup(TENANT, false);
    await backupService.restoreBackup(
      backup,
      { verifiedBy: 'owner-uid-9', method: 'supervisor-pin' },
      TENANT,
      undefined,
      'operator-name'
    );

    const entries = (await posDb.auditLogs.toArray()).filter(
      (entry) => entry.action === 'BACKUP_RESTORED' && entry.entityId === TENANT
    );

    const latest = entries[entries.length - 1];
    assert.ok(latest, 'the restore itself is audited');
    assert.equal(latest?.details?.method, 'supervisor-pin');
    assert.equal(latest?.details?.restoredBy, 'operator-name');
  });
});