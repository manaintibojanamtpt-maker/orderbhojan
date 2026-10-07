import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, QrCode, Banknote, CreditCard, Printer, X, AlertCircle } from 'lucide-react';
import { isPaymentSettled, type PosOrder, type PosPaymentMethod } from '../domain/pos.types';

interface PaymentModalProps {
  order: PosOrder;
  restaurantName?: string;
  onClose: () => void;
  onPaymentConfirmed: (orderId: string, method: PosPaymentMethod, amount: number, ref?: string) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  restaurantName = 'Bhojan Restaurant',
  onClose,
  onPaymentConfirmed,
}) => {
  const [activeTab, setActiveTab] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [cashTendered, setCashTendered] = useState<string>(String(order.pricing.total));
  const [upiRef, setUpiRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Paytm QR Configuration for B Lakshmi Prasanna
  const PAYTM_UPI_ID = 'paytm.s33cotk@pty';
  const PAYTM_RECIPIENT_NAME = 'B Lakshmi Prasanna';
  const billAmount = order.pricing.total;
  const transactionNote = `Order_${order.orderNumber || order.id.slice(-6).toUpperCase()}`;

  const dynamicUpiUrl = `upi://pay?pa=${PAYTM_UPI_ID}&pn=${encodeURIComponent(PAYTM_RECIPIENT_NAME)}&am=${billAmount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;

  const tenderedNum = Number(cashTendered) || 0;
  const changeToReturn = Math.max(0, tenderedNum - billAmount);

  const handleConfirm = async (method: PosPaymentMethod) => {
    try {
      setSubmitting(true);
      await onPaymentConfirmed(
        order.id,
        method,
        billAmount,
        method === 'UPI' ? upiRef.trim() || undefined : undefined,
      );
      onClose();
    } catch (err) {
      console.error('Failed to confirm payment', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintBill = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl text-white overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-800/60">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>Bill & Payment</span>
              <span className="text-sm font-normal px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                Order #{order.orderNumber || order.id.slice(-6).toUpperCase()}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              {order.customer.name} {order.customer.phone ? `• ${order.customer.phone}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-750 active:bg-zinc-700 text-zinc-300 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Payment Already Recorded Warning */}
          {isPaymentSettled(order.paymentStatus) && (
            <div className="p-4 rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-base text-amber-300">Payment already recorded.</div>
                <div className="text-xs text-amber-400/90 mt-0.5">
                  This order is already marked as PAID via {order.paymentMethod}. Duplicate payment recording is prevented.
                </div>
              </div>
            </div>
          )}

          {/* Bill Summary Banner */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/80 border border-zinc-700">
            <div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Total Amount Due</div>
              <div className="text-3xl font-extrabold text-emerald-400">₹{billAmount}</div>
            </div>
            <button
              onClick={handlePrintBill}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-650 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print Bill</span>
            </button>
          </div>

          {/* Payment Method Selector (Min 48px touch targets) */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setActiveTab('UPI')}
              className={`min-h-[52px] rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all ${
                activeTab === 'UPI'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/50'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-750'
              }`}
            >
              <QrCode className="w-5 h-5" />
              <span>Paytm / UPI QR</span>
            </button>
            <button
              onClick={() => setActiveTab('CASH')}
              className={`min-h-[52px] rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all ${
                activeTab === 'CASH'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-750'
              }`}
            >
              <Banknote className="w-5 h-5" />
              <span>Cash</span>
            </button>
            <button
              onClick={() => setActiveTab('CARD')}
              className={`min-h-[52px] rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all ${
                activeTab === 'CARD'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-750'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span>Card / POS</span>
            </button>
          </div>

          {/* Tab 1: Bundled Offline Paytm UPI QR */}
          {activeTab === 'UPI' && (
            <div className="space-y-4 rounded-xl bg-zinc-800/40 p-5 border border-zinc-800">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* QR Code */}
                <div className="bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center shrink-0">
                  <QRCodeSVG value={dynamicUpiUrl} size={200} level="M" />
                </div>

                {/* QR Details */}
                <div className="space-y-2 text-sm flex-1">
                  <div className="text-xs uppercase tracking-wider font-semibold text-sky-400">
                    Offline-Bundled Paytm QR
                  </div>
                  <div className="text-lg font-bold text-white">{PAYTM_RECIPIENT_NAME}</div>
                  <div className="font-mono text-xs text-zinc-300 bg-zinc-800 px-2.5 py-1.5 rounded-lg inline-block border border-zinc-700">
                    {PAYTM_UPI_ID}
                  </div>
                  <div className="text-xs text-zinc-400 pt-1">
                    Scan using Paytm, PhonePe, Google Pay, or any UPI app.
                  </div>

                  {/* Safety Alert */}
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs mt-3">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Payment remains <strong>PENDING</strong> until staff visually confirms notification on phone and taps below.
                    </span>
                  </div>
                </div>
              </div>

              {/* UTR / Reference Input */}
              <div className="pt-2">
                <label className="block text-xs text-zinc-400 mb-1">UPI UTR / Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="Last 4 digits or UTR"
                  value={upiRef}
                  onChange={(e) => setUpiRef(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Confirm Button (Min 48px height) */}
              <button
                disabled={submitting || isPaymentSettled(order.paymentStatus)}
                onClick={() => handleConfirm('UPI')}
                className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-zinc-950 flex items-center justify-center gap-2 text-base transition-colors shadow-lg shadow-emerald-950/50"
              >
                <CheckCircle2 className="w-5 h-5 text-zinc-950" />
                <span>
                  {isPaymentSettled(order.paymentStatus)
                    ? 'Payment Already Recorded'
                    : submitting
                    ? 'Confirming...'
                    : '✓ PAYMENT RECEIVED'}
                </span>
              </button>
            </div>
          )}

          {/* Tab 2: Cash Payment */}
          {activeTab === 'CASH' && (
            <div className="space-y-4 rounded-xl bg-zinc-800/40 p-5 border border-zinc-800">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Cash Tendered by Customer (₹)</label>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-lg font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-400 mb-1">Change to Return</div>
                  <div className={`min-h-[48px] px-3.5 rounded-xl flex items-center text-xl font-extrabold border ${
                    changeToReturn > 0
                      ? 'bg-amber-950/40 border-amber-700 text-amber-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}>
                    ₹{changeToReturn}
                  </div>
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div className="flex gap-2">
                {[billAmount, 500, 1000, 2000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashTendered(String(amt))}
                    className="min-h-[48px] flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-300 border border-zinc-700"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              <button
                disabled={submitting || isPaymentSettled(order.paymentStatus) || tenderedNum < billAmount}
                onClick={() => handleConfirm('CASH')}
                className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-zinc-950 flex items-center justify-center gap-2 text-base transition-colors shadow-lg shadow-emerald-950/50"
              >
                <CheckCircle2 className="w-5 h-5 text-zinc-950" />
                <span>
                  {isPaymentSettled(order.paymentStatus)
                    ? 'Payment Already Recorded'
                    : submitting
                    ? 'Recording...'
                    : '✓ CASH RECEIVED (₹' + billAmount + ')'}
                </span>
              </button>
            </div>
          )}

          {/* Tab 3: Card / POS Terminal */}
          {activeTab === 'CARD' && (
            <div className="space-y-4 rounded-xl bg-zinc-800/40 p-5 border border-zinc-800 text-center">
              <p className="text-sm text-zinc-300">
                Please swipe or tap customer card on the Pine Labs / EDC Card machine for <strong>₹{billAmount}</strong>.
              </p>
              <button
                disabled={submitting || isPaymentSettled(order.paymentStatus)}
                onClick={() => handleConfirm('CARD')}
                className="w-full min-h-[52px] rounded-xl bg-purple-500 hover:bg-purple-400 active:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-white flex items-center justify-center gap-2 text-base transition-colors shadow-lg shadow-purple-950/50"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {isPaymentSettled(order.paymentStatus)
                    ? 'Payment Already Recorded'
                    : submitting
                    ? 'Recording...'
                    : '✓ CARD TRANSACTION APPROVED'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden Thermal Print Element for window.print() */}
      <div id="thermal-print-area" className="hidden print:block">
        <div className="print-center print-bold print-large">{restaurantName}</div>
        <div className="print-center">Customer Bill</div>
        <div className="print-dashed" />
        <div className="print-row">
          <span>Order #: {order.orderNumber || order.id.slice(-6).toUpperCase()}</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
        <div className="print-row">
          <span>Type: {order.orderType}</span>
          <span>{order.customer.tableNo ? `Table: ${order.customer.tableNo}` : ''}</span>
        </div>
        {order.customer.name && (
          <div className="print-row">
            <span>Customer: {order.customer.name}</span>
          </div>
        )}
        <div className="print-dashed" />
        {order.items.map((it, idx) => (
          <div key={idx} className="print-row">
            <span>{it.quantity}x {it.name}</span>
            <span>₹{it.lineTotal}</span>
          </div>
        ))}
        <div className="print-dashed" />
        <div className="print-row">
          <span>Subtotal:</span>
          <span>₹{order.pricing.subtotal}</span>
        </div>
        {order.pricing.taxes > 0 && (
          <div className="print-row">
            <span>GST:</span>
            <span>₹{order.pricing.taxes}</span>
          </div>
        )}
        {order.pricing.discount > 0 && (
          <div className="print-row">
            <span>Discount:</span>
            <span>-₹{order.pricing.discount}</span>
          </div>
        )}
        {order.pricing.deliveryFee > 0 && (
          <div className="print-row">
            <span>Delivery:</span>
            <span>₹{order.pricing.deliveryFee}</span>
          </div>
        )}
        <div className="print-dashed" />
        <div className="print-row print-bold print-large">
          <span>TOTAL:</span>
          <span>₹{order.pricing.total}</span>
        </div>
        <div className="print-row">
          <span>Payment: {order.paymentMethod}</span>
          <span>Status: {order.paymentStatus}</span>
        </div>
        <div className="print-dashed" />
        <div className="print-center print-bold">Thank You! Visit Again</div>
      </div>
    </div>
  );
};
