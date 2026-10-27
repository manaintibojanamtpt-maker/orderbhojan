import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBillDeliveryScheduleLine } from '../src/features/checkout/domain/checkoutDeliveryDisplay.ts';

describe('formatBillDeliveryScheduleLine', () => {
  it('ASAP does not duplicate delivery timing in bill fee rows', () => {
    const line = formatBillDeliveryScheduleLine({
      deliveryTimeSlot: 'Standard Delivery (ASAP)',
      voiceScheduleNotice: null,
    });
    assert.equal(line, null);
  });

  it('Scheduled slot → Delivery / Scheduled for {slot label}', () => {
    const line = formatBillDeliveryScheduleLine({
      deliveryTimeSlot: 'Today, 8:00 PM - 8:30 PM',
      voiceScheduleNotice: { kind: 'applied' },
    });
    assert.equal(line?.label, 'Delivery Slot');
    assert.equal(line?.amountLabel, 'Scheduled for 8:00 PM - 8:30 PM');
  });

  it('Voice clarify → Delivery / Schedule unclear — please select a time', () => {
    const line = formatBillDeliveryScheduleLine({
      deliveryTimeSlot: 'Standard Delivery (ASAP)',
      voiceScheduleNotice: { kind: 'clarify' },
    });
    assert.deepEqual(line, {
      label: 'Delivery Slot',
      amountLabel: 'Schedule unclear — please select a time',
    });
  });

  it('Voice error → Delivery / Schedule unavailable — please select a time', () => {
    const line = formatBillDeliveryScheduleLine({
      deliveryTimeSlot: 'Standard Delivery (ASAP)',
      voiceScheduleNotice: { kind: 'error' },
    });
    assert.deepEqual(line, {
      label: 'Delivery Slot',
      amountLabel: 'Schedule unavailable — please select a time',
    });
  });

  it('Notice cleared after manual slot pick → Delivery / Scheduled for {slot label}', () => {
    const line = formatBillDeliveryScheduleLine({
      deliveryTimeSlot: 'Today, 8:00 PM - 8:30 PM',
      voiceScheduleNotice: null,
    });
    assert.deepEqual(line, {
      label: 'Delivery Slot',
      amountLabel: 'Scheduled for 8:00 PM - 8:30 PM',
    });
  });

  it('returns null when no slot and no clarify/error notice', () => {
    assert.equal(formatBillDeliveryScheduleLine({ deliveryTimeSlot: '', voiceScheduleNotice: null }), null);
    assert.equal(formatBillDeliveryScheduleLine({ voiceScheduleNotice: { kind: 'applied' } }), null);
  });
});
