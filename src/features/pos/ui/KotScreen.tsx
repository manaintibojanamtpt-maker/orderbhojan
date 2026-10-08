import React, { useEffect, useState } from 'react';
import { ChefHat, Clock, Printer, CheckCircle2, Play } from 'lucide-react';
import { posDb } from '../db/posDatabase';
import type { Kot, KotStatus } from '../domain/pos.types';

interface KotScreenProps {
  restaurantId: string;
}

export const KotScreen: React.FC<KotScreenProps> = ({ restaurantId }) => {
  const [kots, setKots] = useState<Kot[]>([]);
  const [activeFilter, setActiveFilter] = useState<KotStatus | 'ALL'>('ALL');
  const [printKot, setPrintKot] = useState<Kot | null>(null);

  const loadKots = async () => {
    const records = await posDb.kots
      .where('restaurantId')
      .equals(restaurantId)
      .toArray();

    // Sort active ones first, newest first
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setKots(records);
  };

  useEffect(() => {
    loadKots();
    const interval = window.setInterval(loadKots, 5000);
    return () => window.clearInterval(interval);
  }, [restaurantId]);

  const updateKotStatus = async (kotId: string, nextStatus: KotStatus) => {
    await posDb.kots.update(kotId, { status: nextStatus });
    await loadKots();
  };

  const handlePrint = (kot: Kot) => {
    setPrintKot(kot);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const filteredKots = kots.filter((k) => {
    if (activeFilter === 'ALL') return k.status !== 'READY';
    return k.status === activeFilter;
  });

  const getElapsedMinutes = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(ms / 60000));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-amber-400" />
            <span>Kitchen Order Tickets (KOT)</span>
          </h2>
          <p className="text-xs text-zinc-400">Live kitchen preparation queue</p>
        </div>

        {/* Filter Pills */}
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          {(['ALL', 'PENDING', 'PREPARING', 'READY'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`min-h-[48px] px-5 rounded-lg text-xs font-bold transition-colors ${
                activeFilter === filter
                  ? 'bg-amber-500 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {filter === 'ALL' ? 'ACTIVE TICKETS' : filter}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of KOT Cards */}
      {filteredKots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <ChefHat className="w-12 h-12 mb-2 stroke-1 opacity-40" />
          <p className="text-sm">No KOT tickets in this queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredKots.map((kot) => {
            const elapsed = getElapsedMinutes(kot.createdAt);
            const isLate = elapsed >= 20;

            return (
              <div
                key={kot.id}
                className={`rounded-2xl bg-zinc-900 border flex flex-col justify-between overflow-hidden shadow-lg transition-all ${
                  isLate
                    ? 'border-rose-600/80 ring-1 ring-rose-500/50'
                    : kot.status === 'PREPARING'
                      ? 'border-amber-500/60'
                      : 'border-zinc-800'
                }`}
              >
                {/* Top header */}
                <div className="p-4 bg-zinc-800/60 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-white">KOT #{kot.kotNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">
                        {kot.orderType}
                      </span>
                    </div>
                    {kot.tableNo && (
                      <div className="text-xs text-amber-400 font-bold">Table: {kot.tableNo}</div>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                    isLate ? 'bg-rose-950 text-rose-300' : 'bg-zinc-800 text-zinc-300'
                  }`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{elapsed}m ago</span>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-2.5 flex-1">
                  {kot.items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-white">
                        <span className="inline-block min-w-[24px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 text-xs font-black mr-2 text-center">
                          {item.quantity}x
                        </span>
                        <span>{item.name}</span>
                        {item.notes && (
                          <div className="text-xs text-amber-300/90 italic pl-8 mt-0.5">
                            Note: {item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {kot.notes && (
                    <div className="p-2 rounded-lg bg-zinc-800/80 text-xs text-zinc-300 border border-zinc-700 mt-2">
                      <strong>Special:</strong> {kot.notes}
                    </div>
                  )}
                </div>

                {/* Actions Footer (Min 48px touch targets) */}
                <div className="p-3 bg-zinc-850 border-t border-zinc-800 flex items-center gap-2">
                  <button
                    onClick={() => handlePrint(kot)}
                    className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    title="Print KOT"
                  >
                    <Printer className="w-5 h-5" />
                  </button>

                  {kot.status === 'PENDING' && (
                    <button
                      onClick={() => updateKotStatus(kot.id, 'PREPARING')}
                      className="min-h-[48px] flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-zinc-950 flex items-center justify-center gap-1.5 text-xs transition-colors"
                    >
                      <Play className="w-4 h-4 fill-zinc-950" />
                      <span>START COOKING</span>
                    </button>
                  )}

                  {kot.status === 'PREPARING' && (
                    <button
                      onClick={() => updateKotStatus(kot.id, 'READY')}
                      className="min-h-[48px] flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-zinc-950 flex items-center justify-center gap-1.5 text-xs transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>MARK READY</span>
                    </button>
                  )}

                  {kot.status === 'READY' && (
                    <div className="min-h-[48px] flex-1 flex items-center justify-center text-xs text-emerald-400 font-bold">
                      ✓ READY FOR PICKUP
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden Thermal Print Element for KOT */}
      {printKot && (
        <div id="thermal-print-area" className="hidden print:block">
          <div className="print-center print-bold print-large">*** KITCHEN ORDER TICKET ***</div>
          <div className="print-dashed" />
          <div className="print-row print-bold">
            <span>KOT #: {printKot.kotNumber}</span>
            <span>{new Date(printKot.createdAt).toLocaleTimeString()}</span>
          </div>
          <div className="print-row">
            <span>Type: {printKot.orderType}</span>
            <span>{printKot.tableNo ? `Table: ${printKot.tableNo}` : ''}</span>
          </div>
          <div className="print-dashed" />
          {printKot.items.map((it, idx) => (
            <div key={idx} className="print-row print-bold" style={{ fontSize: '13pt', margin: '6px 0' }}>
              <span>{it.quantity}x {it.name}</span>
            </div>
          ))}
          {printKot.notes && (
            <>
              <div className="print-dashed" />
              <div>Note: {printKot.notes}</div>
            </>
          )}
          <div className="print-dashed" />
          <div className="print-center">-- Kitchen Copy --</div>
        </div>
      )}
    </div>
  );
};
