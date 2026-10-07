import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { posDb } from '../db/posDatabase';
import type { PosMenuItem } from '../domain/pos.types';

interface MenuStockScreenProps {
  restaurantId: string;
}

export const MenuStockScreen: React.FC<MenuStockScreenProps> = ({ restaurantId }) => {
  const [items, setItems] = useState<PosMenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  const loadMenu = async () => {
    setLoading(true);
    try {
      const menuItems = await posDb.menu.where('restaurantId').equals(restaurantId).toArray();
      setItems(menuItems);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, [restaurantId]);

  const toggleAvailability = async (item: PosMenuItem) => {
    const nextState = !(item.isAvailable !== false);
    await posDb.setItemAvailability(item.id, nextState);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isAvailable: nextState } : i)),
    );
  };

  const categories = ['ALL', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const outOfStockCount = items.filter((i) => i.isAvailable === false).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Package className="w-7 h-7 text-amber-400" />
            <span>Stock & Menu Item Availability</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Toggle items Available or Out-of-Stock instantly for walk-in billing and online order guards
          </p>
        </div>

        {outOfStockCount > 0 && (
          <div className="px-3.5 py-2 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-extrabold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{outOfStockCount} ITEM{outOfStockCount !== 1 ? 'S' : ''} CURRENTLY OUT OF STOCK</span>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[48px] pl-10 pr-4 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[48px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-850'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Item Availability Cards Grid (Touch targets 48px+) */}
      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading menu items...</div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No items found matching criteria.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredItems.map((item) => {
            const isAvailable = item.isAvailable !== false;
            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                  isAvailable
                    ? 'bg-zinc-900 border-zinc-800'
                    : 'bg-zinc-900/60 border-rose-900/80 ring-1 ring-rose-800/40'
                }`}
              >
                <div className="flex-1 pr-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        item.type === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-zinc-400">{item.category}</span>
                  </div>
                  <div className="text-sm font-bold text-white line-clamp-1">{item.name}</div>
                  <div className="text-xs font-black text-emerald-400 mt-1">₹{item.price}</div>
                </div>

                {/* Big Toggle Touch Target (Min 48px x 48px) */}
                <button
                  onClick={() => toggleAvailability(item)}
                  className={`min-h-[48px] min-w-[120px] px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    isAvailable
                      ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-emerald-950/40'
                      : 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-950/40'
                  }`}
                >
                  {isAvailable ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>AVAILABLE</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>OUT OF STOCK</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
