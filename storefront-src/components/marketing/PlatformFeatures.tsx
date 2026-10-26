import React, { memo } from 'react';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { RevealOnScroll } from './RevealOnScroll';
import { StorefrontPreviewMockup } from './StorefrontPreviewMockup';
import { platformFeatures } from '../../config/landing';

export const PlatformFeatures = memo(function PlatformFeatures() {
  return (
    <Section id="features" background="default" className="scroll-mt-24">
      <SectionHeader
        label="Platform"
        title="Everything your food business needs."
        description="One operating system for your menu, orders, kitchen, inventory, payments and customers. No patchwork of tools."
      />

      <RevealOnScroll>
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-4">
          Customer-facing storefront
        </p>
        <StorefrontPreviewMockup />
      </RevealOnScroll>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mt-12 sm:mt-14">
        {platformFeatures.map(({ icon: Icon, title, description }, i) => (
          <RevealOnScroll key={title} delay={i * 0.05}>
            <div className="card-glow h-full p-5 sm:p-6 group hover:-translate-y-1 transition-all duration-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/5 border border-[#FF7A00]/15 text-[#FF7A00] mb-5 group-hover:border-[#FF7A00]/30 transition-colors">
                <Icon size={22} strokeWidth={2} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mb-2 tracking-tight">{title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{description}</p>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </Section>
  );
});

export default PlatformFeatures;
