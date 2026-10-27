import React from 'react';

interface SectionProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  background?: 'default' | 'subtle' | 'dark' | 'gradient';
  /** comfortable = default; spacious = emphasis blocks; hero = page title under fixed header */
  density?: 'comfortable' | 'spacious' | 'hero';
}

export const Section: React.FC<SectionProps> = ({
  id,
  children,
  className = '',
  background = 'default',
  density = 'comfortable',
}) => {
  const bgClasses = {
    default: 'bg-[var(--ob-bg)] text-[var(--ob-text-primary)]',
    subtle: 'bg-[var(--ob-surface)] text-[var(--ob-text-primary)]',
    dark: 'bg-[var(--ob-surface-strong)] text-[var(--ob-text-primary)]',
    gradient: 'bg-[var(--ob-bg)] text-[var(--ob-text-primary)] relative overflow-visible',
  };

  const densityClasses =
    density === 'spacious'
      ? 'py-8 sm:py-12 lg:py-16'
      : density === 'hero'
        ? 'pt-2 sm:pt-3 pb-4 sm:pb-6'
        : 'py-4 sm:py-6 lg:py-8';

  return (
    <section id={id} className={`w-full ${densityClasses} relative ${bgClasses[background]} ${className}`}>
      {background === 'gradient' && (
        <>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[480px] bg-gradient-to-b from-[#E8720C]/[0.05] via-[#E8720C]/[0.01] to-transparent blur-[100px] pointer-events-none" />
        </>
      )}
              <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {children}
      </div>
    </section>
  );
};
