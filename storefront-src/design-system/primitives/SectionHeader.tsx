import React from 'react';

interface SectionHeaderProps {
  label?: string;
  title?: string;
  description?: string;
  align?: 'left' | 'center';
  /** 'section' = compact mobile category/section label (default); 'hero' = landing-page scale */
  size?: 'hero' | 'section';
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  title,
  description,
  align = 'center',
  size = 'section',
  className = '',
}) => {
  const isHero = size === 'hero';
  return (
    <header
      className={`${isHero ? 'mb-6 sm:mb-8' : 'mb-2 sm:mb-3'} ${align === 'center' ? 'text-center mx-auto' : 'text-left'} max-w-3xl ${className}`}
    >
      {label && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface-strong)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E8720C] sm:mb-3">
          {label}
        </div>
      )}

      {title && (
        <h2 className={`font-display text-[var(--ob-text-primary)] tracking-[-0.015em] ${
          isHero
            ? 'text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2.5 leading-[1.1]'
            : 'text-base sm:text-lg font-bold leading-snug mb-1'
        }`}>
          {title}
        </h2>
      )}

      {description && (
        <p
          className={`${
            isHero
              ? 'text-sm sm:text-base text-neutral-400 font-medium leading-relaxed max-w-2xl'
              : 'text-xs sm:text-sm text-[var(--ob-text-secondary)] font-normal leading-snug max-w-xl'
          } ${align === 'center' ? 'mx-auto' : ''}`}
        >
          {description}
        </p>
      )}
    </header>
  );
};
