import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  IndianRupee,
  Receipt,
  TrendingUp,
  Printer,
  Banknote,
  QrCode,
  Globe,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Download,
  Database,
  RotateCcw,
  FileSpreadsheet,
} from 'lucide-react';
import { eodService } from '../services/eodService';
import { posDb } from '../db/posDatabase';
import { ownerIntelligence } from '../services/ownerIntelligenceService';
import { csvExportService } from '../services/csvExportService';
import { backupService } from '../services/backupService';
import { getOrderSyncService } from '../services/orderSyncService';
import { verifySupervisorCode, redeemSupervisorGrant } from '../services/supervisorAuth';
import { getFirebaseAuth } from '@/firebase/init';
import type { EodSummary, BusinessDayState, ReconciliationValidationResult } from '../domain/pos.types';

interface EodReconciliationScreenProps {
  restaurantId: string;
  restaurantName?: string;
}

export const EodReconciliationScreen: React.FC<EodReconciliationScreenProps> = ({
  restaurantId,
  restaurantName = 'Bhojan Restaurant',
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [openingFloat, setOpeningFloat] = useState<string>('2000');
  const [cashExpenses, setCashExpenses] = useState<string>('0');
  const [actualClosingCash, setActualClosingCash] = useState<string>('0');
  const [report, setReport] = useState<EodSummary | null>(null);
  const [, setLoading] = useState(false);
  const [dayState, setDayState] = useState<BusinessDayState | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationValidationResult | null>(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const restoreFileInput = useRef<HTMLInputElement | null>(null);

  /**
   * Device id used to re-acquire the flush lease after a restore. Read from the
   * same storage key the shell uses so the terminal keeps one identity.
   */
  const restoreDeviceId = (): string => {
    if (typeof localStorage === 'undefined') return 'pos-unknown-device';
    return localStorage.getItem('bhojan_pos_device_id') ?? 'pos-unknown-device';
  };

/**
   * Resolve an already-verified supervisor credential for reopening a closed day.
   *
   * Priority: an authenticated Firebase owner/manager session. Failing that, a
   * supervisor code is exchanged with the server for a grant bound to this actor,
   * this tenant and the reopen operation. The PIN is never compared against a
   * value baked into the client.
   *
   * A code path must additionally *redeem* the grant before the local reopen is
   * attempted. That is what proves the grant was real, unexpired, unspent and
   * issued for this operation: a client that skipped it would reopen the day on
   * the strength of a string it made up. Redemption is single use, so it happens
   * exactly once per attempt.
   */
  const resolveVerifiedSupervisor = async (): Promise<{ verifiedBy: string; method: 'admin-session' | 'supervisor-pin' } | null> => {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (user) return { verifiedBy: user.uid, method: 'admin-session' };

    const verified = await verifySupervisorCode(restaurantId, adminPin, 'REOPEN_BUSINESS_DAY');
    if (!verified) return null;

    const redeemed = await redeemSupervisorGrant(restaurantId, verified.grant);
    if (!redeemed) return null;

    return { verifiedBy: verified.verifiedBy, method: 'supervisor-pin' };
  };

const loadReport = async () => {
    setLoading(true);
    try {
      const summary = await eodService.generateEodReport({
        restaurantId,
        dateStr: selectedDate,
        openingFloat: Number(openingFloat) || 0,
        cashExpenses: Number(cashExpenses) || 0,
        actualClosingCash: Number(actualClosingCash) || 0,
      });
      setReport(summary);

      // Load Day State
      const state = await posDb.getBusinessDayState(restaurantId, selectedDate);
      setDayState(state);

      // Validate Reconciliation
      const orders = await posDb.orders.where('restaurantId').equals(restaurantId).toArray();
      const dateOrders = orders.filter((o) => (o.timestamps?.createdAt || '').startsWith(selectedDate));
      const payments = await posDb.payments.where('restaurantId').equals(restaurantId).toArray();
      const datePayments = payments.filter((p) => (p.recordedAt || '').startsWith(selectedDate));

      const validation = ownerIntelligence.validateReconciliation(dateOrders, datePayments);
      setReconciliationResult(validation);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [restaurantId, selectedDate, openingFloat, cashExpenses, actualClosingCash]);

  const handleCloseDay = async () => {
    const confirmClose = window.confirm(
      'Are you sure you want to close and LOCK this business day? Further changes will require Admin PIN.'
    );
    if (!confirmClose) return;

    const updated = await posDb.closeBusinessDay(
      restaurantId,
      Number(openingFloat) || 0,
      Number(actualClosingCash) || 0,
    );
    setDayState(updated);
    alert('Business day successfully closed and locked.');
  };

  const handleReopenDay = async () => {
    setReopenError('');
    // The credential must already be verified by the caller (an authenticated
    // owner session or a supervisor capability). No PIN is hardcoded here.
    const verifiedSupervisor = await resolveVerifiedSupervisor();
    if (!verifiedSupervisor) {
      setReopenError('Reopen requires an authenticated owner session or a verified supervisor code.');
      return;
    }
    const res = await posDb.reopenBusinessDay(
      restaurantId,
      verifiedSupervisor,
      reopenReason,
      verifiedSupervisor.verifiedBy,
      selectedDate,
    );
    if (!res.success) {
      setReopenError(res.message);
      return;
    }
    setDayState(res.state || null);
    setShowReopenModal(false);
    setAdminPin('');
    setReopenReason('');
    alert(res.message);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBackupNow = async () => {
    await backupService.createBackup(restaurantId, true);
    alert('JSON Database Backup created and downloaded.');
  };

  /**
   * Restore from a backup file.
   *
   * Restore rewrites every table, so the sync engine is paused for the duration:
   * `pauseSync` releases the durable flush lease rather than merely asking the
   * flusher to wait, which is what stops another tab from writing into a
   * half-restored database. The lease is released before the rewrite and taken
   * again afterwards, so ownership is never held across a restore.
   */
  const handleRestoreFromFile = async (file: File) => {
    setRestoreError(null);
    setRestoreNotice(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setRestoreError('That file could not be read as JSON. Choose a backup exported from this POS.');
      return;
    }

    // Reuse the supervisor credential path: a restore is an approval-grade action.
    const credential = await resolveVerifiedSupervisor();
    if (!credential) {
      setRestoreError(
        'Restore needs an authenticated owner session or a verified supervisor code. Nothing was changed.'
      );
      return;
    }

    setRestoreInProgress(true);
    try {
      const result = await backupService.restoreBackup(
        parsed,
        credential,
        restaurantId,
        {
          pauseSync: async () => {
            await getOrderSyncService(async () => null).shutdown();
          },
          resumeSync: async () => {
            await getOrderSyncService(async () => null).initialize({
              tenantId: restaurantId,
              deviceId: restoreDeviceId(),
            });
          },
        }
      );

      if (!result.success) {
        setRestoreError(result.message);
        return;
      }

      setRestoreNotice(
        `Restored ${result.summary.orders} order(s), ${result.summary.payments} payment(s) and ${result.summary.auditLogs} audit entr(ies).`
      );
      await loadReport();
    } finally {
      setRestoreInProgress(false);
    }
  };

  const handleExportItemSales = () => {
    if (report) csvExportService.exportItemSalesCsv(report);
  };

  const handleExportPayments = async () => {
    const payments = await posDb.payments.where('restaurantId').equals(restaurantId).toArray();
    const datePayments = payments.filter((p) => (p.recordedAt || '').startsWith(selectedDate));
    csvExportService.exportPaymentReportCsv(datePayments, selectedDate);
  };

  const handleExportDailySales = () => {
    if (report) csvExportService.exportDailySalesCsv(report);
  };

  if (!report) return null;

  const { cashReconciliation, paymentBreakdown } = report;
  const isBalanced = cashReconciliation.variance === 0;
  const isShort = cashReconciliation.variance < 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-emerald-400" />
            <span>End of Day (EOD) Reconciliation</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Daily sales breakdown, physical cash drawer reconciliation & item reports
          </p>
        </div>

        {/* Date Selector, Day Lock & Action Buttons (Min 48px height) */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Day Status Pill */}
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border ${
            dayState?.isClosed
              ? 'bg-rose-950/70 border-rose-800 text-rose-300'
              : 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
          }`}>
            {dayState?.isClosed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{dayState?.isClosed ? 'DAY LOCKED' : 'DAY OPEN'}</span>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 px-3 py-1.5 rounded-xl min-h-[48px]">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
            />
          </div>

          {/* Close or Reopen Day Button */}
          {dayState?.isClosed ? (
            <button
              onClick={() => setShowReopenModal(true)}
              className="min-h-[48px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Unlock className="w-4 h-4" />
              <span>Reopen Day</span>
            </button>
          ) : (
            <button
              onClick={handleCloseDay}
              className="min-h-[48px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>Close & Lock Day</span>
            </button>
          )}

          <button
            onClick={handleBackupNow}
            className="min-h-[48px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center gap-1.5 border border-zinc-700 transition-colors"
            title="Download JSON Database Backup"
          >
            <Database className="w-4 h-4 text-sky-400" />
            <span>Backup</span>
          </button>

          {/*
            Restore is destructive, so it is labelled as such and disabled while
            running. The file input is hidden and driven by this button so the
            control stays a single, reachable touch target on a tablet.
          */}
          <input
            ref={restoreFileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset immediately so re-picking the same file fires again.
              event.target.value = '';
              if (file) void handleRestoreFromFile(file);
            }}
          />
          <button
            onClick={() => restoreFileInput.current?.click()}
            disabled={restoreInProgress}
            className="min-h-[48px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-bold text-xs flex items-center gap-1.5 border border-zinc-700 transition-colors"
            title="Restore from a JSON backup. Requires a supervisor credential and an empty sync queue."
          >
            <RotateCcw className={`w-4 h-4 text-amber-400 ${restoreInProgress ? 'animate-spin' : ''}`} />
            <span>{restoreInProgress ? 'Restoring…' : 'Restore'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="min-h-[48px] px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center gap-2 border border-zinc-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/*
          Restore outcome. Every refusal carries a specific message from the
          service — a denied restore must explain which precondition failed and
          what the operator should do next, rather than reporting "failed".
        */}
        {(restoreError || restoreNotice) && (
          <div className="px-3.5 pt-3 shrink-0">
            <div
              className={`rounded-xl border px-4 py-2.5 text-xs font-semibold flex items-start gap-2 ${
                restoreError
                  ? 'border-rose-800 bg-rose-950/50 text-rose-200'
                  : 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
              }`}
              role={restoreError ? 'alert' : 'status'}
            >
              {restoreError ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
              )}
              <span>{restoreError ?? restoreNotice}</span>
            </div>
          </div>
        )}

        {/* CSV Export Bar */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Export Reports (CSV):</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportItemSales}
            className="min-h-[42px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 border border-zinc-700"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Item Sales CSV</span>
          </button>
          <button
            onClick={handleExportPayments}
            className="min-h-[42px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 border border-zinc-700"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Payment Report CSV</span>
          </button>
          <button
            onClick={handleExportDailySales}
            className="min-h-[42px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 border border-zinc-700"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Daily Sales CSV</span>
          </button>
        </div>
      </div>

      {/* Reconciliation Validator Warning Alert */}
      {reconciliationResult?.hasMismatch && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-600 text-rose-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-black text-sm text-rose-300">⚠️ RECONCILIATION ISSUE DETECTED</div>
            <div className="text-xs text-rose-300/90 mt-0.5">{reconciliationResult.message}</div>
          </div>
        </div>
      )}

      {/* Reopen Modal with Admin PIN and Reason */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Unlock className="w-5 h-5 text-amber-400" />
              <span>Reopen Locked Business Day</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Reopening a closed business day requires Admin PIN authorization and an audit reason.
            </p>

            {reopenError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-semibold">
                {reopenError}
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Admin PIN</label>
              <input
                type="password"
                placeholder="Enter 4-digit PIN (e.g. 1234)"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-850 border border-zinc-700 text-white font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Reason for Reopening</label>
              <textarea
                placeholder="e.g. Customer returned to settle cash bill; late delivery order adjustment"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="w-full min-h-[80px] p-3 rounded-xl bg-zinc-850 border border-zinc-700 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowReopenModal(false);
                  setAdminPin('');
                  setReopenReason('');
                  setReopenError('');
                }}
                className="flex-1 min-h-[48px] rounded-xl bg-zinc-800 hover:bg-zinc-700 font-bold text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleReopenDay}
                className="flex-1 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 font-extrabold text-xs text-zinc-950 shadow-lg shadow-amber-950/40"
              >
                Authorize & Reopen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-medium">Total Orders</div>
          <div className="text-2xl font-extrabold text-white mt-1">{report.totalOrdersCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {report.walkInOrdersCount} Walk-in • {report.onlineOrdersCount} Online
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-medium">Gross Revenue</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">₹{report.grossSales}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Incl. taxes & delivery</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-medium">Net Sales</div>
          <div className="text-2xl font-extrabold text-white mt-1">₹{report.netSales}</div>
          <div className="text-[11px] text-zinc-500 mt-1">After discounts</div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-medium">Taxes & Discounts</div>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">₹{report.totalTaxes}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Discounts: ₹{report.totalDiscounts}</div>
        </div>
      </div>

      {/* Channels & Payment Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Channel Breakdown */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Channel Breakdown</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-3 rounded-xl bg-zinc-850">
              <span className="font-semibold text-zinc-300">Walk-in POS Orders:</span>
              <span className="font-bold text-white">{report.walkInOrdersCount} orders</span>
            </div>
            <div className="flex justify-between p-3 rounded-xl bg-zinc-850">
              <span className="font-semibold text-zinc-300">OrderBhojan Online Orders:</span>
              <span className="font-bold text-sky-400">{report.onlineOrdersCount} orders</span>
            </div>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-400" />
            <span>Payment Breakdown</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-zinc-850">
              <div className="text-zinc-400 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cash Sales</span>
              </div>
              <div className="text-lg font-bold text-white mt-1">₹{paymentBreakdown.cash}</div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-850">
              <div className="text-zinc-400 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-sky-400" />
                <span>UPI / QR</span>
              </div>
              <div className="text-lg font-bold text-white mt-1">₹{paymentBreakdown.upi}</div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-850">
              <div className="text-zinc-400 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span>OrderBhojan Online</span>
              </div>
              <div className="text-lg font-bold text-white mt-1">₹{paymentBreakdown.online}</div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-850">
              <div className="text-zinc-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                <span>Card / POS</span>
              </div>
              <div className="text-lg font-bold text-white mt-1">₹{paymentBreakdown.card}</div>
            </div>
          </div>
        </div>
      </div>

      {/* CRITICAL: Physical Cash Drawer Float Reconciliation */}
      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <span>Physical Cash Drawer Float Reconciliation</span>
          </h3>
          <span className="text-xs text-amber-400 font-semibold px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/60">
            Strict Accounting: Online/UPI payments excluded from drawer float
          </span>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Opening Cash Float (₹)</label>
            <input
              type="number"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-850 border border-zinc-700 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Cash Paid Out / Expenses (₹)</label>
            <input
              type="number"
              value={cashExpenses}
              onChange={(e) => setCashExpenses(e.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-850 border border-zinc-700 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Actual Cash Counted at Close (₹)</label>
            <input
              type="number"
              value={actualClosingCash}
              onChange={(e) => setActualClosingCash(e.target.value)}
              className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-850 border border-zinc-700 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Math summary calculation */}
        <div className="p-4 rounded-xl bg-zinc-850 border border-zinc-750 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-400">Opening Cash Float:</span>
            <span className="font-semibold text-white">₹{cashReconciliation.openingFloat}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">+ Cash Received from Orders:</span>
            <span className="font-semibold text-emerald-400">+₹{cashReconciliation.totalCashSales}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">- Cash Expenses / Payouts:</span>
            <span className="font-semibold text-rose-400">-₹{cashReconciliation.cashExpenses}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-700 text-sm font-bold text-white">
            <span>Expected Closing Cash in Drawer:</span>
            <span className="text-emerald-400">₹{cashReconciliation.expectedClosingCash}</span>
          </div>
        </div>

        {/* Variance result banner */}
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          isBalanced
            ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
            : isShort
              ? 'bg-rose-950/40 border-rose-700 text-rose-300'
              : 'bg-amber-950/40 border-amber-700 text-amber-300'
        }`}>
          <div className="flex items-center gap-2 text-sm font-bold">
            {isBalanced ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Cash Drawer Perfectly Balanced (₹0 Variance)</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5" />
                <span>
                  Drawer Variance: {isShort ? `₹${Math.abs(cashReconciliation.variance)} SHORT` : `+₹${cashReconciliation.variance} EXCESS`}
                </span>
              </>
            )}
          </div>
          <div className="text-xs font-semibold opacity-80">
            Actual: ₹{cashReconciliation.actualClosingCash} | Expected: ₹{cashReconciliation.expectedClosingCash}
          </div>
        </div>
      </div>

      {/* Item-wise Sales Report */}
      <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-amber-400" />
          <span>Item-wise Sales Breakdown</span>
        </h3>

        {report.itemSales.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">No items sold on this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-850 text-zinc-400 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-3 rounded-l-lg">Item Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Quantity Sold</th>
                  <th className="p-3 text-right rounded-r-lg">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {report.itemSales.map((item) => (
                  <tr key={item.itemId || item.name} className="hover:bg-zinc-850/50">
                    <td className="p-3 font-semibold text-white">{item.name}</td>
                    <td className="p-3 text-zinc-400">{item.category}</td>
                    <td className="p-3 text-right font-bold text-amber-400">{item.quantitySold}</td>
                    <td className="p-3 text-right font-extrabold text-emerald-400">₹{item.totalRevenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hidden Print Element for EOD Thermal Report */}
      <div id="thermal-print-area" className="hidden print:block">
        <div className="print-center print-bold print-large">{restaurantName}</div>
        <div className="print-center print-bold">END OF DAY (EOD) SALES REPORT</div>
        <div className="print-center">Date: {selectedDate}</div>
        <div className="print-dashed" />
        <div className="print-row">
          <span>Total Orders:</span>
          <span>{report.totalOrdersCount}</span>
        </div>
        <div className="print-row">
          <span>Walk-in Orders:</span>
          <span>{report.walkInOrdersCount}</span>
        </div>
        <div className="print-row">
          <span>Online Orders:</span>
          <span>{report.onlineOrdersCount}</span>
        </div>
        <div className="print-dashed" />
        <div className="print-row">
          <span>Gross Sales:</span>
          <span>₹{report.grossSales}</span>
        </div>
        <div className="print-row">
          <span>Net Sales:</span>
          <span>₹{report.netSales}</span>
        </div>
        <div className="print-row">
          <span>Taxes:</span>
          <span>₹{report.totalTaxes}</span>
        </div>
        <div className="print-row">
          <span>Discounts:</span>
          <span>-₹{report.totalDiscounts}</span>
        </div>
        <div className="print-dashed" />
        <div className="print-bold">PAYMENTS:</div>
        <div className="print-row">
          <span>Cash:</span>
          <span>₹{paymentBreakdown.cash}</span>
        </div>
        <div className="print-row">
          <span>UPI / QR:</span>
          <span>₹{paymentBreakdown.upi}</span>
        </div>
        <div className="print-row">
          <span>OrderBhojan Online:</span>
          <span>₹{paymentBreakdown.online}</span>
        </div>
        <div className="print-row">
          <span>Card:</span>
          <span>₹{paymentBreakdown.card}</span>
        </div>
        <div className="print-dashed" />
        <div className="print-bold">CASH RECONCILIATION:</div>
        <div className="print-row">
          <span>Opening Float:</span>
          <span>₹{cashReconciliation.openingFloat}</span>
        </div>
        <div className="print-row">
          <span>Cash Sales:</span>
          <span>₹{cashReconciliation.totalCashSales}</span>
        </div>
        <div className="print-row">
          <span>Cash Expenses:</span>
          <span>-₹{cashReconciliation.cashExpenses}</span>
        </div>
        <div className="print-row print-bold">
          <span>Expected Cash:</span>
          <span>₹{cashReconciliation.expectedClosingCash}</span>
        </div>
        <div className="print-row">
          <span>Actual Counted:</span>
          <span>₹{cashReconciliation.actualClosingCash}</span>
        </div>
        <div className="print-row print-bold">
          <span>Variance:</span>
          <span>₹{cashReconciliation.variance}</span>
        </div>
        <div className="print-dashed" />
        <div className="print-center">Report Printed: {new Date().toLocaleTimeString()}</div>
      </div>
    </div>
  );
};
