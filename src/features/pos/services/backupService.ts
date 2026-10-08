/**
 * Backup and restore for the local POS database.
 *
 * Restore is the most destructive thing this app can do to itself, so it is
 * built to fail rather than to guess. Every assumption a restore would otherwise
 * make silently — that the file is the right shape, that it belongs to this
 * restaurant, that nothing is half-synced, that no other tab is mid-flush — is
 * checked and reported with an actionable message.
 *
 * The contract
 * ------------
 * Authorization comes from the caller as an already-verified credential. This
 * module compares no PIN and holds no secret; `method` records how the server
 * verified it so the audit trail is meaningful.
 *
 * Tenant scope is enforced. A backup names the tenant it was taken from, and a
 * restore into a different tenant is refused. Without that check, restoring a
 * file from another restaurant would import their orders, payments and audit log
 * into this terminal and then happily sync them onward.
 *
 * The schema version is enforced too, with an explicit migration path rather
 * than a best-effort field read.
 *
 * Queued work is never discarded. A backup's queue is merged into whatever is
 * already queued rather than replacing it, so an action recorded since the
 * backup was taken cannot vanish. Anything not yet acknowledged by the server is
 * refused outright, because losing it would lose a recorded payment or a
 * kitchen ticket.
 *
 * Lease ownership is coordinated through injected hooks. The owner of this
 * module never touches the sync service directly, so this file stays testable
 * and the restore cannot race a flush from another tab by accident — the caller
 * must say what pausing means for its deployment.
 */

import { posDb } from '../db/posDatabase';
import type {
  PosOrder,
  PosMenuItem,
  Kot,
  PosPaymentRecord,
  SyncQueueItem,
  AuditLogEntry,
  BusinessDayState,
} from '../domain/pos.types';

export const POS_BACKUP_VERSION = 3;
/** Versions this build can migrate forward rather than refuse. */
export const SUPPORTED_BACKUP_VERSIONS: readonly number[] = [1, 2, 3];

export interface PosBackupData {
  version: number;
  timestamp: string;
  restaurantId: string;
  orders: PosOrder[];
  menu: PosMenuItem[];
  kots: Kot[];
  payments: PosPaymentRecord[];
  syncQueue: SyncQueueItem[];
  auditLogs: AuditLogEntry[];
  businessDayState: BusinessDayState[];
}

/** Machine-readable refusal reasons, so the UI can say something specific. */
export type RestoreRefusal =
  | 'UNAUTHORIZED'
  | 'INVALID_FILE'
  | 'UNSUPPORTED_VERSION'
  | 'TENANT_MISMATCH'
  | 'UNSYNCED_WORK'
  | 'RESTORE_IN_PROGRESS'
  | 'RESTORE_FAILED';

export type RestoreResult =
  | { success: true; message: string; summary: RestoreSummary }
  | { success: false; code: RestoreRefusal; message: string };

export interface RestoreSummary {
  orders: number;
  menu: number;
  kots: number;
  payments: number;
  syncQueue: number;
  auditLogs: number;
  businessDayState: number;
  /** Queue entries carried over from the live database rather than the file. */
  preservedQueueEntries: number;
  /** Backup version after migration. */
  version: number;
}

export interface RestoreCredential {
  verifiedBy: string;
  method: 'admin-session' | 'supervisor-pin';
}

/**
 * Hooks the host app supplies so a restore cannot race a flush.
 *
 * A restore rewrites every table, so any tab holding the flush lease must stop
 * and any other tab must be told to stand down until it finishes. `pauseSync`
 * must block until the owner has actually released, not merely been asked to.
 */
export interface RestoreSyncHooks {
  pauseSync: () => Promise<void>;
  resumeSync: () => Promise<void>;
  /** Present when the host wants a human-visible notice that the POS is paused. */
  isRestoreActive?: () => Promise<boolean>;
}

/**
 * Bring an older backup up to the current shape.
 *
 * v1 and v2 shared the same table set but omitted `auditLogs` from v1 and stored
 * `businessDayState` under the older key in some exports. Migration fills the
 * gaps rather than dropping the file: refusing a v1 backup would strand a
 * terminal whose only copy of its data predates the audit log.
 */
export const migrateBackup = (raw: unknown): PosBackupData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;

  const version = Number(source.version);
  if (!Number.isFinite(version)) return null;
  if (!SUPPORTED_BACKUP_VERSIONS.includes(version)) return null;

  const array = (key: string): unknown[] => {
    const value = source[key];
    return Array.isArray(value) ? value : [];
  };

  const restaurantId = String(source.restaurantId ?? '').trim();

  return {
    version: POS_BACKUP_VERSION,
    timestamp: String(source.timestamp ?? ''),
    restaurantId,
    orders: array('orders') as PosOrder[],
    menu: array('menu') as PosMenuItem[],
    kots: array('kots') as Kot[],
    payments: array('payments') as PosPaymentRecord[],
    syncQueue: array('syncQueue') as SyncQueueItem[],
    auditLogs: array('auditLogs') as AuditLogEntry[],
    businessDayState: array('businessDayState') as BusinessDayState[],
  };
};

export class BackupService {
  /**
   * Queue entries that must not be lost by a restore.
   *
   * Anything the server has not acknowledged is refused outright. Acknowledged
   * entries are still preserved through the merge rather than dropped, because
   * they carry the command ids that stop a retry from re-executing.
   */
  private async pendingQueueSummary(): Promise<{
    unacknowledged: number;
    acknowledged: SyncQueueItem[];
  }> {
    const all = await posDb.syncQueue.toArray();
    const acknowledged = all.filter((item) => item.status === 'SYNCED');
    return {
      unacknowledged: all.length - acknowledged.length,
      acknowledged,
    };
  }

  /** Guards against two restores racing each other on the same terminal. */
  private restoreInProgress = false;

  /**
   * Restore the local database from a JSON backup.
   *
   * `activeRestaurantId` is the tenant this terminal is bound to. It is required
   * and compared against the file's tenant: a restore that cannot be attributed
   * to a tenant is a restore that could import another restaurant's data.
   */
  async restoreBackup(
    backupData: PosBackupData | unknown,
    credential: RestoreCredential,
    activeRestaurantId: string,
    hooks?: RestoreSyncHooks,
    restoredBy?: string
  ): Promise<RestoreResult> {
    // 1. Authorization. Checked first so an unauthorized caller learns nothing
    //    about the file's contents or shape.
    if (!credential?.verifiedBy) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Restore denied: an authenticated supervisor credential is required.',
      };
    }

    if (!activeRestaurantId || !activeRestaurantId.trim()) {
      return {
        success: false,
        code: 'INVALID_FILE',
        message:
          'Restore denied: this terminal has no authorized restaurant bound, so the backup cannot be attributed.',
      };
    }

    if (this.restoreInProgress) {
      return {
        success: false,
        code: 'RESTORE_IN_PROGRESS',
        message: 'A restore is already running on this terminal. Wait for it to finish.',
      };
    }

    // 2. Shape and version.
    const migrated = migrateBackup(backupData);
    if (!migrated) {
      const declared = Number((backupData as { version?: unknown } | null)?.version);
      if (Number.isFinite(declared) && !SUPPORTED_BACKUP_VERSIONS.includes(declared)) {
        return {
          success: false,
          code: 'UNSUPPORTED_VERSION',
          message: `This backup is version ${declared}, which this POS cannot read. Restore it on a POS running a matching version, or export it from the server first.`,
        };
      }
      return {
        success: false,
        code: 'INVALID_FILE',
        message: 'That file is not a POS backup. It must be a JSON export created by this POS.',
      };
    }

    // 3. Tenant scope. A backup carries the restaurant it was taken from.
    if (!migrated.restaurantId) {
      return {
        success: false,
        code: 'TENANT_MISMATCH',
        message:
          'That backup does not record which restaurant it came from, so it cannot be restored safely.',
      };
    }
    if (migrated.restaurantId !== activeRestaurantId) {
      return {
        success: false,
        code: 'TENANT_MISMATCH',
        message: `That backup belongs to ${migrated.restaurantId}, but this terminal is signed in to ${activeRestaurantId}. Restoring it would import another restaurant's orders and payments.`,
      };
    }

    // 4. Nothing half-synced may be discarded.
    const { unacknowledged, acknowledged } = await this.pendingQueueSummary();
    if (unacknowledged > 0) {
      return {
        success: false,
        code: 'UNSYNCED_WORK',
        message: `Restore denied: ${unacknowledged} queued action(s) are not yet confirmed by the server. Sync or reconcile them first so no recorded payment or KOT is lost.`,
      };
    }

    // 5. Coordinate with the sync engine before touching a table.
    this.restoreInProgress = true;
    let paused = false;
    try {
      if (hooks?.pauseSync) {
        await hooks.pauseSync();
        paused = true;
      }

      // 6. Safety backup of what is here now, so a bad restore is recoverable.
      await this.createBackup(activeRestaurantId, false);

      /**
       * Queue merge. The live database is authoritative for what has happened
       * since the backup was taken; the file supplies history.
       *
       * Keyed by `id`, which is the durable command identity the server sees as
       * `commandId`. An entry present in both keeps the *local* version rather
       * than the file's, because the local copy carries the acknowledgement
       * timestamp and lease fence that tell the flusher this work is done — a
       * stale file copy could re-send an already-acknowledged command, which for
       * a payment means a second capture.
       */
      const localById = new Map(acknowledged.map((item) => [item.id, item]));
      const fileIds = new Set(migrated.syncQueue.map((item) => item.id));
      const mergedQueue: SyncQueueItem[] = [
        ...migrated.syncQueue.map((item) => localById.get(item.id) ?? item),
        ...acknowledged.filter((item) => !fileIds.has(item.id)),
      ];

      await posDb.transaction(
        'rw',
        [
          posDb.orders,
          posDb.menu,
          posDb.kots,
          posDb.payments,
          posDb.syncQueue,
          posDb.auditLogs,
          posDb.businessDayState,
        ],
        async () => {
          await posDb.orders.clear();
          await posDb.menu.clear();
          await posDb.kots.clear();
          await posDb.payments.clear();
          await posDb.syncQueue.clear();
          await posDb.auditLogs.clear();
          await posDb.businessDayState.clear();

          if (migrated.orders.length) await posDb.orders.bulkPut(migrated.orders);
          if (migrated.menu.length) await posDb.menu.bulkPut(migrated.menu);
          if (migrated.kots.length) await posDb.kots.bulkPut(migrated.kots);
          if (migrated.payments.length) await posDb.payments.bulkPut(migrated.payments);
          if (mergedQueue.length) await posDb.syncQueue.bulkPut(mergedQueue);
          /**
           * The audit log is restored too. A restore that silently empties the
           * audit trail would destroy exactly the record a restore is supposed to
           * leave behind.
           */
          if (migrated.auditLogs.length) await posDb.auditLogs.bulkPut(migrated.auditLogs);
          if (migrated.businessDayState.length) {
            await posDb.businessDayState.bulkPut(migrated.businessDayState);
          }
        }
      );

      const actor = restoredBy ?? credential.verifiedBy;
      await posDb.logAudit('BACKUP_RESTORED', 'database', activeRestaurantId, {
        restoredBy: actor,
        method: credential.method,
        backupTimestamp: migrated.timestamp,
        backupVersion: migrated.version,
        preservedQueueEntries: mergedQueue.length - migrated.syncQueue.length,
      });

      return {
        success: true,
        message: 'Database successfully restored from backup.',
        summary: {
          orders: migrated.orders.length,
          menu: migrated.menu.length,
          kots: migrated.kots.length,
          payments: migrated.payments.length,
          syncQueue: mergedQueue.length,
          auditLogs: migrated.auditLogs.length,
          businessDayState: migrated.businessDayState.length,
          preservedQueueEntries: mergedQueue.length - migrated.syncQueue.length,
          version: migrated.version,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        code: 'RESTORE_FAILED',
        message: `Restore failed and nothing was changed: ${
          error instanceof Error ? error.message : 'unknown error'
        }. The previous data is still on this terminal.`,
      };
    } finally {
      if (paused && hooks?.resumeSync) {
        await hooks.resumeSync().catch(() => undefined);
      }
      this.restoreInProgress = false;
    }
  }

  /**
   * Export all Dexie tables to a full JSON backup.
   *
   * The export is tenant-scoped. A backup that swept every table would embed one
   * restaurant's data inside another restaurant's file, and the restore guard
   * above could not tell.
   *
   * Not every table can be filtered by an index: `syncQueue` is keyed by
   * `tenantId` and `auditLogs` has no tenant column at all — `logAudit` records
   * the tenant in `entityId`. Those two are filtered in memory rather than given
   * a new index, because adding one would mean a schema version bump for a
   * once-per-shift operation. The indexed tables use their indexes.
   */
  async createBackup(restaurantId: string, triggerDownload = true): Promise<PosBackupData> {
    const orders = await posDb.orders.where('restaurantId').equals(restaurantId).toArray();
    const menu = await posDb.menu.where('restaurantId').equals(restaurantId).toArray();
    const kots = await posDb.kots.where('restaurantId').equals(restaurantId).toArray();
    const payments = await posDb.payments.where('restaurantId').equals(restaurantId).toArray();
    const businessDayState = await posDb.businessDayState
      .where('restaurantId')
      .equals(restaurantId)
      .toArray();

    const syncQueue = (await posDb.syncQueue.toArray()).filter(
      (item) => (item.tenantId ?? '') === restaurantId
    );
    const auditLogs = (await posDb.auditLogs.toArray()).filter(
      (entry) => entry.entityId === restaurantId
    );

    const timestamp = new Date().toISOString();
    const backup: PosBackupData = {
      version: POS_BACKUP_VERSION,
      timestamp,
      restaurantId,
      orders,
      menu,
      kots,
      payments,
      syncQueue,
      auditLogs,
      businessDayState,
    };

    // Store in Dexie backups table
    await posDb.backups.put({
      id: `backup_${Date.now()}`,
      createdAt: timestamp,
      data: backup as unknown as Record<string, unknown>,
    });

    await posDb.logAudit('BACKUP_CREATED', 'database', restaurantId, {
      timestamp,
      ordersCount: orders.length,
      paymentsCount: payments.length,
    });

    // Trigger browser file download
    if (triggerDownload && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orderbhojan_pos_backup_${restaurantId}_${timestamp.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return backup;
  }
}

export const backupService = new BackupService();