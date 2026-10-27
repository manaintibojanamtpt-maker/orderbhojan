import { MapPin, Navigation } from 'lucide-react';
import { GlassCard } from '../../primitives/GlassCard';
import { SectionHeader } from '../../primitives/SectionHeader';
import { SoftButton } from '../../primitives/SoftButton';
import type { TrackingDeliveryViewModel } from './types';

export function TrackingMapPlaceholderView() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-left"
      aria-hidden
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8720C]/10 text-[#E8720C]">
        <MapPin className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#FFF8F0]">Live tracking</p>
        <p className="text-[11px] text-[#A89B8C]">Map route active once courier is on the way</p>
      </div>
    </div>
  );
}

export interface TrackingDeliveryPanelViewProps {
  readonly delivery: TrackingDeliveryViewModel;
  readonly onOpenTracking?: () => void;
}

export function TrackingDeliveryPanelView({ delivery, onOpenTracking }: TrackingDeliveryPanelViewProps) {
  return (
    <GlassCard hoverEffect={false} className="!rounded-[1.25rem] !p-4">
      <SectionHeader title="Delivery partner" align="left" className="!mb-4 !mt-0" />
      <TrackingMapPlaceholderView />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {delivery.partner ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-[#A89B8C]">Partner</p>
            <p className="font-bold text-[#FFF8F0]">{delivery.partner}</p>
          </div>
        ) : null}
        {delivery.riderName ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-[#A89B8C]">Rider</p>
            <p className="font-bold text-[#FFF8F0]">{delivery.riderName}</p>
          </div>
        ) : null}
        {delivery.riderPhone ? (
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wide text-[#A89B8C]">Rider phone</p>
            <a href={`tel:${delivery.riderPhone}`} className="font-semibold text-[#E8720C]">
              {delivery.riderPhone}
            </a>
          </div>
        ) : null}
      </div>
      {delivery.trackingUrl && onOpenTracking ? (
        <SoftButton type="button" fullWidth className="mt-4" onClick={onOpenTracking}>
          <span className="inline-flex items-center gap-2">
            <Navigation className="h-4 w-4" aria-hidden />
            {delivery.trackButtonLabel}
          </span>
        </SoftButton>
      ) : null}
    </GlassCard>
  );
}
