import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeCartReminder,
  initBackgroundCartReminderListener,
  type CartReminderDetails,
} from '../src/features/cart/infrastructure/nativeCartReminderAdapter';

describe('Native Cart Reminder & Abandoned Cart Adapter Tests', () => {
  it('provides a safe isSupported check', () => {
    assert.equal(typeof nativeCartReminder.isSupported(), 'boolean');
  });

  it('safely handles scheduling with empty cart (no-op)', async () => {
    const scheduled = await nativeCartReminder.scheduleWaitingCartReminder({
      restaurantName: 'Test Kitchen',
      itemCount: 0,
      cartTotalInr: 0,
    });
    assert.equal(scheduled, false, 'Must not schedule reminder for 0 items');
  });

  it('safely cancels waiting cart reminder without throwing', async () => {
    await assert.doesNotReject(async () => {
      await nativeCartReminder.cancelWaitingCartReminder();
    });
  });

  it('initializes and cleans up background cart reminder listener', () => {
    const dummyCart: CartReminderDetails = {
      restaurantName: 'Inti Bhojanam',
      itemCount: 2,
      cartTotalInr: 450,
      estimatedDeliveryTimeMinutes: '20-25 mins',
    };

    const cleanup = initBackgroundCartReminderListener(() => dummyCart);
    assert.equal(typeof cleanup, 'function');
    cleanup();
  });
});
