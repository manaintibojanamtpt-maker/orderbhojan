import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import bhojanOsLogo from '../../assets/bhojan-os-logo.png';
import { ChevronDown, Menu, X, ShoppingBag, Sparkles } from 'lucide-react';
import { MarketingSoftCTA } from './MarketingSoftCTA';
import { orderBhojanPublic } from '../../config/demoData';

const navLinkClass = (active: boolean) =>
  `transition-all duration-200 ${active ? 'text-white font-semibold' : 'hover:text-white text-neutral-400'}`;

/* ── Mega Menu ── */
function MegaMenu({ title, items, accent }: { title: string; items: { label: string; to: string; desc?: string }[]; accent?: boolean }) {
  return (
    <div className="group relative flex items-center h-full">
      <button type="button" className={`inline-flex items-center gap-1 h-10 ${navLinkClass(accent || false)}`}>
        {title} <ChevronDown size={14} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>
      <div className="absolute top-full left-0 pt-3 hidden group-hover:block group-focus-within:block z-50">
        <div className="w-72 glass-premium border border-white/[0.1] rounded-2xl p-3 card-glow opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col gap-0.5 px-3 py-2.5 hover:bg-white/[0.05] rounded-xl transition-colors group/item"
            >
              <span className="text-white text-sm font-medium group-hover/item:text-[#FF7A00] transition-colors">{item.label}</span>
              {item.desc && <span className="text-[11px] text-neutral-500 leading-relaxed">{item.desc}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export const EnterpriseHeader: React.FC = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isPlatform = location.pathname.startsWith('/platform') ||
    location.pathname.startsWith('/restaurant-') ||
    location.pathname === '/direct-ordering-platform' ||
    location.pathname === '/qr-code-ordering-system' ||
    location.pathname === '/whatsapp-food-ordering-system' ||
    location.pathname === '/digital-menu-for-restaurants';
  const isSolutions = location.pathname.startsWith('/solutions');
  const isCompare = location.pathname.startsWith('/compare');
  const isPricing = location.pathname === '/pricing' || (location.pathname === '/onboard' && location.hash === '#pricing');
  const isAbout = location.pathname === '/about';
  const isSecurity = location.pathname === '/security';
  const isContact = location.pathname === '/contact';
  const isBlog = location.pathname.startsWith('/blog');

  const productItems = [
    { label: 'Online Ordering System', to: '/restaurant-online-ordering', desc: 'Branded storefront with your menu & branding' },
    { label: 'Direct Ordering Platform', to: '/direct-ordering-platform', desc: 'Zero commission, direct customer relationship' },
    { label: 'Restaurant Management', to: '/restaurant-management-system', desc: 'Complete kitchen operations dashboard' },
    { label: 'Restaurant POS & Ops', to: '/restaurant-pos', desc: 'Point of sale with inventory integration' },
    { label: 'Fast Billing Software', to: '/restaurant-billing-software', desc: 'GST-compliant billing in seconds' },
    { label: 'QR Code Ordering', to: '/qr-code-ordering-system', desc: 'Scan-to-order at every table' },
    { label: 'WhatsApp Ordering', to: '/whatsapp-food-ordering-system', desc: 'Take orders via WhatsApp Business' },
    { label: 'Website Builder', to: '/restaurant-website-builder', desc: 'Professional restaurant website in minutes' },
    { label: 'Digital Menu', to: '/digital-menu-for-restaurants', desc: 'QR-powered digital menu with live updates' },
    { label: 'Delivery Management', to: '/delivery-management-software', desc: 'Own your delivery fleet & zones' },
  ];

  const solutionItems = [
    { label: 'Cloud Kitchens', to: '/cloud-kitchen-software', desc: 'Multi-brand ops from one command center' },
    { label: 'Quick Service (QSR)', to: '/qsr-pos-software', desc: 'High-volume kitchens with live queue control' },
    { label: 'Cafes & Bakeries', to: '/cafe-pos-billing-software', desc: 'Fast menus, pre-orders, loyalty programs' },
    { label: 'All Solutions', to: '/solutions', desc: 'View all industry-specific solutions' },
  ];

  const compareItems = [
    { label: 'vs Zomato & Swiggy', to: '/bhojanos-vs-zomato-swiggy', desc: 'Why switch from aggregators' },
    { label: 'Petpooja Alternative', to: '/petpooja-alternative', desc: 'Upgrade from Petpooja' },
    { label: 'DotPe Alternative', to: '/dotpe-alternative', desc: 'Better than DotPe' },
  ];

  const companyItems = [
    { label: 'About Us', to: '/about' },
    { label: 'Leadership', to: '/about#leadership' },
    { label: 'Security', to: '/security' },
    { label: 'Contact', to: '/contact' },
  ];

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 z-[100] w-full border-b transition-all duration-300 pt-[env(safe-area-inset-top)] ${
        scrolled
          ? 'border-white/[0.08] glass-premium shadow-[0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.4)]'
          : 'border-white/[0.06] bg-[#070504]/80'
      }`}
    >
      {/* Subtle top accent line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#FF7A00]/30 to-transparent" aria-hidden />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 h-16 sm:h-[4.5rem] flex items-center justify-between w-full overflow-visible">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 cursor-pointer min-w-0 group">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/5 rounded-xl flex items-center justify-center border border-[#FF7A00]/20 group-hover:border-[#FF7A00]/40 transition-colors shrink-0 overflow-hidden">
            <img
              src={bhojanOsLogo}
              alt="BhojanOS Logo"
              className="w-full h-full object-cover"
              width={40}
              height={40}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <span className="text-lg sm:text-xl font-black tracking-tight leading-snug text-white">
            Bhojan<span className="text-[#FF7A00]">OS</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="marketing-header-nav hidden lg:flex items-center gap-1 text-sm font-medium h-full">
          <MegaMenu title="Product" items={productItems} />
          <MegaMenu title="Solutions" items={solutionItems} />
          <MegaMenu title="Compare" items={compareItems} accent={isCompare} />
          <Link to="/pricing" className={`inline-flex items-center h-10 px-3 ${navLinkClass(isPricing)}`}>Pricing</Link>
          <Link to="/blog" className={`inline-flex items-center h-10 px-3 ${navLinkClass(isBlog)}`}>Resources</Link>
          <MegaMenu title="Company" items={companyItems} accent={isAbout || isSecurity || isContact} />
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-3 lg:hidden shrink-0">
          <MarketingSoftCTA to="/owner/login" tone="ghost" size="compact" className="shrink-0">
            Sign In
          </MarketingSoftCTA>
          <button
            type="button"
            className="text-white p-2 -mr-2 min-h-0 min-w-0 touch-manipulation"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="marketing-mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2.5">
          <a
            href={orderBhojanPublic.homeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-[#FF7A00]/30 bg-[#FF7A00]/8 text-[#FF7A00] text-sm font-bold hover:bg-[#FF7A00]/15 transition-all duration-200"
          >
            <ShoppingBag size={15} aria-hidden />
            Order Food
          </a>
          <MarketingSoftCTA to="/owner/login" tone="ghost" size="compact">
            Sign In
          </MarketingSoftCTA>
          <MarketingSoftCTA to="/owner/register" size="compact">
            Get Started
          </MarketingSoftCTA>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          id="marketing-mobile-menu"
          className="lg:hidden border-t border-white/[0.06] bg-[#070504]/98 backdrop-blur-2xl max-h-[85vh] overflow-y-auto"
        >
          <div className="px-4 sm:px-6 py-5 flex flex-col gap-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Products</div>
            {productItems.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} className="flex flex-col py-1.5">
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <span className="text-xs text-neutral-500 mt-0.5">{item.desc}</span>
              </Link>
            ))}

            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 pt-2 border-t border-white/[0.06]">Solutions</div>
            {solutionItems.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-sm text-white">{item.label}</Link>
            ))}

            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 pt-2 border-t border-white/[0.06]">Compare</div>
            {compareItems.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-sm text-white">{item.label}</Link>
            ))}

            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 pt-2 border-t border-white/[0.06]">Company</div>
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-sm text-white">Pricing</Link>
            <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-sm text-white">Resources</Link>
            {companyItems.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-sm text-white">{item.label}</Link>
            ))}

            <div className="pt-4 mt-1 border-t border-white/[0.06] flex flex-col gap-2.5">
              <a
                href={orderBhojanPublic.homeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border border-[#FF7A00]/30 bg-[#FF7A00]/10 text-[#FF7A00] text-sm font-bold"
              >
                <ShoppingBag size={15} aria-hidden />
                Order Food
              </a>
              <MarketingSoftCTA to="/owner/login" tone="ghost" size="compact" className="w-full" onClick={() => setMobileMenuOpen(false)}>
                Sign In
              </MarketingSoftCTA>
              <MarketingSoftCTA to="/owner/register" size="compact" className="w-full" onClick={() => setMobileMenuOpen(false)}>
                Get Started
              </MarketingSoftCTA>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
