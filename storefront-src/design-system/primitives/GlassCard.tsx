import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** @deprecated animations removed — kept for call-site compatibility */
  delay?: number;
  hoverEffect?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = true,
}) => {
  return (
    <div
      className={`relative group bg-[var(--ob-surface)] rounded-[1.25rem] p-6 border border-[var(--ob-border)] text-[var(--ob-text-primary)] ${
        hoverEffect ? 'hover:border-[rgba(232,130,50,0.25)] hover:shadow-[0_20px_56px_-12px_rgba(0,0,0,0.72),0_0_0_1px_rgba(232,130,50,0.25)] transition-all duration-250' : ''
      } ${className}`}
    >
      {hoverEffect && (
        <div className="absolute inset-0 rounded-[1.25rem] opacity-0 group-hover:opacity-100 transition-opacity duration-250 bg-gradient-to-br from-[#E8720C]/10 via-transparent to-[#F4A05C]/8 pointer-events-none -z-10" />
      )}
      {children}
    </div>
  );
};
