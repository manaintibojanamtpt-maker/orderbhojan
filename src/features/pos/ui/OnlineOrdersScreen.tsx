import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Printer,
  AlertTriangle,
  Receipt,
  User,
  Phone,
  MapPin,
} from 'lucide-react';
import { posDb } from '../db/posDatabase';
import { audioAlert } from '../services/audioAlertService';
import { isPaymentSettled, type PosOrder } from '../domain/pos.types';
import { PaymentModal } from './PaymentModal';

interface OnlineOrdersScreenProps {
  orders: PosOrder[];
  restaurantId: string;
  restaurantName?: string;
  /** Stable install id stamped onto every queued command for traceability. */
  deviceId?: string;
  onRefresh: () => void;
}

const REJECTION_REASONS = [
  'Item(s) out of stock',
  'Kitchen at maximum capacity',
  'Store closing soon',
  'Delivery address outside range',
  'Invalid customer details',
  'Other',
];

export const OnlineOrdersScreen: React.FC<OnlineOrdersScreenProps> = ({
  orders,
  restaurantId,
  restaurantName,
  deviceId,
  onRefresh,
}) => {
  const scope = { tenantId: restaurantId, ...(deviceId ? { deviceId } : {}) };
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<PosOrder | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<PosOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [outOfStockItemIds, setOutOfStockItemIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    posDb.menu.toArray().then((items) => {
      const oos = new Set(items.filter((i) => i.isAvailable === false).map((i) => i.id));
      setOutOfStockItemIds(oos);
    });
  }, [orders]);

  // Filter orders by status
  const newOrders = orders.filter((o) => o.orderStatus === 'NEW');
  const preparingOrders = orders.filter((o) => o.orderStatus === 'PREPARING' || o.orderStatus === 'ACCEPTED');
  const readyOrders = orders.filter((o) => o.orderStatus === 'READY');
  const completedOrders = orders.filter((o) => o.orderStatus === 'COMPLETED');
  const cancelledOrders = orders.filter((o) => o.orderStatus === 'CANCELLED');

  // If there are any incoming NEW orders, play alert
  React.useEffect(() => {
    if (newOrders.length > 0) {
      audioAlert.startContinuousAlert();
    } else {
      audioAlert.stopAlert();
    }
  }, [newOrders.length]);

  const handleAccept = async (order: PosOrder) => {
    const oosItems = order.items.filter((it) => outOfStockItemIds.has(it.itemId));
    if (oosItems.length > 0) {
      const proceed = window.confirm(
        `Warning: This order contains item(s) currently marked OUT OF STOCK: ${oosItems.map((i) => i.name).join(', ')}. Do you still want to accept this order?`,
      );
      if (!proceed) return;
    }
    audioAlert.stopAlert();
    // 1. Accept through the command API (optimistic locally, confirmed on ack)
    await posDb.updateOrderStatus(order.id, 'ACCEPTED', undefined, scope);
    // 2. Start cooking
    await posDb.updateOrderStatus(order.id, 'PREPARING', undefined, scope);
    // 3. Generate Kitchen Order Ticket
    await posDb.createKot(order, scope);
    onRefresh();
  };

  const handleOpenReject = (order: PosOrder) => {
    setRejectingOrder(order);
    setRejectionReason(REJECTION_REASONS[0]);
    setCustomReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    audioAlert.stopAlert();
    const finalReason = rejectionReason === 'Other' ? (customReason.trim() || 'Other') : rejectionReason;
    await posDb.updateOrderStatus(rejectingOrder.id, 'REJECTED', { rejectionReason: finalReason }, scope);
    setRejectingOrder(null);
    onRefresh();
  };

  const handleMarkReady = async (order: PosOrder) => {
    await posDb.updateOrderStatus(order.id, 'READY', undefined, scope);
    onRefresh();
  };

  const handlePaymentConfirmed = async (
    orderId: string,
    method: PosOrder['paymentMethod'],
    amount: number,
    ref?: string,
  ) => {
    // RecordPayment is the single authoritative payment command; the follow-up
    // status update is ordered behind it by the local sequence.
    await posDb.recordPayment(orderId, method, amount, ref, scope);
    await posDb.updateOrderStatus(orderId, 'COMPLETED', undefined, scope);
    onRefresh();
  };

  const renderOrderCard = (order: PosOrder, currentColumn: 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED') => {
    const isNew = currentColumn === 'NEW';
    const isOnline = order.orderSource === 'ORDERBHOJAN';
    const oosItems = order.items.filter((it) => outOfStockItemIds.has(it.itemId));
    const isCancelledPaid = order.orderStatus === 'CANCELLED' && isPaymentSettled(order.paymentStatus);

    return (
      <div
        key={order.id}
        className={`rounded-2xl bg-zinc-900 border overflow-hidden flex flex-col justify-between shadow-md transition-all ${
          isNew
            ? 'border-amber-500 shadow-amber-950/40 ring-1 ring-amber-500/50 animate-pulse'
            : 'border-zinc-800'
        }`}
      >
        {/* Card Header */}
        <div className="p-3.5 bg-zinc-800/60 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-white">
                #{order.orderNumber || order.id.slice(-6).toUpperCase()}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase ${
                isOnline ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'bg-zinc-800 text-zinc-300'
              }`}>
                {order.orderSource}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-semibold">
                {order.orderType}
              </span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {new Date(order.timestamps.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Payment Pill */}
          <span className={`text-xs px-2.5 py-1 rounded-lg font-extrabold ${
            isPaymentSettled(order.paymentStatus)
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              : 'bg-amber-950 text-amber-300 border border-amber-800'
          }`}>
            {order.paymentStatus}
          </span>
        </div>

        {/* Out of stock warning badge */}
        {oosItems.length > 0 && (
          <div className="mx-3.5 mt-2.5 p-2 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Contains Out-of-Stock: {oosItems.map((i) => i.name).join(', ')}</span>
          </div>
        )}

        {/* Refund Required badge */}
        {isCancelledPaid && (
          <div className="mx-3.5 mt-2.5 p-2 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 text-xs flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>REFUND REQUIRED (Paid ₹{order.pricing.total})</span>
          </div>
        )}

        {/* Customer & Items */}
        <div className="p-3.5 space-y-3 flex-1 text-sm">
          <div className="space-y-1 text-xs text-zinc-300">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>{order.customer.name}</span>
            </div>
            {order.customer.phone && (
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Phone className="w-3.5 h-3.5" />
                <span>{order.customer.phone}</span>
              </div>
            )}
            {order.customer.address && (
              <div className="flex items-start gap-1.5 text-zinc-400 line-clamp-1">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{order.customer.address}</span>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 pt-2 space-y-1.5">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex items-start justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-400">{it.quantity}x</span>
                  <span className="text-zinc-200">{it.name}</span>
                </div>
                <span className="font-medium text-zinc-400">₹{it.lineTotal}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 pt-2 flex items-center justify-between font-bold text-sm">
            <span className="text-zinc-400">Total:</span>
            <span className="text-emerald-400 font-extrabold text-base">₹{order.pricing.total}</span>
          </div>
        </div>

        {/* Action Buttons (Min 48px height) */}
        <div className="p-3 bg-zinc-850 border-t border-zinc-800 flex gap-2">
          {currentColumn === 'NEW' && (
            <>
              <button
                onClick={() => handleOpenReject(order)}
                className="min-h-[48px] px-3.5 rounded-xl bg-zinc-800 hover:bg-rose-950 text-rose-400 hover:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-zinc-700 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>REJECT</span>
              </button>
              <button
                onClick={() => handleAccept(order)}
                className="min-h-[48px] flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ACCEPT & KOT</span>
              </button>
            </>
          )}

          {currentColumn === 'PREPARING' && (
            <button
              onClick={() => handleMarkReady(order)}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>MARK READY</span>
            </button>
          )}

          {currentColumn === 'READY' && (
            <button
              onClick={() => setSelectedOrderForPayment(order)}
              className="min-h-[48px] w-full rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Receipt className="w-4 h-4" />
              <span>{isPaymentSettled(order.paymentStatus) ? 'COMPLETE / BILL' : 'PAY & COMPLETE'}</span>
            </button>
          )}

          {currentColumn === 'COMPLETED' && (
            <button
              onClick={() => setSelectedOrderForPayment(order)}
              className="min-h-[48px] w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>VIEW / REPRINT BILL</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Alert Banner for Cancelled Paid Orders */}
      {cancelledOrders.filter((o) => isPaymentSettled(o.paymentStatus)).length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-650 text-rose-200 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <div className="text-base font-black">
                REFUND REQUIRED: {cancelledOrders.filter((o) => isPaymentSettled(o.paymentStatus)).length} Cancelled Order(s) Have Recorded Payments
              </div>
              <div className="text-xs text-rose-300/90">
                Please process manual refund for customer(s) or adjust payments accordingly.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Banner for Incoming Orders */}
      {newOrders.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-between shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 text-amber-400 flex items-center justify-center">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="text-base font-black">
                {newOrders.length} NEW ONLINE ORDER{newOrders.length > 1 ? 'S' : ''} RECEIVED!
              </div>
              <div className="text-xs font-semibold text-zinc-900">
                Action required: Accept or Reject to dispatch KOT to the kitchen.
              </div>
            </div>
          </div>
          <button
            onClick={() => audioAlert.stopAlert()}
            className="min-h-[48px] px-4 rounded-xl bg-zinc-950 text-white font-bold text-xs"
          >
            SILENCE ALERT
          </button>
        </div>
      )}

      {/* 4 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Column 1: New */}
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-amber-500/50">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
              <h3 className="font-bold text-sm text-white">NEW ORDERS</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
              {newOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {newOrders.map((o) => renderOrderCard(o, 'NEW'))}
            {newOrders.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No new orders
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-sky-500/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <h3 className="font-bold text-sm text-white">PREPARING (KOT)</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-xs font-bold">
              {preparingOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {preparingOrders.map((o) => renderOrderCard(o, 'PREPARING'))}
            {preparingOrders.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No active cooking
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Ready */}
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-500/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="font-bold text-sm text-white">READY FOR DISPATCH</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              {readyOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {readyOrders.map((o) => renderOrderCard(o, 'READY'))}
            {readyOrders.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No ready orders
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Completed */}
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
              <h3 className="font-bold text-sm text-zinc-300">COMPLETED</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs font-bold">
              {completedOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {completedOrders.slice(0, 15).map((o) => renderOrderCard(o, 'COMPLETED'))}
            {completedOrders.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No completed orders yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rejection Modal with Mandatory Reason */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-lg">
              <AlertTriangle className="w-5 h-5" />
              <span>Reject Order #{rejectingOrder.orderNumber || rejectingOrder.id.slice(-6).toUpperCase()}</span>
            </div>
            <p className="text-xs text-zinc-400">
              Please select a mandatory reason for rejecting this order. The customer will be informed immediately.
            </p>

            <div className="space-y-2">
              {REJECTION_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    rejectionReason === r
                      ? 'bg-rose-950/40 border-rose-600 text-rose-300'
                      : 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="rejectReason"
                    value={r}
                    checked={rejectionReason === r}
                    onChange={() => setRejectionReason(r)}
                    className="accent-rose-500"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            {rejectionReason === 'Other' && (
              <input
                type="text"
                placeholder="Specify rejection reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs focus:outline-none focus:border-rose-500"
              />
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRejectingOrder(null)}
                className="min-h-[48px] flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmReject}
                className="min-h-[48px] flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50"
              >
                CONFIRM REJECT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment & Bill Modal */}
      {selectedOrderForPayment && (
        <PaymentModal
          order={selectedOrderForPayment}
          restaurantName={restaurantName}
          onClose={() => setSelectedOrderForPayment(null)}
          onPaymentConfirmed={handlePaymentConfirmed}
        />
      )}
    </div>
  );
};
