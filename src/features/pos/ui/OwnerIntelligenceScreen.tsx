import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Sparkles,
  Flame,
  ShoppingBag,
  Award,
  Clock,
  Globe,
  Utensils,
  Banknote,
  Calendar,
} from 'lucide-react';
import { ownerIntelligence } from '../services/ownerIntelligenceService';
import type { OwnerIntelligenceSummary } from '../domain/pos.types';

interface OwnerIntelligenceScreenProps {
  restaurantId: string;
}

export const OwnerIntelligenceScreen: React.FC<OwnerIntelligenceScreenProps> = ({ restaurantId }) => {
  const [data, setData] = useState<OwnerIntelligenceSummary | null>(null);
  const [slowItemTab, setSlowItemTab] = useState<'today' | 'sevenDays' | 'thirtyDays'>('today');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const summary = await ownerIntelligence.getOwnerIntelligenceSummary(restaurantId);
      setData(summary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  if (loading || !data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm font-semibold">Aggregating real-time restaurant analytics...</p>
      </div>
    );
  }

  const {
    totalSales,
    totalOrders,
    aov,
    todayVsYesterday,
    hourlySales,
    peakHour,
    topSellersByVolume,
    topSellersByRevenue,
    slowMovingItems,
    channelComparison,
    deterministicInsights,
    weeklySummary,
    expectedCash,
    actualCash,
    cashVariance,
  } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5">
            <TrendingUp className="w-7 h-7 text-amber-400" />
            <span>Owner Intelligence & Performance</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time sales, peak dining hours, inventory velocity, and revenue drivers
          </p>
        </div>
        <button
          onClick={loadData}
          className="min-h-[44px] px-4 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-xs font-bold text-zinc-300 border border-zinc-700"
        >
          ↻ Refresh Insights
        </button>
      </div>

      {/* Deterministic Executive Summary Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-800/60 space-y-2.5">
        <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
          <Sparkles className="w-4 h-4" />
          <span>Executive Summary & Deterministic Highlights</span>
        </div>
        <div className="space-y-1.5 text-xs text-zinc-300">
          {deterministicInsights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3 Core KPI Cards (5-Second View) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Sales */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
          <div className="text-xs font-semibold text-zinc-400">Today's Total Sales</div>
          <div className="text-3xl font-black text-emerald-400">₹{totalSales.toLocaleString('en-IN')}</div>
          <div className="text-xs font-bold mt-1">
            <span className={todayVsYesterday.salesChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {todayVsYesterday.salesChangePct >= 0 ? `+${todayVsYesterday.salesChangePct}%` : `${todayVsYesterday.salesChangePct}%`}
            </span>
            <span className="text-zinc-500 font-normal ml-1.5">vs yesterday (₹{todayVsYesterday.yesterdaySales})</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
          <div className="text-xs font-semibold text-zinc-400">Total Orders Fulfilled</div>
          <div className="text-3xl font-black text-white">{totalOrders}</div>
          <div className="text-xs font-bold mt-1">
            <span className={todayVsYesterday.ordersChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {todayVsYesterday.ordersChangePct >= 0 ? `+${todayVsYesterday.ordersChangePct}%` : `${todayVsYesterday.ordersChangePct}%`}
            </span>
            <span className="text-zinc-500 font-normal ml-1.5">vs yesterday ({todayVsYesterday.yesterdayOrders})</span>
          </div>
        </div>

        {/* AOV */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
          <div className="text-xs font-semibold text-zinc-400">Average Order Value (AOV)</div>
          <div className="text-3xl font-black text-amber-400">₹{aov}</div>
          <div className="text-xs font-bold mt-1">
            <span className={todayVsYesterday.aovChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {todayVsYesterday.aovChangePct >= 0 ? `+${todayVsYesterday.aovChangePct}%` : `${todayVsYesterday.aovChangePct}%`}
            </span>
            <span className="text-zinc-500 font-normal ml-1.5">vs yesterday (₹{todayVsYesterday.yesterdayAov})</span>
          </div>
        </div>
      </div>

      {/* Hourly Sales (4:30 PM → 10:30 PM) & Peak Hour */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-sky-400" />
              <span>Hourly Sales Velocity (4:30 PM — 10:30 PM)</span>
            </h3>
            <p className="text-xs text-zinc-400">Sales and order concentration across peak evening dining hours</p>
          </div>
          {peakHour && peakHour.salesAmount > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-300 text-xs font-black flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>PEAK HOUR: {peakHour.slotLabel} (₹{peakHour.salesAmount})</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {hourlySales.map((slot) => {
            const isPeak = peakHour?.slotLabel === slot.slotLabel && slot.salesAmount > 0;
            return (
              <div
                key={slot.slotLabel}
                className={`p-3.5 rounded-xl border flex flex-col justify-between min-h-[105px] transition-all ${
                  isPeak
                    ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/40'
                    : 'bg-zinc-850 border-zinc-750'
                }`}
              >
                <div>
                  <div className="text-[11px] font-extrabold text-zinc-400">{slot.slotLabel}</div>
                  <div className={`text-lg font-black mt-1 ${isPeak ? 'text-amber-400' : 'text-white'}`}>
                    ₹{slot.salesAmount}
                  </div>
                </div>
                <div className="text-xs font-semibold text-zinc-400 mt-2">
                  {slot.ordersCount} order{slot.ordersCount !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Sellers (Volume vs Revenue) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By Volume */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Top Sellers by Volume (Quantity Sold)</span>
          </h3>
          {topSellersByVolume.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">No items sold yet.</div>
          ) : (
            <div className="space-y-2">
              {topSellersByVolume.slice(0, 5).map((item, idx) => (
                <div key={item.itemId} className="flex items-center justify-between p-3 rounded-xl bg-zinc-850 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-zinc-950 font-black flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-white">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-amber-400">{item.quantity} sold</span>
                    <span className="text-zinc-500 ml-2">(₹{item.revenue})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Revenue */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Highest Revenue Contributors</span>
          </h3>
          {topSellersByRevenue.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-500">No items sold yet.</div>
          ) : (
            <div className="space-y-2">
              {topSellersByRevenue.slice(0, 5).map((item, idx) => (
                <div key={item.itemId} className="flex items-center justify-between p-3 rounded-xl bg-zinc-850 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-zinc-950 font-black flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-white">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-emerald-400">₹{item.revenue}</span>
                    <span className="text-zinc-500 ml-2">({item.quantity} sold)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slow-Moving Items with Time Tabs */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-rose-400" />
              <span>Slow-Moving Items</span>
            </h3>
            <p className="text-xs text-zinc-400">Items with lowest demand across selected historical window</p>
          </div>
          <div className="flex bg-zinc-850 p-1 rounded-xl border border-zinc-750 gap-1">
            {(['today', 'sevenDays', 'thirtyDays'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSlowItemTab(tab)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold transition-all ${
                  slowItemTab === tab
                    ? 'bg-amber-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab === 'today' ? 'Today' : tab === 'sevenDays' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {slowMovingItems[slowItemTab].map((item) => (
            <div key={item.itemId} className="p-3.5 rounded-xl bg-zinc-850 border border-zinc-750 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800">
                  {item.category}
                </span>
                <div className="text-xs font-bold text-white mt-1.5 line-clamp-2">{item.name}</div>
              </div>
              <div className="mt-3 pt-2 border-t border-zinc-750 flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-semibold">{item.quantitySold} sold</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {item.statusCopy}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Comparison & Physical Cash Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Channels */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Channel Comparison (Online vs Walk-in)</span>
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-zinc-850 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400 font-semibold">
                <Utensils className="w-3.5 h-3.5 text-amber-400" />
                <span>Walk-in Billing</span>
              </div>
              <div className="text-xl font-black text-white">₹{channelComparison.walkInSales}</div>
              <div className="text-[11px] text-zinc-400">{channelComparison.walkInOrdersCount} orders • AOV ₹{channelComparison.walkInAov}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-850 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400 font-semibold">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>OrderBhojan Online</span>
              </div>
              <div className="text-xl font-black text-sky-400">₹{channelComparison.onlineSales}</div>
              <div className="text-[11px] text-zinc-400">{channelComparison.onlineOrdersCount} orders • AOV ₹{channelComparison.onlineAov}</div>
            </div>
          </div>
        </div>

        {/* Physical Cash Status */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span>Cash Drawer Float Status</span>
          </h3>
          <div className="p-4 rounded-xl bg-zinc-850 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Expected Cash Drawer Balance:</span>
              <span className="font-bold text-white">₹{expectedCash}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Actual Closing Cash Counted:</span>
              <span className="font-bold text-white">₹{actualCash}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-zinc-750 font-bold">
              <span>Drawer Variance:</span>
              <span className={cashVariance === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {cashVariance === 0 ? 'Balanced (₹0)' : `₹${cashVariance}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Rolling Weekly Summary */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              <span>7-Day Rolling Performance</span>
            </h3>
            <p className="text-xs text-zinc-400">
              {weeklySummary.startDate} to {weeklySummary.endDate}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-bold">
              Best Day: {weeklySummary.bestDay.date} (₹{weeklySummary.bestDay.sales})
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 font-semibold">
              Weekly Total: ₹{weeklySummary.totalRevenue}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {weeklySummary.dailyBreakdown.map((day) => (
            <div key={day.date} className="p-3 rounded-xl bg-zinc-850 border border-zinc-750 text-center">
              <div className="text-[11px] font-semibold text-zinc-400">{day.date.slice(5)}</div>
              <div className="text-sm font-extrabold text-white mt-1">₹{day.sales}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{day.orders} orders</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
