import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCheckoutEstimatedDelivery,
  formatBillDeliveryScheduleLine,
  formatTrustPanelDeliverySchedule,
} from '../src/features/checkout/domain/checkoutDeliveryDisplay';
import {
  ASAP_SLOT,
  isAsapSlot,
  buildScheduleFields,
} from '../src/features/checkout/domain/deliveryTimeSlots';
import { normalizeTrackingStatus } from '../src/features/tracking/utils/trackingSteps';
import { mapTrackingHero } from '../src/presentation/tracking/mapTrackingViews';

describe('Phase 1: scheduled order and ETA correctness', () => {
  describe('formatCheckoutEstimatedDelivery - no invented ETA', () => {
    it('shows server prep minutes for ASAP with label identifying it as estimate', () => {
      const result = formatCheckoutEstimatedDelivery(ASAP_SLOT, { prepMinutes: 25 });
      assert.equal(result, 'Estimated delivery in ~25 min');
    });

    it('shows generic message when prep minutes missing', () => {
      const result = formatCheckoutEstimatedDelivery(ASAP_SLOT, undefined);
      assert.equal(result, 'Delivering as soon as possible');
    });

    it('shows scheduled slot label for scheduled orders (no invented ETA)', () => {
      const result = formatCheckoutEstimatedDelivery('Today, 7:00 PM - 7:30 PM', { prepMinutes: 20 });
      assert.equal(result, 'Today · 7:00 PM - 7:30 PM');
    });
  });

  describe('formatBillDeliveryScheduleLine - scheduled order metadata', () => {
    it('shows scheduled slot for scheduled orders', () => {
      const result = formatBillDeliveryScheduleLine({
        deliveryTimeSlot: 'Today, 7:00 PM - 7:30 PM',
      });
      assert.equal(result?.label, 'Delivery Slot');
      assert.equal(result?.amountLabel, 'Scheduled for 7:00 PM - 7:30 PM');
    });

    it('returns null for ASAP (no delivery slot line needed)', () => {
      const result = formatBillDeliveryScheduleLine({ deliveryTimeSlot: ASAP_SLOT });
      assert.equal(result, null);
    });
  });

  describe('formatTrustPanelDeliverySchedule - scheduled order display', () => {
    it('shows scheduled time for scheduled orders', () => {
      const result = formatTrustPanelDeliverySchedule({
        deliveryTimeSlot: 'Tomorrow, 12:00 PM - 12:30 PM',
      });
      assert.equal(result, 'Scheduled for 12:00 PM - 12:30 PM');
    });

    it('shows Deliver now for ASAP', () => {
      const result = formatTrustPanelDeliverySchedule({ deliveryTimeSlot: ASAP_SLOT });
      assert.equal(result, 'Deliver now');
    });
  });

  describe('buildScheduleFields - ASAP vs scheduled', () => {
    it('returns asap for ASAP slot', () => {
      const result = buildScheduleFields(ASAP_SLOT);
      assert.equal(result.deliveryType, 'asap');
      assert.equal(result.scheduledFor, undefined);
    });

    it('returns scheduled with timestamp for scheduled slot', () => {
      const result = buildScheduleFields('Today, 9:00 AM - 9:30 AM');
      assert.equal(result.deliveryType, 'scheduled');
      assert.equal(typeof result.scheduledFor, 'string');
      // scheduledFor should be a valid ISO timestamp in the past/future (not null)
      assert.ok(new Date(result.scheduledFor!).getTime() > 0);
    });
  });

  describe('normalizeTrackingStatus - terminal states', () => {
    it('maps DELIVERED to DELIVERED', () => {
      assert.equal(normalizeTrackingStatus('DELIVERED'), 'DELIVERED');
    });
    it('maps CANCELLED to CANCELLED', () => {
      assert.equal(normalizeTrackingStatus('CANCELLED'), 'CANCELLED');
    });
    it('maps REJECTED to CANCELLED', () => {
      assert.equal(normalizeTrackingStatus('REJECTED'), 'CANCELLED');
    });
    it('maps ACCEPTED to ACCEPTED', () => {
      assert.equal(normalizeTrackingStatus('ACCEPTED'), 'ACCEPTED');
    });
    it('maps PREPARING to PREPARING', () => {
      assert.equal(normalizeTrackingStatus('PREPARING'), 'PREPARING');
    });
  });

  describe('isAsapSlot - slot type detection', () => {
    it('identifies ASAP variants', () => {
      assert.equal(isAsapSlot(ASAP_SLOT), true);
      assert.equal(isAsapSlot('ASAP'), true);
    });

    it('rejects scheduled slots', () => {
      assert.equal(isAsapSlot('Today, 9:00 AM - 9:30 AM'), false);
      assert.equal(isAsapSlot('Tomorrow, 12:00 PM - 12:30 PM'), false);
    });
  });

  describe('mapTrackingHero - scheduled vs immediate ETA correctness', () => {
    const now = new Date().toISOString();

    it('suppresses generic ETA and shows scheduled time for scheduled orders', () => {
      const tracking = {
        orderId: 'ord_123',
        orderNumber: '#831393',
        status: 'ACCEPTED',
        paymentStatus: 'paid',
        deliveryType: 'scheduled',
        scheduledFor: now,
        timeline: [],
        etaMinutes: { min: 25, max: 35 },
        restaurant: { displayName: 'Test Kitchen', slug: 'test-kitchen', restaurantId: 'rk_1' },
      } as const;

      const hero = mapTrackingHero(tracking, {
        etaLabel: '25–35 min',
        liveActive: false,
        scheduledForLabel: 'Mon, 21 Oct, 12:54 PM',
      });

      assert.equal(hero.etaLabel, undefined);
      assert.equal(hero.scheduledForLabel, 'Mon, 21 Oct, 12:54 PM');
    });

    it('shows ETA only for immediate ASAP orders when trustworthy estimate available', () => {
      const tracking = {
        orderId: 'ord_456',
        orderNumber: '#831394',
        status: 'ACCEPTED',
        paymentStatus: 'paid',
        deliveryType: 'asap',
        etaMinutes: { min: 25, max: 35 },
        timeline: [],
        restaurant: { displayName: 'Test Kitchen', slug: 'test-kitchen', restaurantId: 'rk_1' },
      } as const;

      const hero = mapTrackingHero(tracking, {
        etaLabel: '25–35 min',
        liveActive: false,
        scheduledForLabel: undefined,
      });

      assert.equal(hero.etaLabel, '25–35 min');
      assert.equal(hero.scheduledForLabel, undefined);
    });

    it('does not invent ETA when no etaMinutes for immediate orders', () => {
      const tracking = {
        orderId: 'ord_789',
        orderNumber: '#831395',
        status: 'ACCEPTED',
        paymentStatus: 'paid',
        deliveryType: 'asap',
        timeline: [],
        restaurant: { displayName: 'Test Kitchen', slug: 'test-kitchen', restaurantId: 'rk_1' },
      } as const;

      const hero = mapTrackingHero(tracking, {
        etaLabel: null,
        liveActive: false,
        scheduledForLabel: undefined,
      });

      assert.equal(hero.etaLabel, undefined);
    });

    it('classifies scheduled order when scheduledFor present even without deliveryType', () => {
      const tracking = {
        orderId: 'ord_999',
        orderNumber: '#831396',
        status: 'PREPARING',
        paymentStatus: 'paid',
        scheduledFor: now,
        etaMinutes: { min: 20, max: 30 },
        timeline: [],
        restaurant: { displayName: 'Test Kitchen', slug: 'test-kitchen', restaurantId: 'rk_1' },
      } as const;

      const hero = mapTrackingHero(tracking, {
        etaLabel: '20–30 min',
        liveActive: false,
        scheduledForLabel: 'Tomorrow, 7:30 PM',
      });

      assert.equal(hero.etaLabel, undefined);
      assert.equal(hero.scheduledForLabel, 'Tomorrow, 7:30 PM');
    });

    it('suppresses ETA for terminal delivered scheduled orders', () => {
      const tracking = {
        orderId: 'ord_terminal',
        orderNumber: '#831397',
        status: 'DELIVERED',
        paymentStatus: 'paid',
        deliveryType: 'scheduled',
        scheduledFor: now,
        etaMinutes: { min: 25, max: 35 },
        timeline: [],
        restaurant: { displayName: 'Test Kitchen', slug: 'test-kitchen', restaurantId: 'rk_1' },
      } as const;

      const hero = mapTrackingHero(tracking, {
        etaLabel: '25–35 min',
        liveActive: false,
        scheduledForLabel: 'Mon, 21 Oct, 12:54 PM',
      });

      assert.equal(hero.etaLabel, undefined);
      assert.equal(hero.scheduledForLabel, 'Mon, 21 Oct, 12:54 PM');
    });
  });
});
