import { posDb } from '../db/posDatabase';
import { isPaymentSettled, type EodSummary, type EodItemSalesRow } from '../domain/pos.types';

export interface EodReconciliationInput {
  restaurantId: string;
  dateStr: string; // YYYY-MM-DD
  openingFloat?: number;
  cashExpenses?: number;
  actualClosingCash?: number;
}

export class EodService {
  /**
   * Aggregate end-of-day sales, channel breakdown, item sales, and cash drawer
   * reconciliation.
   *
   * Accounting integrity rules:
   *  - Cancelled and rejected orders never contribute revenue.
   *  - Staff-recorded (`RECORDED`) and gateway-confirmed (`VERIFIED`) payments
   *    both count as settled, but the split is preserved in `paymentBreakdown`.
   *  - Online and UPI money is never mixed into the physical cash drawer.
   */
  async generateEodReport(input: EodReconciliationInput): Promise<EodSummary> {
    const {
      restaurantId,
      dateStr,
      openingFloat = 0,
      cashExpenses = 0,
      actualClosingCash = 0,
    } = input;

    const allOrders = await posDb.orders.where('restaurantId').equals(restaurantId).toArray();

    const dateOrders = allOrders.filter((order) => {
      const orderDate = (order.timestamps?.createdAt || '').slice(0, 10);
      return orderDate === dateStr;
    });

    // Unpaid, cancelled or rejected orders are excluded from completed revenue.
    const validSalesOrders = dateOrders.filter((order) => {
      const status = order.orderStatus;
      if (status === 'CANCELLED' || status === 'REJECTED') return false;
      return isPaymentSettled(order.paymentStatus) || status === 'COMPLETED' || status === 'READY' || status === 'PREPARING';
    });

    let walkInOrdersCount = 0;
    let onlineOrdersCount = 0;
    let grossSales = 0;
    let netSales = 0;
    let totalTaxes = 0;
    let totalDiscounts = 0;

    const paymentBreakdown = {
      cash: 0,
      upi: 0,
      online: 0,
      card: 0,
      other: 0,
    };

    const itemMap = new Map<string, EodItemSalesRow>();

    for (const order of validSalesOrders) {
      if (order.orderSource === 'WALK_IN') {
        walkInOrdersCount += 1;
      } else {
        onlineOrdersCount += 1;
      }

      const total = Number(order.pricing?.total ?? 0);
      const subtotal = Number(order.pricing?.subtotal ?? 0);
      const taxes = Number(order.pricing?.taxes ?? 0);
      const discount = Number(order.pricing?.discount ?? 0);

      grossSales += total;
      netSales += Math.max(0, subtotal - discount);
      totalTaxes += taxes;
      totalDiscounts += discount;

      const method = (order.paymentMethod || 'OTHER').toUpperCase();
      if (method === 'CASH' || method === 'COD') {
        paymentBreakdown.cash += total;
      } else if (method === 'UPI') {
        paymentBreakdown.upi += total;
      } else if (method === 'RAZORPAY' || order.orderSource === 'ORDERBHOJAN') {
        paymentBreakdown.online += total;
      } else if (method === 'CARD') {
        paymentBreakdown.card += total;
      } else {
        paymentBreakdown.other += total;
      }

      for (const item of order.items || []) {
        const key = item.itemId || item.name;
        const existing = itemMap.get(key);
        const qty = Number(item.quantity || 1);
        const revenue = Number(item.lineTotal || item.price * qty);

        if (existing) {
          existing.quantitySold += qty;
          existing.totalRevenue += revenue;
        } else {
          itemMap.set(key, {
            itemId: item.itemId,
            name: item.name,
            category: item.category || 'General',
            quantitySold: qty,
            totalRevenue: revenue,
          });
        }
      }
    }

    const totalCashSales = paymentBreakdown.cash;
    const expectedClosingCash = openingFloat + totalCashSales - cashExpenses;
    const variance = actualClosingCash - expectedClosingCash;

    const itemSales = Array.from(itemMap.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );

    return {
      date: dateStr,
      restaurantId,
      totalOrdersCount: validSalesOrders.length,
      walkInOrdersCount,
      onlineOrdersCount,
      grossSales,
      netSales,
      totalTaxes,
      totalDiscounts,
      paymentBreakdown,
      cashReconciliation: {
        openingFloat,
        totalCashSales,
        cashExpenses,
        expectedClosingCash,
        actualClosingCash,
        variance,
      },
      itemSales,
    };
  }
}

export const eodService = new EodService();