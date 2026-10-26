import React, { memo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { landingFaq } from '../../config/landing';

export const LandingFAQ = memo(function LandingFAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Section id="faq" background="subtle" className="scroll-mt-24">
      <SectionHeader
        label="FAQ"
        title="Questions From Restaurant Owners"
        description="Everything you need to know before launching your direct storefront."
      />

      <div className="marketing-faq-list max-w-2xl mx-auto">
        {landingFaq.map((item, i) => {
          const isOpen = open === i;
          return (
            <article
              key={item.question}
              className="marketing-faq-item border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-200"
              data-open={isOpen ? 'true' : 'false'}
            >
              <button
                type="button"
                id={`faq-trigger-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="marketing-faq-trigger w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-[#0A0A0A] hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-semibold text-white text-sm sm:text-[15px] leading-snug pr-1">
                  {item.question}
                </span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[#FF7A00]' : 'text-neutral-500'
                  }`}
                  aria-hidden
                />
              </button>
              <div
                id={`faq-panel-${i}`}
                role="region"
                aria-labelledby={`faq-trigger-${i}`}
                aria-hidden={!isOpen}
                className={`marketing-faq-panel transition-all duration-200 ${
                  isOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                } overflow-hidden`}
              >
                <div className="marketing-faq-panel-inner px-5 pb-4 pt-2 bg-[#0A0A0A]">
                  <p className="marketing-faq-answer text-sm text-white/60 leading-relaxed">{item.answer}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
});

export default LandingFAQ;
