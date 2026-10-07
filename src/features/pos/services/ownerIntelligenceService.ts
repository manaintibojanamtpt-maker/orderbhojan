import { posDb } from '../db/posDatabase';
import type {
  PosOrder,
  PosMenuItem,
  OwnerIntelligenceSummary,
  HourlySalesSlot,
  SlowMovingItem,
  ChannelBreakdown,
  WeeklySummary,
  ReconciliationValidationResult,
} from '../domain/pos.types';

export class OwnerIntelligenceService {
  /**
   * Helper to convert an ISO timestamp into IST date and decimal hour.
   */
  getIstDetails(dateStr: string): { decimalHour: number; dateOnly: string; hour: number; minute: number } {
    try {
      const d = new Date(dateStr);
      // IST is UTC + 5 hours 30 minutes
      const istMs = d.getTime() + (5.5 * 60 * 60 * 1000);
      const istDate = new Date(istMs);
      const hour = istDate.getUTCHours();
      const minute = istDate.getUTCMinutes();
      const decimalHour = hour + minute / 60;
      const dateOnly = istDate.toISOString().slice(0, 10);
      return { decimalHour, dateOnly, hour, minute };
    } catch {
      return { decimalHour: 0, dateOnly: new Date().toISOString().slice(0, 10), hour: 0, minute: 0 };
    }
  }

  /**
   * Calculate 6 predefined hourly slots between 4:30 PM (16.5) and 10:30 PM (22.5).
   */
  calculateHourlySlots(orders: PosOrder[]): { slots: HourlySalesSlot[]; peakHour: HourlySalesSlot | null } {
    const slotDefinitions = [
      { slotLabel: '4:30 PM - 5:30 PM', startHour: 16.5, endHour: 17.5 },
      { slotLabel: '5:30 PM - 6:30 PM', startHour: 17.5, endHour: 18.5 },
      { slotLabel: '6:30 PM - 7:30 PM', startHour: 18.5, endHour: 19.5 },
      { slotLabel: '7:30 PM - 8:30 PM', startHour: 19.5, endHour: 20.5 },
      { slotLabel: '8:30 PM - 9:30 PM', startHour: 20.5, endHour: 21.5 },
      { slotLabel: '9:30 PM - 10:30 PM', startHour: 21.5, endHour: 22.5 },
    ];

    const slots: HourlySalesSlot[] = slotDefinitions.map((def) => ({
      slotLabel: def.slotLabel,
      startHour: def.startHour,
      endHour: def.endHour,
      ordersCount: 0,
      salesAmount: 0,
    }));

    for (const order of orders) {
      if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') continue;

      const createdIso = order.timestamps?.createdAt || '';
      const { decimalHour } = this.getIstDetails(createdIso);

      for (const slot of slots) {
        if (decimalHour >= slot.startHour && decimalHour < slot.endHour) {
          slot.ordersCount += 1;
          slot.salesAmount += Number(order.pricing?.total || 0);
          break;
        }
      }
    }

    // Determine Peak Hour
    let peakHour: HourlySalesSlot | null = null;
    let maxSales = 0;
    for (const slot of slots) {
      if (slot.salesAmount > maxSales) {
        maxSales = slot.salesAmount;
        peakHour = slot;
      }
    }

    return { slots, peakHour };
  }

  /**
   * Separate ranking for top volume vs highest revenue items.
   */
  calculateItemRankings(orders: PosOrder[]): {
    topSellersByVolume: Array<{ itemId: string; name: string; quantity: number; revenue: number }>;
    topSellersByRevenue: Array<{ itemId: string; name: string; quantity: number; revenue: number }>;
  } {
    const itemMap = new Map<string, { itemId: string; name: string; quantity: number; revenue: number }>();

    for (const order of orders) {
      if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') continue;

      for (const it of order.items || []) {
        const existing = itemMap.get(it.itemId) || {
          itemId: it.itemId,
          name: it.name,
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += Number(it.quantity || 0);
        existing.revenue += Number(it.lineTotal || (it.price * it.quantity) || 0);
        itemMap.set(it.itemId, existing);
      }
    }

    const items = Array.from(itemMap.values());
    const topSellersByVolume = [...items].sort((a, b) => b.quantity - a.quantity);
    const topSellersByRevenue = [...items].sort((a, b) => b.revenue - a.revenue);

    return { topSellersByVolume, topSellersByRevenue };
  }

  /**
   * Identify slow-moving items over given date window (today, 7 days, 30 days).
   */
  calculateSlowMovingItems(
    menuItems: PosMenuItem[],
    orders: PosOrder[],
    days: number,
    referenceDate = new Date(),
  ): SlowMovingItem[] {
    const cutoffTime = referenceDate.getTime() - days * 24 * 60 * 60 * 1000;
    const windowOrders = orders.filter((o) => {
      if (o.orderStatus === 'CANCELLED' || o.orderStatus === 'REJECTED') return false;
      const orderTime = new Date(o.timestamps?.createdAt || 0).getTime();
      return orderTime >= cutoffTime;
    });

    const itemSales = new Map<string, { quantity: number; revenue: number }>();
    for (const o of windowOrders) {
      for (const it of o.items || []) {
        const curr = itemSales.get(it.itemId) || { quantity: 0, revenue: 0 };
        curr.quantity += it.quantity;
        curr.revenue += it.lineTotal || (it.price * it.quantity);
        itemSales.set(it.itemId, curr);
      }
    }

    const result: SlowMovingItem[] = menuItems.map((m) => {
      const sales = itemSales.get(m.id) || { quantity: 0, revenue: 0 };
      return {
        itemId: m.id,
        name: m.name,
        category: m.category,
        quantitySold: sales.quantity,
        revenue: sales.revenue,
        statusCopy: 'Low sales volume',
      };
    });

    // Sort ascending (lowest quantity sold first)
    return result.sort((a, b) => a.quantitySold - b.quantitySold);
  }

  /**
   * Online vs Walk-In Channel Comparison.
   */
  calculateChannelComparison(orders: PosOrder[]): ChannelBreakdown {
    let onlineOrdersCount = 0;
    let onlineSales = 0;
    let walkInOrdersCount = 0;
    let walkInSales = 0;

    const itemChannelMap = new Map<string, { itemId: string; name: string; onlineCount: number; walkInCount: number }>();

    for (const order of orders) {
      if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') continue;

      const isOnline = order.orderSource === 'ORDERBHOJAN';
      const total = Number(order.pricing?.total || 0);

      if (isOnline) {
        onlineOrdersCount += 1;
        onlineSales += total;
      } else {
        walkInOrdersCount += 1;
        walkInSales += total;
      }

      for (const it of order.items || []) {
        const itemRecord = itemChannelMap.get(it.itemId) || {
          itemId: it.itemId,
          name: it.name,
          onlineCount: 0,
          walkInCount: 0,
        };

        if (isOnline) {
          itemRecord.onlineCount += it.quantity;
        } else {
          itemRecord.walkInCount += it.quantity;
        }
        itemChannelMap.set(it.itemId, itemRecord);
      }
    }

    return {
      onlineOrdersCount,
      onlineSales,
      onlineAov: onlineOrdersCount > 0 ? Math.round(onlineSales / onlineOrdersCount) : 0,
      walkInOrdersCount,
      walkInSales,
      walkInAov: walkInOrdersCount > 0 ? Math.round(walkInSales / walkInOrdersCount) : 0,
      itemChannelSplits: Array.from(itemChannelMap.values()),
    };
  }

  /**
   * Today vs Yesterday Metrics.
   */
  calculateTodayVsYesterday(
    todayOrders: PosOrder[],
    yesterdayOrders: PosOrder[],
  ): {
    salesChangePct: number;
    ordersChangePct: number;
    aovChangePct: number;
    yesterdaySales: number;
    yesterdayOrders: number;
    yesterdayAov: number;
  } {
    const validToday = todayOrders.filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');
    const validYesterday = yesterdayOrders.filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');

    const todaySales = validToday.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
    const yesterdaySales = validYesterday.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

    const todayCount = validToday.length;
    const yesterdayCount = validYesterday.length;

    const todayAov = todayCount > 0 ? todaySales / todayCount : 0;
    const yesterdayAov = yesterdayCount > 0 ? yesterdaySales / yesterdayCount : 0;

    const salesChangePct = yesterdaySales > 0 ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100) : 0;
    const ordersChangePct = yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0;
    const aovChangePct = yesterdayAov > 0 ? Math.round(((todayAov - yesterdayAov) / yesterdayAov) * 100) : 0;

    return {
      salesChangePct,
      ordersChangePct,
      aovChangePct,
      yesterdaySales,
      yesterdayOrders: yesterdayCount,
      yesterdayAov: Math.round(yesterdayAov),
    };
  }

  /**
   * 7-Day Rolling Summary.
   */
  calculateWeeklySummary(orders: PosOrder[], targetDateStr: string): WeeklySummary {
    const targetDate = new Date(targetDateStr);
    const sevenDaysAgo = new Date(targetDate.getTime() - 6 * 24 * 60 * 60 * 1000);

    const startDateStr = sevenDaysAgo.toISOString().slice(0, 10);
    const endDateStr = targetDate.toISOString().slice(0, 10);

    const dailyMap = new Map<string, { sales: number; orders: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      dailyMap.set(d.toISOString().slice(0, 10), { sales: 0, orders: 0 });
    }

    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of orders) {
      if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED') continue;
      const orderDate = (order.timestamps?.createdAt || '').slice(0, 10);
      if (dailyMap.has(orderDate)) {
        const cur = dailyMap.get(orderDate)!;
        const total = Number(order.pricing?.total || 0);
        cur.sales += total;
        cur.orders += 1;
        totalRevenue += total;
        totalOrders += 1;
      }
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      sales: data.sales,
      orders: data.orders,
    }));

    let bestDay = dailyBreakdown[0] || { date: endDateStr, sales: 0 };
    let worstDay = dailyBreakdown[0] || { date: endDateStr, sales: 0 };

    for (const day of dailyBreakdown) {
      if (day.sales > bestDay.sales) bestDay = day;
      if (day.sales < worstDay.sales) worstDay = day;
    }

    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    return {
      startDate: startDateStr,
      endDate: endDateStr,
      totalRevenue,
      totalOrders,
      aov,
      bestDay: { date: bestDay.date, sales: bestDay.sales },
      worstDay: { date: worstDay.date, sales: worstDay.sales },
      dailyBreakdown,
    };
  }

  /**
   * Deterministic, rules-based business insights (No LLM hallucinations).
   */
  generateDeterministicInsights(
    summary: {
      totalSales: number;
      totalOrders: number;
      aov: number;
      peakHour: HourlySalesSlot | null;
      channelComparison: ChannelBreakdown;
      topSellersByVolume: Array<{ name: string; quantity: number }>;
      cashVariance: number;
    },
  ): string[] {
    const insights: string[] = [];

    if (summary.totalOrders === 0) {
      return ['No completed sales transactions recorded for this business date yet.'];
    }

    if (summary.peakHour && summary.peakHour.salesAmount > 0) {
      insights.push(
        `🔥 Peak business hour was ${summary.peakHour.slotLabel} generating ₹${summary.peakHour.salesAmount.toLocaleString('en-IN')} across ${summary.peakHour.ordersCount} orders.`,
      );
    }

    const totalRevenue = summary.channelComparison.onlineSales + summary.channelComparison.walkInSales;
    if (totalRevenue > 0) {
      const walkInPct = Math.round((summary.channelComparison.walkInSales / totalRevenue) * 100);
      const onlinePct = 100 - walkInPct;
      insights.push(
        `📊 Channel Distribution: Walk-in dining accounted for ${walkInPct}% (₹${summary.channelComparison.walkInSales.toLocaleString('en-IN')}) and Online orders accounted for ${onlinePct}% (₹${summary.channelComparison.onlineSales.toLocaleString('en-IN')}).`,
      );
    }

    if (summary.topSellersByVolume.length > 0) {
      const top = summary.topSellersByVolume[0];
      insights.push(`⭐ Top-selling item: "${top.name}" with ${top.quantity} orders fulfilled.`);
    }

    if (summary.cashVariance === 0) {
      insights.push('✅ Cash Drawer Balance: Expected physical cash exactly matches drawer count.');
    } else if (summary.cashVariance > 0) {
      insights.push(`⚠️ Cash Drawer Notice: Drawer has an excess of ₹${summary.cashVariance.toLocaleString('en-IN')}.`);
    } else {
      insights.push(`⚠️ Cash Drawer Shortage: Drawer is short by ₹${Math.abs(summary.cashVariance).toLocaleString('en-IN')}.`);
    }

    return insights;
  }

  /**
   * Full 5-second Owner Intelligence Summary.
   */
  async getOwnerIntelligenceSummary(
    restaurantId: string,
    targetDateStr?: string,
  ): Promise<OwnerIntelligenceSummary> {
    const todayStr = targetDateStr || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(todayStr);
    const yesterdayDate = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const allOrders = await posDb.orders.where('restaurantId').equals(restaurantId).toArray();
    const menuItems = await posDb.menu.where('restaurantId').equals(restaurantId).toArray();
    const dayState = await posDb.getBusinessDayState(restaurantId, todayStr);

    const todayOrders = allOrders.filter((o) => (o.timestamps?.createdAt || '').startsWith(todayStr));
    const yesterdayOrders = allOrders.filter((o) => (o.timestamps?.createdAt || '').startsWith(yesterdayStr));

    const validTodayOrders = todayOrders.filter(
      (o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED',
    );

    const totalSales = validTodayOrders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
    const totalOrders = validTodayOrders.length;
    const aov = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    const paymentSplit = {
      cash: 0,
      upi: 0,
      card: 0,
      online: 0,
      other: 0,
    };

    for (const o of validTodayOrders) {
      const amt = Number(o.pricing?.total || 0);
      const method = o.paymentMethod;
      if (method === 'CASH') paymentSplit.cash += amt;
      else if (method === 'UPI') paymentSplit.upi += amt;
      else if (method === 'CARD') paymentSplit.card += amt;
      else if (method === 'RAZORPAY') paymentSplit.online += amt;
      else paymentSplit.other += amt;
    }

    const openingFloat = dayState.openingFloat || 0;
    const expectedCash = openingFloat + paymentSplit.cash;
    const actualCash = typeof dayState.actualClosingCash === 'number' ? dayState.actualClosingCash : expectedCash;
    const cashVariance = actualCash - expectedCash;

    const { slots: hourlySales, peakHour } = this.calculateHourlySlots(todayOrders);
    const { topSellersByVolume, topSellersByRevenue } = this.calculateItemRankings(todayOrders);

    const slowMovingItems = {
      today: this.calculateSlowMovingItems(menuItems, allOrders, 1, targetDate).slice(0, 5),
      sevenDays: this.calculateSlowMovingItems(menuItems, allOrders, 7, targetDate).slice(0, 5),
      thirtyDays: this.calculateSlowMovingItems(menuItems, allOrders, 30, targetDate).slice(0, 5),
    };

    const channelComparison = this.calculateChannelComparison(todayOrders);
    const todayVsYesterday = this.calculateTodayVsYesterday(todayOrders, yesterdayOrders);
    const weeklySummary = this.calculateWeeklySummary(allOrders, todayStr);

    const deterministicInsights = this.generateDeterministicInsights({
      totalSales,
      totalOrders,
      aov,
      peakHour,
      channelComparison,
      topSellersByVolume,
      cashVariance,
    });

    return {
      totalSales,
      totalOrders,
      aov,
      onlineVsWalkIn: {
        onlineOrders: channelComparison.onlineOrdersCount,
        onlineSales: channelComparison.onlineSales,
        walkInOrders: channelComparison.walkInOrdersCount,
        walkInSales: channelComparison.walkInSales,
      },
      paymentSplit,
      expectedCash,
      actualCash,
      cashVariance,
      hourlySales,
      peakHour,
      topSellersByVolume,
      topSellersByRevenue,
      slowMovingItems,
      channelComparison,
      deterministicInsights,
      todayVsYesterday,
      weeklySummary,
    };
  }

  /**
   * Cross-checks and validates reconciliation math.
   * Flag mismatches with ⚠️ RECONCILIATION ISSUE.
   */
  validateReconciliation(
    orders: PosOrder[],
    payments: Array<{ amount: number; status: string }>,
  ): ReconciliationValidationResult {
    const validOrders = orders.filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');

    const ordersTotal = validOrders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

    const collectedPaymentsTotal = payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const onlineSales = validOrders
      .filter((o) => o.orderSource === 'ORDERBHOJAN')
      .reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

    const walkInSales = validOrders
      .filter((o) => o.orderSource === 'WALK_IN')
      .reduce((sum, o) => sum + (o.pricing?.total || 0), 0);

    const channelSumTotal = onlineSales + walkInSales;

    const itemRevenueSumTotal = validOrders.reduce((orderSum, o) => {
      const orderItemsTotal = (o.items || []).reduce((itSum, it) => itSum + (it.lineTotal || (it.price * it.quantity)), 0);
      return orderSum + orderItemsTotal;
    }, 0);

    // Mismatch threshold ₹1 for rounding differences
    const variance = Math.abs(ordersTotal - collectedPaymentsTotal);
    const hasMismatch = payments.length > 0 && variance > 1;

    return {
      isValid: !hasMismatch,
      hasMismatch,
      ordersTotal,
      collectedPaymentsTotal,
      channelSumTotal,
      itemRevenueSumTotal,
      variance,
      message: hasMismatch
        ? `⚠️ RECONCILIATION ISSUE: Payment collection total (₹${collectedPaymentsTotal}) does not match order totals (₹${ordersTotal}). Variance: ₹${variance}.`
        : 'All reconciliation checks passed.',
    };
  }
}

export const ownerIntelligence = new OwnerIntelligenceService();
