import { useCallback, useRef, useState, useMemo } from 'react';
import {
  captureNativeAndroidStt,
  isNativeAndroidSttAvailable,
  nativeSttCancelListening,
} from '../infrastructure/nativeAndroidSttBridge';
import {
  captureVoiceTranscript,
  forceStopSpeechCapture,
  isVoiceCaptureAvailable,
  settleMicForSpeechCapture,
} from '../infrastructure/voiceSpeechCapture';
import {
  startAudioRecording,
  isMediaRecorderSupported,
  type AudioRecordingSession,
} from '../infrastructure/audioBlobRecorder';
import {
  transcribeAudioViaGateway,
} from '../infrastructure/voiceSttGatewayClient';
import {
  buildDynamicMenuKeyterms,
  type RestaurantContextForKeyterms,
} from '../domain/buildDynamicMenuKeyterms';
import { AssistantApiError } from '../types';
import { useAiNativeSttFeature } from '../hooks/useAiNativeSttFeature';
import { useAiVoiceStreamingFeature } from '../hooks/useAiVoiceStreamingFeature';
import {
  createRealtimeVoiceClient,
  isVoiceStreamingSupported,
  type RealtimeVoiceSession,
} from '../infrastructure/realtimeVoiceClient';

/** Telugu WebView STT is weak — prefer native Android recognizer when present. */
function preferNativeSttForLanguage(lang: string): boolean {
  const normalized = lang.trim().toLowerCase();
  return normalized === 'te' || normalized.startsWith('te-') || normalized.startsWith('te_');
}

export interface StartListeningOptions {
  lang: string;
  agentMode: boolean;
  ac: AbortController;
  onInterim?: (partial: string) => void;
  /** When false, must not open the mic (sheet closed / agent stopped). */
  isVoiceSessionLive?: () => boolean;
  restaurantId?: string;
  restaurantSlug?: string;
  restaurantContext?: RestaurantContextForKeyterms;
  customKeyterms?: readonly string[];
}

export function useVoiceStt() {
  const nativeSttEnabled = useAiNativeSttFeature();
  const streamingEnabled = useAiVoiceStreamingFeature();
  const [listening, setListening] = useState(false);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const realtimeClientRef = useRef<RealtimeVoiceSession | null>(null);
  const activeRecorderRef = useRef<AudioRecordingSession | null>(null);

  const voiceCaptureAvailable = useMemo(
    () => isVoiceCaptureAvailable() || isVoiceStreamingSupported() || isMediaRecorderSupported(),
    [],
  );

  const stopListening = useCallback(async () => {
    if (activeRecorderRef.current) {
      await activeRecorderRef.current.stop();
    }
  }, []);

  const cancelListening = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    if (realtimeClientRef.current) {
      realtimeClientRef.current.cancel();
      realtimeClientRef.current.disconnect();
      realtimeClientRef.current = null;
    }
    if (activeRecorderRef.current) {
      activeRecorderRef.current.cancel();
      activeRecorderRef.current = null;
    }
    forceStopSpeechCapture();
    void nativeSttCancelListening();
    setListening(false);
  }, []);

  const startListening = useCallback(
    async (options: StartListeningOptions): Promise<string> => {
      const {
        lang,
        agentMode,
        ac,
        onInterim,
        isVoiceSessionLive,
        restaurantId,
        restaurantSlug,
        restaurantContext,
        customKeyterms,
      } = options;

      const sessionLive = () => isVoiceSessionLive?.() !== false && !ac.signal.aborted;

      const canUseNative =
        isNativeAndroidSttAvailable() &&
        (nativeSttEnabled || preferNativeSttForLanguage(lang));
      if (!canUseNative && !voiceCaptureAvailable) {
        throw new AssistantApiError({
          code: 'AI_VOICE_UNSUPPORTED',
          message: 'Speech recognition is not available on this device.',
          retryable: false,
        });
      }

      if (!sessionLive()) {
        throw new AssistantApiError({
          code: 'AI_VOICE_ABORTED',
          message: 'Voice capture was aborted.',
          retryable: false,
        });
      }

      voiceAbortRef.current = ac;
      setListening(true);

      try {
        let transcript: string | undefined;

        // 1. Android Native Path: On-device speech recognition with live partials
        if (!transcript && canUseNative) {
          try {
            const native = await captureNativeAndroidStt({
              enabled: canUseNative,
              signal: ac.signal,
              lang,
              onPartial: onInterim,
            });
            if (native?.transcript) {
              transcript = native.transcript;
            }
          } catch (nativeErr) {
            if (
              nativeErr instanceof AssistantApiError &&
              nativeErr.code === 'AI_VOICE_PERMISSION_DENIED'
            ) {
              throw nativeErr;
            }
            if (
              nativeErr instanceof AssistantApiError &&
              (nativeErr.code === 'AI_VOICE_ABORTED' ||
                (nativeErr.code === 'AI_VOICE_EMPTY' && !voiceCaptureAvailable))
            ) {
              throw nativeErr;
            }
          }
        }

        // 1. Preferred path: Realtime streaming STT over WebSocket (/api/voice/stream)
        if (streamingEnabled && isVoiceStreamingSupported() && !canUseNative) {
          try {
            let sessionResolver: ((val: string) => void) | null = null;
            let sessionRejecter: ((err: any) => void) | null = null;

            const session = createRealtimeVoiceClient({
              onPartialTranscript: (data) => {
                if (sessionLive() && data.transcript) {
                  onInterim?.(data.transcript);
                }
              },
              onFinalTranscript: (data) => {
                if (sessionResolver && data.transcript?.trim()) {
                  sessionResolver(data.transcript.trim());
                  sessionResolver = null;
                }
              },
              onError: (err) => {
                if (sessionRejecter) {
                  sessionRejecter(
                    new AssistantApiError({
                      code: 'AI_VOICE_ERROR',
                      message: err?.message || 'Streaming STT failed',
                      retryable: true,
                    }),
                  );
                  sessionRejecter = null;
                }
              },
            });

            realtimeClientRef.current = session;
            const connected = await session.connect();

            if (connected && sessionLive()) {
              const micStarted = await session.startMicrophoneCapture();
              if (micStarted) {
                transcript = await new Promise<string>((resolve, reject) => {
                  sessionResolver = resolve;
                  sessionRejecter = reject;

                  const timer = setTimeout(() => {
                    if (sessionRejecter) {
                      sessionRejecter(
                        new AssistantApiError({
                          code: 'AI_VOICE_TIMEOUT',
                          message: 'No speech detected within time limit.',
                          retryable: true,
                        }),
                      );
                      sessionRejecter = null;
                    }
                  }, agentMode ? 14_000 : 12_000);

                  ac.signal.addEventListener(
                    'abort',
                    () => {
                      clearTimeout(timer);
                      if (sessionRejecter) {
                        sessionRejecter(
                          new AssistantApiError({
                            code: 'AI_VOICE_ABORTED',
                            message: 'Voice capture was aborted.',
                            retryable: false,
                          }),
                        );
                        sessionRejecter = null;
                      }
                    },
                    { once: true },
                  );
                });
              }
            }
          } catch (streamErr) {
            if (
              streamErr instanceof AssistantApiError &&
              (streamErr.code === 'AI_VOICE_ABORTED' || streamErr.code === 'AI_VOICE_TIMEOUT')
            ) {
              throw streamErr;
            }
            // Otherwise fall back quietly
          } finally {
            if (realtimeClientRef.current) {
              realtimeClientRef.current.stopMicrophoneCapture();
              realtimeClientRef.current.disconnect();
              realtimeClientRef.current = null;
            }
          }
        }

        // 2. Gateway STT Path: Sarvam Saaras v4 with Dynamic Menu Biasing
        if (!transcript && isMediaRecorderSupported()) {
          try {
            await settleMicForSpeechCapture(agentMode ? 250 : 150);
            if (sessionLive()) {
              const recorder = await startAudioRecording({
                maxDurationMs: agentMode ? 12000 : 10000,
                silenceTimeoutMs: agentMode ? 1100 : 1000,
                speechArmingWindowMs: 1000,
                rmsThreshold: 0.025,
                signal: ac.signal,
              });
              activeRecorderRef.current = recorder;

              // Record speech while user speaks until finished (silence, timeout, or user stop)
              const audioBlob = await recorder.completion;
              activeRecorderRef.current = null;

              if (audioBlob && sessionLive()) {
                const keyterms = buildDynamicMenuKeyterms(restaurantContext, customKeyterms);
                const gatewayResult = await transcribeAudioViaGateway({
                  audioBlob,
                  lang: lang || 'unknown',
                  keyterms,
                  restaurantId,
                  restaurantSlug,
                  signal: ac.signal,
                });

                if (gatewayResult.transcript) {
                  transcript = gatewayResult.transcript;
                }
              }
            }
          } catch (gatewayErr) {
            activeRecorderRef.current = null;
            if (
              gatewayErr instanceof AssistantApiError &&
              (gatewayErr.code === 'AI_VOICE_ABORTED' ||
                gatewayErr.code === 'AI_VOICE_TIMEOUT' ||
                gatewayErr.code === 'AI_VOICE_PERMISSION_DENIED')
            ) {
              throw gatewayErr;
            }
            // Fall back to native or Web Speech
          }
        }

        

        // 4. Fallback path: Web Speech API
        if (!transcript) {
          if (!isVoiceCaptureAvailable()) {
            throw new AssistantApiError({
              code: 'AI_VOICE_UNSUPPORTED',
              message: 'Native voice failed and Web Speech is unavailable. Type your request instead.',
              retryable: false,
            });
          }
          await settleMicForSpeechCapture(agentMode ? 550 : 400);
          if (!sessionLive()) {
            forceStopSpeechCapture();
            throw new AssistantApiError({
              code: 'AI_VOICE_ABORTED',
              message: 'Voice capture was aborted.',
              retryable: false,
            });
          }
          const web = await captureVoiceTranscript({
            signal: ac.signal,
            platform: 'web',
            lang,
            timeoutMs: agentMode ? 10_000 : 7_000,
            onInterim,
          });
          transcript = web.transcript;
        }

        if (!sessionLive()) {
          forceStopSpeechCapture();
          throw new AssistantApiError({
            code: 'AI_VOICE_ABORTED',
            message: 'Voice capture was aborted.',
            retryable: false,
          });
        }

        return transcript;
      } finally {
        if (voiceAbortRef.current === ac) {
          voiceAbortRef.current = null;
        }
        setListening(false);
      }
    },
    [nativeSttEnabled, streamingEnabled, voiceCaptureAvailable],
  );

  return {
    listening,
    setListening,
    startListening,
    stopListening,
    cancelListening,
    voiceCaptureAvailable,
    voiceAbortRef,
  };
}
