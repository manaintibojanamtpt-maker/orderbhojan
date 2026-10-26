import React from 'react';

interface AudioReactiveWaveformProps {
  readonly isActive: boolean;
  readonly mode?: 'listening' | 'speaking' | 'thinking' | 'idle';
  readonly level?: number; // 0.0 to 1.0
  readonly className?: string;
}

export const AudioReactiveWaveform: React.FC<AudioReactiveWaveformProps> = ({
  isActive,
  mode = 'idle',
  level = 0.2,
  className = '',
}) => {
  if (!isActive) return null;

  const barCount = 5;
  const normalizedLevel = Math.max(0.15, Math.min(1.0, level || 0.2));

  // Distinct theme for listening (Orange / Fire) vs speaking (Emerald / Green) vs thinking (Amber pulse)
  const isListening = mode === 'listening';
  const isSpeaking = mode === 'speaking';

  const barColor = isListening
    ? 'bg-gradient-to-t from-[#FF7A00] to-[#FFA726]'
    : isSpeaking
      ? 'bg-gradient-to-t from-emerald-500 to-teal-300'
      : 'bg-gradient-to-t from-amber-400 to-orange-400';

  return (
    <div
      role="status"
      aria-label={isListening ? 'Listening to speech' : isSpeaking ? 'Speaking response' : 'Thinking'}
      className={`flex items-center justify-center gap-1.5 py-1 ${className}`}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        // Multiplier varies per bar to create a natural acoustic wave curve
        const centerDistance = Math.abs(i - Math.floor(barCount / 2));
        const curveMultiplier = 1 - centerDistance * 0.2;
        const barHeight = Math.max(6, Math.round(28 * normalizedLevel * curveMultiplier));

        return (
          <span
            key={i}
            className={`w-1 rounded-full transition-all duration-150 ease-out ${barColor}`}
            style={{
              height: `${barHeight}px`,
              opacity: 0.6 + normalizedLevel * 0.4,
            }}
          />
        );
      })}
    </div>
  );
};
