import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Linkedin, Twitter, Mail, ShoppingBag, ArrowUpRight, MapPin } from 'lucide-react';
import SoftButton from './ui/SoftButton';
import { SUPPORT_EMAIL, SOCIAL_LINKS } from '../config/support';
import { orderBhojanPublic } from '../config/demoData';

/* ── Animated counter ── */
function AnimatedCounter({ end, suffix, label, delay = 0 }: { end: number; suffix?: string; label: string; delay?: number }) {
  const [value, setValue] = React.useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const observed = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting || observed.current) return;
          observed.current = true;
          const duration = 2000;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            setValue(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        },
        { threshold: 0.3 }
      );
      if (ref.current) observer.observe(ref.current);
      return () => observer.disconnect();
    }, delay);
    return () => clearTimeout(timer);
  }, [end, delay]);

  return (
    <div ref={ref}>
      <div className="font-display text-3xl sm:text-4xl font-black text-white">
        {value.toLocaleString()}{suffix}
      </div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

export const EnterpriseFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');

  const sections = [
    {
      title: 'Products',
      links: [
        { label: 'Online Ordering System', to: '/restaurant-online-ordering' },
        { label: 'Direct Ordering Platform', to: '/direct-ordering-platform' },
        { label: 'Restaurant Management', to: '/restaurant-management-system' },
        { label: 'Restaurant POS & Ops', to: '/restaurant-pos' },
        { label: 'Fast Billing Software', to: '/restaurant-billing-software' },
        { label: 'QR Code Ordering', to: '/qr-code-ordering-system' },
        { label: 'WhatsApp Ordering', to: '/whatsapp-food-ordering-system' },
        { label: 'Website Builder', to: '/restaurant-website-builder' },
        { label: 'Digital Menu', to: '/digital-menu-for-restaurants' },
        { label: 'Delivery Management', to: '/delivery-management-software' },
      ],
    },
    {
      title: 'Solutions',
      links: [
        { label: 'Cloud Kitchens', to: '/cloud-kitchen-software' },
        { label: 'QSR & Fast Food', to: '/qsr-pos-software' },
        { label: 'Cafes & Bakeries', to: '/cafe-pos-billing-software' },
        { label: 'All Solutions', to: '/solutions' },
        { label: 'Pricing', to: '/pricing' },
      ],
    },
    {
      title: 'Compare',
      links: [
        { label: 'vs Zomato & Swiggy', to: '/bhojanos-vs-zomato-swiggy' },
        { label: 'Petpooja Alternative', to: '/petpooja-alternative' },
        { label: 'DotPe Alternative', to: '/dotpe-alternative' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About Us', to: '/about' },
        { label: 'Blog', to: '/blog' },
        { label: 'Security', to: '/security' },
        { label: 'Contact', to: '/contact' },
        { label: 'Privacy Policy', to: '/privacy' },
        { label: 'Terms of Service', to: '/terms' },
      ],
    },
  ];

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Newsletter&body=Subscribe: ${encodeURIComponent(email)}`;
    }
  };

  return (
    <footer className="bg-[#050403] border-t border-white/[0.06] relative overflow-hidden">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] rounded-full bg-[#FF7A00]/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[200px] rounded-full bg-[#FF7A00]/[0.03] blur-[100px]" />
      </div>

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12 border-y border-white/[0.06] mb-14 card-glow">
          <AnimatedCounter end={3500} suffix="+" label="Restaurants Powered" delay={0} />
          <AnimatedCounter end={50000} suffix="+" label="Active Customers" delay={100} />
          <AnimatedCounter end={1200000} suffix="+" label="Orders Processed" delay={200} />
          <AnimatedCounter end={0} suffix="%" label="Commission Kept by You" delay={300} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_2fr] gap-12 lg:gap-16 mb-14">
          {/* Brand Column */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/5 rounded-xl flex items-center justify-center border border-[#FF7A00]/20">
                <img src={orderBhojanPublic.homeUrl ? '' : ''} alt="" className="w-0 h-0" aria-hidden />
              </div>
              <span className="font-display text-white font-black text-2xl tracking-tight">
                Bhojan<span className="text-[#FF7A00]">OS</span>
              </span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed max-w-sm mb-4">
              Free POS + ordering platform for cloud kitchens, hotels, and restaurants. Manage orders, payments, and delivery (Rapido, Porter, Uber) from one dashboard. Build your brand — we handle the tech.
            </p>
            <a
              href={orderBhojanPublic.homeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-premium-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold mb-6"
            >
              <ShoppingBag size={15} aria-hidden />
              Order Food
            </a>
            <div className="flex items-center gap-2.5">
              {SOCIAL_LINKS.linkedin && (
                <a href={SOCIAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-neutral-500 hover:text-[#FF7A00] hover:border-[#FF7A00]/30 transition-all duration-200">
                  <Linkedin size={16} />
                </a>
              )}
              {SOCIAL_LINKS.twitter && (
                <a href={SOCIAL_LINKS.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-neutral-500 hover:text-[#FF7A00] hover:border-[#FF7A00]/30 transition-all duration-200">
                  <Twitter size={16} />
                </a>
              )}
              <a href={`mailto:${SUPPORT_EMAIL}`} aria-label="Email"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-neutral-500 hover:text-[#FF7A00] hover:border-[#FF7A00]/30 transition-all duration-200">
                <Mail size={16} />
              </a>
            </div>
          </div>

          {/* Newsletter */}
          <div className="lg:justify-self-end">
            <form onSubmit={handleNewsletter}>
              <label htmlFor="footer-newsletter" className="block text-sm font-bold text-white mb-2">
                Stay updated
              </label>
              <p className="text-xs text-neutral-500 mb-3">Product updates &amp; insights for restaurant operators.</p>
              <div className="flex gap-2">
                <input
                  id="footer-newsletter"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="flex-1 min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/30 focus:border-[#FF7A00]/40 transition-all"
                />
                <button type="submit" className="btn-premium-primary px-4 py-2.5 text-sm">
                  Subscribe
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-14">
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col min-w-0">
              <h4 className="text-white font-bold text-xs uppercase tracking-[0.18em] mb-5">
                {section.title}
              </h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-[#FF7A00] text-sm font-medium transition-colors duration-200 group/link"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight size={12} className="opacity-0 group-hover/link:opacity-100 transition-opacity -translate-x-0.5 group-hover/link:translate-x-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/[0.06] gap-3">
          <p className="text-neutral-500 text-xs sm:text-sm text-center sm:text-left">
            &copy; {currentYear} BhojanOS. The operating platform for food businesses.
          </p>
          <div className="flex items-center gap-4 text-neutral-600 text-xs">
            <span>Powered by BhojanOS</span>
            <span className="w-1 h-1 rounded-full bg-neutral-700" aria-hidden />
            <a href={orderBhojanPublic.homeUrl} className="hover:text-[#FF7A00] transition-colors">
              Order food on OrderBhojan
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
