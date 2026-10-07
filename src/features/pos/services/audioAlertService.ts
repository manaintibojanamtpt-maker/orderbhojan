/**
 * Web Audio API synthesized chime for incoming POS orders.
 * Zero external audio files required — runs 100% offline on any browser/tablet.
 */

class AudioAlertService {
  private audioCtx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isMuted: boolean = false;
  private isRinging: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Play a clean two-tone restaurant bell chime (880Hz -> 1174Hz, D6 harmonic).
   */
  playChime(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: A5 (880 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Note 2: D6 (1174.66 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.18);
      gain2.gain.setValueAtTime(0.35, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.85);
    } catch (e) {
      console.warn('[AudioAlertService] Could not play chime', e);
    }
  }

  /**
   * Start ringing repeatedly every 3.5 seconds until stopped/acknowledged.
   */
  startContinuousAlert(): void {
    if (this.isRinging) return;
    this.isRinging = true;
    this.playChime();
    this.intervalId = (setInterval(() => {
      this.playChime();
    }, 3500) as unknown as number);
  }

  /**
   * Stop continuous alert.
   */
  stopAlert(): void {
    this.isRinging = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAlert();
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  getIsRinging(): boolean {
    return this.isRinging;
  }
}

export const audioAlert = new AudioAlertService();
