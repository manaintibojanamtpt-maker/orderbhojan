/**
 * Screen Wake Lock Service
 * Keeps tablet screen awake during restaurant service hours to prevent disconnects.
 */

class WakeLockService {
  private wakeLockSentinel: any = null;
  private isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  async requestWakeLock(): Promise<boolean> {
    if (!this.isSupported) {
      console.log('[WakeLockService] Screen Wake Lock API not supported in this browser.');
      return false;
    }

    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener('release', () => {
        this.wakeLockSentinel = null;
      });

      // Auto re-acquire if visibility changes
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
      }

      return true;
    } catch (err) {
      console.warn('[WakeLockService] Could not acquire screen wake lock:', err);
      return false;
    }
  }

  private handleVisibilityChange = async () => {
    if (this.wakeLockSentinel === null && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      await this.requestWakeLock();
    }
  };

  async releaseWakeLock(): Promise<void> {
    try {
      if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      }
    } catch (err) {
      console.warn('[WakeLockService] Error releasing wake lock:', err);
    }
  }

  isActive(): boolean {
    return this.wakeLockSentinel !== null;
  }
}

export const wakeLockService = new WakeLockService();
