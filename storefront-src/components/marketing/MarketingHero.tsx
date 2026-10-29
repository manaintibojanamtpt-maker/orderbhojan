import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ArrowRight, Bell, Flame, Bike, CheckCircle2, Users, TrendingUp, Sparkles } from 'lucide-react';

/* ── Mouse parallax engine ── */
function useMouseParallax() {
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cx = (e.clientX / window.innerWidth - 0.5) * 2;
    const cy = (e.clientY / window.innerHeight - 0.5) * 2;
    const layers: [string, number][] = [
      ['hero-bg-deep', 0.08],
      ['hero-bg-mid', 0.18],
      ['hero-photo', 0.32],
      ['hero-card-back', 0.5],
      ['hero-card-mid', 0.72],
      ['hero-card-front', 0.96],
    ];
    layers.forEach(([key, mult]) => {
      const el = refs.current[key];
      if (el) {
        el.style.transform = `translate(${cx * 12 * mult}px, ${cy * 8 * mult}px)`;
      }
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  const setRef = (key: string) => (el: HTMLElement | null) => {
    refs.current[key] = el;
  };

  return { setRef };
}

/* ── Intersection observer counter ── */
function useCountUp(end: number, duration: number = 1800, triggerOnce: boolean = true) {
  const [value, setValue] = useState(0);
  const observed = useRef(false);

  useEffect(() => {
    const el = document.getElementById(`count-${end}`);
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || (triggerOnce && observed.current)) return;
        observed.current = true;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.floor(eased * end));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration, triggerOnce]);

  return value;
}

/* ── Floating order card ── */
function FloatingCard({
  children,
  className,
  delay = '',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: string;
}) {
  return (
    <div
      className={`cine-float ${delay} ${className ?? ''}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

/* ── New Order Notification ── */
function OrderNotification() {
  return (
    <FloatingCard className="cine-glass cine-glass-accent w-[200px] rounded-2xl p-3.5 shadow-2xl" delay="0s">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#34D399]/15">
          <Bell size={14} className="text-[#34D399]" aria-hidden />
        </span>
        <span className="text-[11px] font-bold text-white/90">New Insight</span>
      </div>
      <p className="text-[11px] text-white/60 mb-1">Revenue up 24%</p>
      <p className="font-display text-xl font-extrabold text-[#34D399]">₹18,450</p>
      <span className="mt-2 inline-block rounded-full bg-[#34D399]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#34D399]">
        Live
      </span>
    </FloatingCard>
  );
}

/* ── Status Card ── */
function StatusCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'accent' | 'green' | 'neutral';
}) {
  const colors = {
    accent: 'text-[#FF7A00] bg-[#FF7A00]/10 border-[#FF7A00]/20',
    green: 'text-[#34D399] bg-[#34D399]/10 border-[#34D399]/20',
    neutral: 'text-white/70 bg-white/5 border-white/10',
  };
  return (
    <FloatingCard className="rounded-xl px-3.5 py-2.5 border" delay="1.2s">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${colors[tone]}`}>
          {icon}
        </span>
        <div>
          <p className="text-[10px] text-white/50">{label}</p>
          <p className={`text-sm font-bold ${tone === 'accent' ? 'text-[#FF7A00]' : tone === 'green' ? 'text-[#34D399]' : 'text-white'}`}>
            {value}
          </p>
        </div>
      </div>
    </FloatingCard>
  );
}

/* ── Phone Mockup ── */
function PhoneMockup() {
  return (
    <FloatingCard className="[perspective:1200px]" delay="1.8s">
      <div className="w-[140px] -rotate-[6deg] rounded-[26px] p-1.5 shadow-[0_48px_96px_-24px_rgba(0,0,0,0.9)] border border-white/[0.08] bg-gradient-to-b from-white/10 to-transparent" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(5deg) rotateY(-4deg) rotateZ(-6deg)' }}>
        <div className="rounded-[20px] bg-[#0A0A0A] overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black tracking-widest text-white">BhojanOS</span>
              <span className="rounded-full bg-[#34D399]/20 px-1.5 py-0.5 text-[8px] font-bold text-[#34D399]">Live</span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-white/80">Dashboard</span>
              <span className="text-[11px] font-extrabold text-[#34D399]">+24%</span>
            </div>
            <div className="flex items-center gap-1 mb-2 text-[8px] text-white/40">
              <span>Revenue</span>
              <span>·</span>
              <span>Today</span>
            </div>
            <div className="h-6 rounded-lg bg-gradient-to-r from-[#FF7A00] to-[#FF9500] flex items-center justify-center">
              <span className="text-[9px] font-black text-black">View Dashboard</span>
            </div>
          </div>
        </div>
      </div>
    </FloatingCard>
  );
}

/* ── Main Hero ── */
export function MarketingHero() {
  const { setRef } = useMouseParallax();
  const restaurants = useCountUp(3500, 2000);
  const customers = useCountUp(50000, 2200);
  const orders = useCountUp(1200000, 2500);

  return (
    <section className="relative overflow-hidden min-h-screen flex items-center" aria-labelledby="hero-heading">
      {/* Deep ambient glow — moves with mouse */}
      <div
        className="cine-parallax cine-parallax-deep pointer-events-none absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#FF7A00]/[0.06] blur-[160px]"
        ref={setRef('hero-bg-deep')}
        aria-hidden
      />
      <div
        className="cine-parallax cine-parallax-deep pointer-events-none absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#FF7A00]/[0.04] blur-[120px]"
        ref={setRef('hero-bg-mid')}
        aria-hidden
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-0">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* LEFT — Copy */}
          <div className="max-w-xl">
            {/* Eyebrow */}
            <div className="marketing-hero-eyebrow-loop inline-flex items-center mb-6">
              <span className="marketing-hero-eyebrow-loop-inner">
                <span className="marketing-hero-eyebrow-loop-text">
                  <Flame size={11} className="text-[#FF7A00] mr-1.5" aria-hidden />
                  Zero Commission · AI Insights · Free POS
                </span>
              </span>
            </div>

            {/* Headline */}
            <h1
              id="hero-heading"
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight text-white"
            >
              Free POS. Zero commission.<br />
              <span className="marketing-hero-accent-text">AI that runs your kitchen.</span>
            </h1>

            {/* Subheadline */}
            <p className="mt-6 text-base sm:text-lg leading-relaxed text-white/60 max-w-lg">
              Free POS for cloud kitchens, hotels, and restaurants. Zero commission on every direct order. AI-powered EOD briefings, revenue intelligence, and recipe costing — so you grow smarter.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/owner/register"
                className="btn-premium-primary group"
              >
                Get Free POS
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </a>
              <a
                href="https://orderbhojan.web.app"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-premium-secondary"
              >
                Order Food
              </a>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              {[
                { icon: <CheckCircle2 size={16} className="text-[#34D399]" />, label: '₹0 Commission', sub: 'Keep 100% of every order' },
                { icon: <Sparkles size={16} className="text-[#FF7A00]" />, label: 'AI Insights', sub: 'EOD briefings & growth intel' },
                { icon: <TrendingUp size={16} className="text-[#60A5FA]" />, label: 'Own Your Delivery', sub: 'Rapido, Porter, Uber' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-bold text-white">{label}</p>
                    <p className="text-[11px] text-white/40">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Animated stat counters */}
            <div className="mt-12 grid grid-cols-3 gap-4">
              {[
                { id: 'restaurants', value: restaurants, suffix: '+', label: 'Restaurants' },
                { id: 'customers', value: customers, suffix: '+', label: 'Customers' },
                { id: 'orders', value: orders, suffix: '+', label: 'Orders' },
              ].map(({ id, value, suffix, label }) => (
                <div key={id} id={`count-${(id === 'restaurants' ? 3500 : id === 'customers' ? 50000 : 1200000)}`}>
                  <p className="font-display text-2xl sm:text-3xl font-black text-white">
                    {value.toLocaleString()}{suffix}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Dashboard preview with delivery partners */}
          <div className="relative hidden lg:block" style={{ minHeight: '560px' }}>
            <div className="relative h-[480px] w-[420px] ml-auto">
              {/* Phone mockup */}
              <div className="absolute top-0 right-0">
                <PhoneMockup />
              </div>

              {/* Status cards */}
              <div className="absolute top-12 left-0">
                <StatusCard
                  icon={<CheckCircle2 size={13} />}
                  label="Daily Revenue"
                  value="₹24,850"
                  tone="green"
                />
              </div>

              <div className="absolute top-1/3 left-0">
                <StatusCard
                  icon={<Bike size={13} />}
                  label="Out for Delivery"
                  value="12 orders"
                  tone="accent"
                />
              </div>

              <div className="absolute bottom-24 left-4">
                <OrderNotification />
              </div>

              {/* Delivery partners badges */}
              <div className="absolute bottom-0 right-4 flex flex-wrap gap-2 max-w-[200px]">
                {['Rapido', 'Porter', 'Uber'].map((partner) => (
                  <span
                    key={partner}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[10px] font-semibold text-white/70"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                    {partner}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#070504] to-transparent"
        aria-hidden
      />
    </section>
  );
}

export default MarketingHero;
