import React, { useState, useEffect, useMemo } from 'react';
import {
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Clock,
  ShoppingBag,
  ChefHat,
  Receipt,
  TrendingUp,
  Sparkles,
  Package,
  RefreshCw,
} from 'lucide-react';
import { posDb } from '../db/posDatabase';
import { getOrderSyncService } from '../services/orderSyncService';
import { useAuthorizedPosTenant } from '../hooks/useAuthorizedPosTenant';
import { getFirebaseAuth } from '@/firebase/init';
import { audioAlert } from '../services/audioAlertService';
import { wakeLockService } from '../services/wakeLockService';
import type { PosOrder } from '../domain/pos.types';
import type { QueueHealth } from '../services/posCommandPlanner';
import { OnlineOrdersScreen } from './OnlineOrdersScreen';
import { WalkInBillingScreen } from './WalkInBillingScreen';
import { KotScreen } from './KotScreen';
import { EodReconciliationScreen } from './EodReconciliationScreen';
import { OwnerIntelligenceScreen } from './OwnerIntelligenceScreen';
import { MenuStockScreen } from './MenuStockScreen';
import './ThermalReceiptStyles.css';

type PosTab = 'ONLINE_ORDERS' | 'WALK_IN' | 'KOT' | 'EOD' | 'OWNER_INTELLIGENCE' | 'MENU_STOCK';

const EMPTY_HEALTH: QueueHealth = {
  pending: 0,
  inFlight: 0,
  blocked: 0,
  oldestPendingAgeMs: 0,
  offline: false,
  awaitingAuth: false,
};

/** Stable per-install identifier used for traceability and command ordering. */
const resolveDeviceId = (): string => {
  if (typeof localStorage === 'undefined') return 'pos-unknown-device';
  const existing = localStorage.getItem('bhojan_pos_device_id');
  if (existing) return existing;
  const generated = `pos_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  localStorage.setItem('bhojan_pos_device_id', generated);
  return generated;
};

export const PosApp: React.FC = () => {
  /**
   * The tenant this terminal may act on. Resolved from the signed-in account's
   * server-side memberships; there is no hardcoded id to fall back on, so until
   * this resolves there is no tenant and nothing can trade.
   */
  const tenant = useAuthorizedPosTenant();
  const [activeTab, setActiveTab] = useState<PosTab>('ONLINE_ORDERS');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMuted, setIsMuted] = useState(audioAlert.getMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [activeKotsCount, setActiveKotsCount] = useState(0);
  const [queueHealth, setQueueHealth] = useState<QueueHealth>(EMPTY_HEALTH);
  const [blockedDetail, setBlockedDetail] = useState<string | null>(null);
  const [reauthNotice, setReauthNotice] = useState<string | null>(null);
  const [deviceId] = useState(resolveDeviceId);

  const restaurantId = tenant.tenantId ?? '';
  const restaurantName = tenant.tenantName;
  /** No authorized tenant means nothing below this may run. */
  const hasTenant = tenant.status === 'ready' && restaurantId.length > 0;

  // One service instance per tab; it owns the durable queue lifecycle.
  const syncService = useMemo(
    () =>
      getOrderSyncService(async () => {
        const auth = getFirebaseAuth();
        const user = auth?.currentUser;
        if (!user) return null;
        // Fresh token per attempt so an offline queue does not replay with an
        // expired credential.
        return user.getIdToken();
      }),
    []
  );

  // Screen Wake Lock API for Nokia tablet
  useEffect(() => {
    wakeLockService.requestWakeLock();
    return () => {
      wakeLockService.releaseWakeLock();
    };
  }, []);

  // Clock
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncService.flushSyncQueue().catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncService]);

  // Queue health, recovery and periodic flush.
  useEffect(() => {
    /**
     * Nothing is initialized until a tenant is authorized. Binding the queue to
     * an empty tenant would recover and flush against a scope that belongs to
     * nobody.
     */
    if (!hasTenant) return;

    let cancelled = false;
    const bind = async () => {
      /**
       * Releasing the lease before taking the next one is what makes a switch
       * safe. The lease is per device, so without this the previous tenant's
       * ownership would still be held while the queue refills for the new
       * tenant, and a stale worker could keep draining the old scope.
       */
      syncService.stopListening();
      await syncService.shutdown();
      if (cancelled) return;

      await syncService.initialize({ tenantId: restaurantId, deviceId });
      if (cancelled) return;
      await syncService.flushSyncQueue();
    };
    void bind().catch(() => undefined);

    const unsubscribeHealth = syncService.onQueueHealth((health) => {
      if (cancelled) return;
      setQueueHealth(health);
      setSyncQueueCount(health.pending + health.inFlight);
      setIsSyncing(health.inFlight > 0);
      setIsOnline(!health.offline);
    });
    const unsubscribeReauth = syncService.onReauthRequired((detail) => {
      if (cancelled) return;
      setReauthNotice(detail);
    });

    const interval = window.setInterval(() => {
      void syncService.flushSyncQueue().catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsubscribeHealth();
      unsubscribeReauth();
      syncService.stopListening();
      // Hand ownership back on switch and on unmount so another tab, or the
      // next tenant, can flush without waiting for expiry.
      void syncService.shutdown();
    };
  }, [syncService, restaurantId, deviceId, hasTenant]);

  // Surface actionable sync failures instead of hiding them in the queue.
  useEffect(() => {
    if (queueHealth.blocked === 0) {
      setBlockedDetail(null);
      return;
    }
    let cancelled = false;
    void syncService.getBlockedCommands().then(async (items) => {
      if (cancelled || items.length === 0) return;
      const newest = items[items.length - 1];
      setBlockedDetail(
        `${items.length} queued action${items.length === 1 ? '' : 's'} need attention: ${newest.failureDetail ?? 'sync failed'}`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [queueHealth.blocked, syncService]);

  const handleRetryBlocked = async () => {
    await syncService.releaseAuthBlocked();
    setReauthNotice(null);
    await syncService.flushSyncQueue();
  };

  // Refresh orders and KOTs count from local Dexie DB
  const refreshOrders = async () => {
    const records = await posDb.getOrders(restaurantId);
    setOrders(records);

    const pendingKots = await posDb.kots
      .where('restaurantId')
      .equals(restaurantId)
      .filter((k) => k.status !== 'READY')
      .count();
    setActiveKotsCount(pendingKots);
  };

  // Start real-time Firestore sync & new order notifications
  useEffect(() => {
    if (!hasTenant) return;
    refreshOrders();
    syncService.startListening(restaurantId);

    const unsubscribeNewOrder = syncService.onNewOrder(() => {
      refreshOrders();
    });

    return () => {
      unsubscribeNewOrder();
      syncService.stopListening();
    };
  }, [restaurantId, syncService, hasTenant]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const toggleSound = () => {
    const muted = audioAlert.toggleMute();
    setIsMuted(muted);
  };

  const newOrdersCount = orders.filter((o) => o.orderStatus === 'NEW').length;

  /**
   * Authorization gate. Until the server has confirmed a tenant this account may
   * use, the shell renders no POS surface at all. This is the fail-closed
   * boundary: there is deliberately no branch here that substitutes a default
   * tenant, because that branch is what the hardcoded id used to be.
   */
  if (!hasTenant) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black text-lg">
              OB
            </div>
            <div>
              <div className="text-sm font-black tracking-tight">ORDERBHOJAN POS</div>
              <div className="text-xs text-zinc-400 font-semibold">Terminal setup</div>
            </div>
          </div>

          {tenant.status === 'loading' && (
            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Checking which restaurant this terminal may use…
            </div>
          )}

          {tenant.status === 'locked_out' && (
            <>
              <div className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
                {tenant.message}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The POS only operates a restaurant you are a member of. This terminal will not open a
                register for a restaurant your account has not been given access to.
              </p>
              <button
                onClick={() => void tenant.refresh()}
                className="min-h-[48px] px-5 rounded-xl bg-amber-500 text-zinc-950 font-black text-xs uppercase flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            </>
          )}

          {tenant.status === 'error' && (
            <>
              <div className="rounded-xl border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                {tenant.message}
              </div>
              <button
                onClick={() => void tenant.refresh()}
                className="min-h-[48px] px-5 rounded-xl bg-amber-500 text-zinc-950 font-black text-xs uppercase flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans select-none">
      {/* Top Tablet Header Bar (Touch targets min 48px) */}
      <header className="h-[68px] px-6 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
        {/* Brand & Restaurant Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black text-lg shadow-md">
              OB
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                <span>ORDERBHOJAN POS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-extrabold">
                  TABLET PWA
                </span>
              </div>
              <div className="text-xs text-zinc-400 font-semibold flex items-center">
                {restaurantName}
                <span className="ml-2 text-[10px] font-mono text-zinc-600">{deviceId}</span>
                {tenant.role && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase"
                    title="Your server-assigned role for this restaurant"
                  >
                    {tenant.role}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/*
            Tenant switcher. Only rendered when the server authorized more than
            one tenant, because offering a choice of one is noise. Each option is
            a tenant this account is a member of; selecting one is re-verified
            against the server before it takes effect.
          */}
          {tenant.tenants.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-black text-zinc-500">Restaurant</span>
              <select
                value={restaurantId}
                disabled={tenant.status === 'switching'}
                onChange={(event) => void tenant.switchTenant(event.target.value)}
                className="min-h-[40px] px-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-white disabled:opacity-50"
                aria-label="Select restaurant"
              >
                {tenant.tenants.map((entry) => (
                  <option key={entry.tenantId} value={entry.tenantId}>
                    {entry.name ?? entry.tenantId}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Navigation Tabs (Min 48px height) */}
        <nav className="hidden sm:flex items-center bg-zinc-950 p-1 rounded-2xl border border-zinc-800 gap-1">
          <button
            onClick={() => setActiveTab('ONLINE_ORDERS')}
            className={`min-h-[48px] px-5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === 'ONLINE_ORDERS'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Online Orders</span>
            {newOrdersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center animate-bounce">
                {newOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('WALK_IN')}
            className={`min-h-[48px] px-5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === 'WALK_IN'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Walk-in Billing</span>
          </button>

          <button
            onClick={() => setActiveTab('KOT')}
            className={`min-h-[48px] px-5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === 'KOT'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>Kitchen (KOT)</span>
            {activeKotsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-amber-400 text-[11px] font-bold border border-zinc-700">
                {activeKotsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('EOD')}
            className={`min-h-[48px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              activeTab === 'EOD'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>EOD</span>
          </button>

          <button
            onClick={() => setActiveTab('OWNER_INTELLIGENCE')}
            className={`min-h-[48px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              activeTab === 'OWNER_INTELLIGENCE'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Insights</span>
          </button>

          <button
            onClick={() => setActiveTab('MENU_STOCK')}
            className={`min-h-[48px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              activeTab === 'MENU_STOCK'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4 text-amber-400" />
            <span>Stock</span>
          </button>
        </nav>

        {/* System Indicators & Hardware Controls */}
        <div className="flex items-center gap-2.5">
          {/* Online/Syncing/Offline Status Pill */}
          <div className={`min-h-[48px] px-3.5 rounded-xl flex items-center gap-2 text-xs font-bold border ${
            !isOnline
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : isSyncing
              ? 'bg-amber-950/60 border-amber-800 text-amber-300'
              : 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
          }`}>
            {!isOnline ? (
              <>
                <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="flex flex-col text-[11px] leading-tight">
                  <span className="font-extrabold text-rose-300">OFFLINE</span>
                  <span className="text-[9px] text-zinc-400">Local POS Active</span>
                </div>
                {syncQueueCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-900/80 text-rose-200 text-[10px] font-black">
                    SYNC: {syncQueueCount} PENDING
                  </span>
                )}
              </>
            ) : isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                <span className="font-extrabold text-amber-300">SYNCING...</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-extrabold text-emerald-400">ONLINE</span>
                {syncQueueCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px]">
                    {syncQueueCount} pending
                  </span>
                )}
              </>
            )}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className={`min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center border transition-colors ${
              isMuted
                ? 'bg-zinc-850 border-zinc-750 text-zinc-500 hover:text-zinc-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
            }`}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="min-h-[48px] min-w-[48px] rounded-xl bg-zinc-850 border border-zinc-750 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
            title="Toggle Tablet Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>

          {/* Clock */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-zinc-400 pl-2">
            <Clock className="w-3.5 h-3.5" />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* Actionable sync banners: offline depth, re-auth and permanent failures.
          Nothing in the queue is allowed to fail silently. */}
      {(reauthNotice || blockedDetail || queueHealth.oldestPendingAgeMs > 5 * 60_000) && (
        <div className="px-6 py-2 flex flex-col gap-1.5 shrink-0">
          {reauthNotice && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-700 bg-amber-950/50 px-4 py-2 text-xs text-amber-200">
              <span className="font-semibold">{reauthNotice}</span>
              <button
                onClick={handleRetryBlocked}
                className="min-h-[36px] px-3 rounded-lg bg-amber-500 text-zinc-950 font-black text-[11px] uppercase"
              >
                Resume sync
              </button>
            </div>
          )}
          {blockedDetail && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-800 bg-rose-950/50 px-4 py-2 text-xs text-rose-200">
              <span className="font-semibold">{blockedDetail}</span>
              <span className="text-[10px] uppercase text-rose-300/80">
                recorded locally — reconcile before close
              </span>
            </div>
          )}
          {!reauthNotice && !blockedDetail && queueHealth.oldestPendingAgeMs > 5 * 60_000 && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-300">
              {queueHealth.pending} action(s) waiting for the server — oldest has been queued for{' '}
              {Math.round(queueHealth.oldestPendingAgeMs / 60000)} min.
            </div>
          )}
        </div>
      )}

      {/* Main Screen Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'ONLINE_ORDERS' && (
          <OnlineOrdersScreen
            orders={orders}
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            deviceId={deviceId}
            onRefresh={refreshOrders}
          />
        )}

        {activeTab === 'WALK_IN' && (
          <WalkInBillingScreen
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            deviceId={deviceId}
            onOrderCreated={refreshOrders}
          />
        )}

        {activeTab === 'KOT' && (
          <KotScreen restaurantId={restaurantId} />
        )}

        {activeTab === 'EOD' && (
          <EodReconciliationScreen
            restaurantId={restaurantId}
            restaurantName={restaurantName}
          />
        )}

        {activeTab === 'OWNER_INTELLIGENCE' && (
          <OwnerIntelligenceScreen restaurantId={restaurantId} />
        )}

        {activeTab === 'MENU_STOCK' && (
          <MenuStockScreen restaurantId={restaurantId} />
        )}
      </main>
    </div>
  );
};

export default PosApp;
