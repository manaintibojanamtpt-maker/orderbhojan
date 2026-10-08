import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ChefHat,
  CreditCard,
  Utensils,
  ShoppingBag,
} from 'lucide-react';
import { posDb } from '../db/posDatabase';
import type {
  PosMenuItem,
  PosOrder,
  PosItemSnapshot,
  PosOrderType,
} from '../domain/pos.types';
import { PaymentModal } from './PaymentModal';

interface WalkInBillingScreenProps {
  restaurantId: string;
  restaurantName?: string;
  deviceId?: string;
  onOrderCreated: () => void;
}

export const WalkInBillingScreen: React.FC<WalkInBillingScreenProps> = ({
  restaurantId,
  restaurantName,
  deviceId,
  onOrderCreated,
}) => {
  const scope = { tenantId: restaurantId, ...(deviceId ? { deviceId } : {}) };
  const [menuItems, setMenuItems] = useState<PosMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart state
  const [cart, setCart] = useState<PosItemSnapshot[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>('DINE_IN');
  const [tableNo, setTableNo] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [payingOrder, setPayingOrder] = useState<PosOrder | null>(null);

  // Load menu from IndexedDB or seed defaults
  useEffect(() => {
    const loadMenu = async () => {
      let items = await posDb.menu.where('restaurantId').equals(restaurantId).toArray();
      if (items.length === 0) {
        // Sample baseline menu if none cached yet
        items = [
          { id: 'item_1', restaurantId, name: 'Hyderabadi Chicken Biryani', category: 'Biryani', price: 299, isAvailable: true, type: 'non-veg' },
          { id: 'item_2', restaurantId, name: 'Special Veg Dum Biryani', category: 'Biryani', price: 220, isAvailable: true, type: 'veg' },
          { id: 'item_3', restaurantId, name: 'Andhra South Indian Thali', category: 'Meals', price: 180, isAvailable: true, type: 'veg' },
          { id: 'item_4', restaurantId, name: 'Guntur Chicken Fry', category: 'Starters', price: 240, isAvailable: true, type: 'non-veg' },
          { id: 'item_5', restaurantId, name: 'Paneer Butter Masala', category: 'Curries', price: 210, isAvailable: true, type: 'veg' },
          { id: 'item_6', restaurantId, name: 'Butter Naan (2 pcs)', category: 'Breads', price: 80, isAvailable: true, type: 'veg' },
          { id: 'item_7', restaurantId, name: 'Masala Dosa with Sambar', category: 'Tiffins', price: 90, isAvailable: true, type: 'veg' },
          { id: 'item_8', restaurantId, name: 'Idli Vada Combo', category: 'Tiffins', price: 75, isAvailable: true, type: 'veg' },
          { id: 'item_9', restaurantId, name: 'Cold Badam Milk', category: 'Beverages', price: 60, isAvailable: true, type: 'veg' },
          { id: 'item_10', restaurantId, name: 'Filter Coffee', category: 'Beverages', price: 40, isAvailable: true, type: 'veg' },
        ];
        await posDb.cacheMenuItems(items);
      }
      setMenuItems(items);
    };
    loadMenu();
  }, [restaurantId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((i) => set.add(i.category));
    return ['ALL', ...Array.from(set)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch && item.isAvailable;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart operations
  const addToCart = (item: PosMenuItem) => {
    if (item.isAvailable === false) return; // Prevent adding out of stock item
    setCart((prev) => {
      const existing = prev.find((i) => i.itemId === item.id);
      if (existing) {
        return prev.map((i) =>
          i.itemId === item.id
            ? { ...i, quantity: i.quantity + 1, lineTotal: (i.quantity + 1) * i.price }
            : i,
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          lineTotal: item.price,
          category: item.category,
        },
      ];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((i) => {
          if (i.itemId === itemId) {
            const nextQty = i.quantity + delta;
            return nextQty > 0
              ? { ...i, quantity: nextQty, lineTotal: nextQty * i.price }
              : null;
          }
          return i;
        })
        .filter(Boolean) as PosItemSnapshot[];
    });
  };

  const removeItem = (itemId: string) => {
    setCart((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  // Pricing calculations
  const subtotal = useMemo(
    () => cart.reduce((acc, it) => acc + it.lineTotal, 0),
    [cart],
  );
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const gstAmount = Math.round(((subtotal - discountAmount) * 5) / 100); // Standard 5% GST
  const grandTotal = Math.max(0, subtotal - discountAmount + gstAmount);

  const buildCurrentOrder = (): PosOrder => {
    const now = new Date().toISOString();
    const orderNumber = Math.floor(1000 + Math.random() * 9000);
    const orderId = `pos_${Date.now()}_${orderNumber}`;

    return {
      id: orderId,
      /**
       * The server uses this same id as its `orders` document id, so recording it
       * as `onlineOrderId` too lets a later acknowledgement be matched back to
       * this row and promote it from optimistic to confirmed.
       */
      onlineOrderId: orderId,
      restaurantId,
      orderNumber,
      orderSource: 'WALK_IN',
      orderType,
      orderStatus: 'NEW',
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      customer: {
        name: customerName.trim() || 'Walk-in Customer',
        phone: customerPhone.trim() || '',
        tableNo: orderType === 'DINE_IN' ? tableNo.trim() || undefined : undefined,
      },
      items: [...cart],
      pricing: {
        subtotal,
        taxes: gstAmount,
        deliveryFee: 0,
        packingFee: 0,
        discount: discountAmount,
        total: grandTotal,
      },
      timestamps: {
        createdAt: now,
      },
      synced: false,
    };
  };

  const handleSendKotOnly = async () => {
    if (cart.length === 0) return;
    const order = buildCurrentOrder();
    order.orderStatus = 'ACCEPTED';
    /**
     * `CreateOrder` is queued first. It carries the durable order id that the
     * server uses as its document id, so the accept, the KOT and anything queued
     * later all address an order that actually exists. Without it the status
     * update would be replayed against a row the server has never had.
     */
    await posDb.createWalkInOrder(order, scope);
    await posDb.updateOrderStatus(order.id, 'ACCEPTED', undefined, scope);
    await posDb.updateOrderStatus(order.id, 'PREPARING', undefined, scope);
    await posDb.createKot(order, scope);
    setCart([]);
    onOrderCreated();
  };

  const handleProceedToPay = async () => {
    if (cart.length === 0) return;
    const order = buildCurrentOrder();
    order.orderStatus = 'ACCEPTED';
    await posDb.createWalkInOrder(order, scope);
    await posDb.updateOrderStatus(order.id, 'ACCEPTED', undefined, scope);
    await posDb.updateOrderStatus(order.id, 'PREPARING', undefined, scope);
    await posDb.createKot(order, scope);
    setPayingOrder(order);
  };

  const handlePaymentConfirmed = async (
    orderId: string,
    method: PosOrder['paymentMethod'],
    amount: number,
    ref?: string,
  ) => {
    await posDb.recordPayment(orderId, method, amount, ref, scope);
    await posDb.updateOrderStatus(orderId, 'COMPLETED', undefined, scope);
    setCart([]);
    setPayingOrder(null);
    onOrderCreated();
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-68px)] overflow-hidden">
      {/* Left: Menu catalog (60% width on desktop) */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden border-r border-zinc-800">
        {/* Search & Category Tabs */}
        <div className="space-y-3 pb-4 border-b border-zinc-800">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search dishes or items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[48px] pl-11 pr-4 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[48px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-zinc-950 shadow-md'
                    : 'bg-zinc-850 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid (Touch Friendly Cards) */}
        <div className="flex-1 overflow-y-auto pt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredItems.map((item) => {
            const isOutOfStock = item.isAvailable === false;
            return (
              <button
                key={item.id}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && addToCart(item)}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between min-h-[110px] transition-all shadow-sm group ${
                  isOutOfStock
                    ? 'bg-zinc-900/50 border-zinc-850 opacity-50 cursor-not-allowed'
                    : 'bg-zinc-900 border-zinc-800 hover:border-amber-500/60 active:scale-95'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          item.type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-[11px] font-semibold text-zinc-400">{item.category}</span>
                    </div>
                    {isOutOfStock && (
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                        Out of stock
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-2">
                    {item.name}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-sm font-extrabold ${isOutOfStock ? 'text-zinc-500' : 'text-emerald-400'}`}>
                    ₹{item.price}
                  </span>
                  {!isOutOfStock && (
                    <span className="w-7 h-7 rounded-lg bg-zinc-800 group-hover:bg-amber-500 group-hover:text-zinc-950 text-zinc-300 flex items-center justify-center font-bold text-sm">
                      +
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Cart & Billing Panel (40% width on desktop) */}
      <div className="w-full lg:w-[420px] bg-zinc-900 flex flex-col justify-between border-l border-zinc-800 h-full overflow-hidden">
        {/* Order Setup Header */}
        <div className="p-4 bg-zinc-850 border-b border-zinc-800 space-y-3">
          {/* Order Type Selector */}
          <div className="grid grid-cols-3 gap-2">
            {(['DINE_IN', 'PICKUP', 'DELIVERY'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`min-h-[48px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
                  orderType === t
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'DINE_IN' ? <Utensils className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                <span>{t === 'DINE_IN' ? 'Dine In' : t === 'PICKUP' ? 'Takeaway' : 'Delivery'}</span>
              </button>
            ))}
          </div>

          {/* Dine in Table input or Customer phone */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {orderType === 'DINE_IN' ? (
              <div>
                <label className="text-zinc-400 block mb-0.5">Table No.</label>
                <input
                  type="text"
                  placeholder="e.g. T4"
                  value={tableNo}
                  onChange={(e) => setTableNo(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-bold"
                />
              </div>
            ) : (
              <div>
                <label className="text-zinc-400 block mb-0.5">Customer Name</label>
                <input
                  type="text"
                  placeholder="Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white"
                />
              </div>
            )}
            <div>
              <label className="text-zinc-400 block mb-0.5">Phone (Optional)</label>
              <input
                type="tel"
                placeholder="Mobile"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white"
              />
            </div>
          </div>
        </div>

        {/* Cart Item Rows */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
              <Utensils className="w-10 h-10 mb-2 opacity-30" />
              <span>Cart is empty. Tap items to add.</span>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.itemId}
                className="p-3 rounded-xl bg-zinc-850 border border-zinc-800 flex items-center justify-between text-xs"
              >
                <div className="flex-1 pr-2">
                  <div className="font-bold text-white text-sm">{item.name}</div>
                  <div className="text-zinc-400">₹{item.price} each</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-700">
                    <button
                      onClick={() => updateQuantity(item.itemId, -1)}
                      className="min-h-[44px] min-w-[36px] flex items-center justify-center text-zinc-300 hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-[28px] text-center font-extrabold text-white text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.itemId, 1)}
                      className="min-h-[44px] min-w-[36px] flex items-center justify-center text-zinc-300 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-14 text-right font-bold text-emerald-400 text-sm">
                    ₹{item.lineTotal}
                  </div>

                  <button
                    onClick={() => removeItem(item.itemId)}
                    className="min-h-[44px] min-w-[32px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bill Breakdown & Actions */}
        <div className="p-4 bg-zinc-850 border-t border-zinc-800 space-y-3">
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-white">₹{subtotal}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Discount ({discountPercent}%):</span>
                <span>-₹{discountAmount}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>GST (5%):</span>
              <span className="font-semibold text-white">₹{gstAmount}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-white pt-1 border-t border-zinc-700">
              <span>Grand Total:</span>
              <span className="text-emerald-400 text-lg">₹{grandTotal}</span>
            </div>
          </div>

          {/* Quick Discount Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-400">Discount:</span>
            {[0, 5, 10, 15].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setDiscountPercent(pct)}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-bold ${
                  discountPercent === pct
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {pct === 0 ? '0%' : `${pct}%`}
              </button>
            ))}
          </div>

          {/* Action Buttons (Min 48px height) */}
          <div className="flex gap-2 pt-1">
            <button
              disabled={cart.length === 0}
              onClick={handleSendKotOnly}
              className="min-h-[50px] flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-zinc-700 transition-colors"
            >
              <ChefHat className="w-4 h-4 text-amber-400" />
              <span>KOT ONLY</span>
            </button>
            <button
              disabled={cart.length === 0}
              onClick={handleProceedToPay}
              className="min-h-[50px] flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>PAY & KOT (₹{grandTotal})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {payingOrder && (
        <PaymentModal
          order={payingOrder}
          restaurantName={restaurantName}
          onClose={() => setPayingOrder(null)}
          onPaymentConfirmed={handlePaymentConfirmed}
        />
      )}
    </div>
  );
};
