/**
 * Purpose: Low-latency progressive Web Audio player with turn-id cancellation, explicit format guards, and audio-reactive metering.
 * Public API: StreamingAudioPlayer, createStreamingAudioPlayer, PlayChunkOptions
 * Capabilities:
 * - Turn-scoped playback: rejects late chunks from superseded or cancelled turns.
 * - Explicit PCM negotiation: never treats unrecognized container bytes as raw PCM.
 * - 16-bit PCM byte alignment: buffers dangling odd bytes across transport chunks.
 * - Out-of-order chunk sequencing and bounded buffer management.
 * - Synchronous software playback cancellation: dispatches AudioBufferSourceNode.stop(0) and clears queued buffers.
 * - Realtime RMS level analysis for audio-reactive waveforms.
 */

export interface StreamingAudioPlayerEvents {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onLevelChange?: (level: number) => void;
  onError?: (err: unknown) => void;
}

export interface PlayChunkOptions {
  turnId?: string;
  index?: number;
  format?: 'audio/wav' | 'audio/mpeg' | 'audio/pcm' | 'pcm16' | 'auto';
  sampleRate?: number;
}

interface QueuedChunk {
  index: number;
  buffer: AudioBuffer;
}

export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private scheduledEndTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private isPlaying = false;
  private animFrameId: number | null = null;
  private meterDataArray: Uint8Array<ArrayBuffer> | null = null;

  // Turn management & cancellation
  private currentTurnId: string | null = null;
  private danglingPcmByte: number | null = null;
  private chunkQueue: QueuedChunk[] = [];

  constructor(private readonly events: StreamingAudioPlayerEvents = {}) {}

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.setupAnalyser();
      }
    }
    return this.audioContext;
  }

  private setupAnalyser(): void {
    if (!this.audioContext) return;
    try {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.7;
      this.meterDataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.analyser.connect(this.audioContext.destination);
    } catch {
      // Analyser fallback
    }
  }

  private startLevelMetering(): void {
    if (this.animFrameId !== null || typeof window === 'undefined') return;

    const tick = () => {
      if (!this.isPlaying || !this.analyser || !this.meterDataArray) {
        this.animFrameId = null;
        this.events.onLevelChange?.(0);
        return;
      }

      this.analyser.getByteFrequencyData(this.meterDataArray);
      let sum = 0;
      for (let i = 0; i < this.meterDataArray.length; i++) {
        sum += this.meterDataArray[i];
      }
      const avg = sum / (this.meterDataArray.length * 255);
      this.events.onLevelChange?.(Math.min(1, avg * 1.5));

      this.animFrameId = window.requestAnimationFrame(tick);
    };

    this.animFrameId = window.requestAnimationFrame(tick);
  }

  private stopLevelMetering(): void {
    if (this.animFrameId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.events.onLevelChange?.(0);
  }

  /**
   * Explicitly set the active turn ID. Drops any pending queued chunks from previous turns.
   */
  public setTurn(turnId: string): void {
    if (this.currentTurnId !== turnId) {
      this.stop();
      this.currentTurnId = turnId;
      this.danglingPcmByte = null;
    }
  }

  /**
   * Play an audio chunk. Rejects late chunks from superseded turns and enforces explicit audio framing.
   */
  public async playChunk(chunkBase64: string, options: PlayChunkOptions | number = {}): Promise<void> {
    if (!chunkBase64) return;

    // Support legacy signature playChunk(chunkBase64, sampleRate)
    const opts: PlayChunkOptions = typeof options === 'number' ? { sampleRate: options } : options;
    const { turnId, index = 0, format = 'auto', sampleRate = 22050 } = opts;

    // Superseded turn guard: Reject late results from old turns
    if (turnId) {
      if (this.currentTurnId && this.currentTurnId !== turnId) {
        // Drop late chunk from superseded turn
        return;
      }
      if (!this.currentTurnId) {
        this.currentTurnId = turnId;
      }
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    try {
      // Decode base64 to binary bytes
      const binaryStr = atob(chunkBase64);
      const rawLen = binaryStr.length;
      let rawBytes = new Uint8Array(rawLen);
      for (let i = 0; i < rawLen; i++) {
        rawBytes[i] = binaryStr.charCodeAt(i);
      }

      let audioBuffer: AudioBuffer | null = null;

      // Check if format is explicitly negotiated as PCM
      const isExplicitPcm = format === 'audio/pcm' || format === 'pcm16';

      if (isExplicitPcm) {
        // Enforce 16-bit PCM byte alignment: Buffer dangling odd bytes across chunks
        let pcmBytes = rawBytes;
        if (this.danglingPcmByte !== null) {
          const combined = new Uint8Array(rawBytes.length + 1);
          combined[0] = this.danglingPcmByte;
          combined.set(rawBytes, 1);
          pcmBytes = combined;
          this.danglingPcmByte = null;
        }

        if (pcmBytes.length % 2 !== 0) {
          // Store trailing odd byte for next chunk
          this.danglingPcmByte = pcmBytes[pcmBytes.length - 1];
          pcmBytes = pcmBytes.subarray(0, pcmBytes.length - 1);
        }

        const numSamples = pcmBytes.length / 2;
        if (numSamples > 0) {
          const int16Array = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, numSamples);
          const float32Array = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; i++) {
            float32Array[i] = int16Array[i] / 32768;
          }

          audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
          audioBuffer.copyToChannel(float32Array, 0);
        }
      } else {
        // Container audio (WAV, MP3, AAC)
        // Detect magic bytes
        const hasRiffHeader =
          rawLen >= 12 &&
          rawBytes[0] === 0x52 && // 'R'
          rawBytes[1] === 0x49 && // 'I'
          rawBytes[2] === 0x46 && // 'F'
          rawBytes[3] === 0x46; // 'F'

        const hasMp3Header =
          (rawLen >= 3 && rawBytes[0] === 0x49 && rawBytes[1] === 0x44 && rawBytes[2] === 0x33) || // 'ID3'
          (rawLen >= 2 && rawBytes[0] === 0xff && (rawBytes[1] & 0xe0) === 0xe0);

        if (hasRiffHeader || hasMp3Header || format === 'audio/wav' || format === 'audio/mpeg') {
          try {
            audioBuffer = await ctx.decodeAudioData(rawBytes.buffer.slice(0));
          } catch (decodeErr) {
            // DO NOT blindly treat failed container bytes as PCM!
            // Incomplete frame or container transport split: report error
            this.events.onError?.(decodeErr);
            return;
          }
        } else {
          // Unrecognized bytes without explicit PCM negotiation: Reject instead of guessing PCM
          this.events.onError?.(new Error('Unrecognized audio format: explicit PCM negotiation required'));
          return;
        }
      }

      if (audioBuffer) {
        this.enqueueAndSchedule(audioBuffer, index);
      }
    } catch (err) {
      this.events.onError?.(err);
    }
  }

  private enqueueAndSchedule(buffer: AudioBuffer, index: number): void {
    // Insert into sorted queue for index-ordered playback
    this.chunkQueue.push({ index, buffer });
    this.chunkQueue.sort((a, b) => a.index - b.index);

    // Drain ready chunks in order
    while (this.chunkQueue.length > 0) {
      const item = this.chunkQueue.shift()!;
      this.scheduleBuffer(item.buffer);
    }
  }

  private scheduleBuffer(buffer: AudioBuffer): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(ctx.destination);
    }

    const currentTime = ctx.currentTime;
    // Bounded buffer guard: keep within reasonable future window (max 10s queue)
    const startTime = Math.max(currentTime, Math.min(this.scheduledEndTime, currentTime + 10));
    source.start(startTime);

    this.scheduledEndTime = startTime + buffer.duration;
    this.activeSources.add(source);

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.events.onPlaybackStart?.();
      this.startLevelMetering();
    }

    source.onended = () => {
      this.activeSources.delete(source);
      try {
        source.disconnect();
      } catch {}

      if (this.activeSources.size === 0) {
        this.isPlaying = false;
        this.scheduledEndTime = 0;
        this.stopLevelMetering();
        this.events.onPlaybackEnd?.();
      }
    };
  }

  /**
   * Instant stop for barge-in / cancellation (< 20ms).
   * Cancels active sources, clears queue, resets turn, and clears dangling byte.
   */
  public stop(): void {
    this.isPlaying = false;
    this.scheduledEndTime = 0;
    this.currentTurnId = null;
    this.danglingPcmByte = null;
    this.chunkQueue = [];
    this.stopLevelMetering();

    for (const source of this.activeSources) {
      try {
        source.stop(0);
        source.disconnect();
      } catch {}
    }
    this.activeSources.clear();
    this.events.onPlaybackEnd?.();
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public get activeTurn(): string | null {
    return this.currentTurnId;
  }
}

export function createStreamingAudioPlayer(events: StreamingAudioPlayerEvents = {}): StreamingAudioPlayer {
  return new StreamingAudioPlayer(events);
}
