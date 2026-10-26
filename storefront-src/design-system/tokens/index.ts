/** Design system token constants — Unified Premium Palette v2 */
export const colors = {
  primary: '#E8720C',
  primaryLight: '#F4A05C',
  accent: '#F4A05C',
  brandBg: '#080706',
  cardBg: '#13100D',
  surface: '#1C1712',
  textMain: '#FFF8F0',
  textSecondary: '#A89B8C',
  accentRed: '#E8720C',
  mibOrange: '24, 82%, 48%',
  mibGold: '30, 88%, 62%',
} as const;

export const fonts = {
  sans: 'Plus Jakarta Sans',
  display: 'Outfit',
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
  safeBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
} as const;

export const radius = {
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '2rem',
  pill: '9999px',
  card: '1.25rem',
} as const;

export const elevation = {
  card: '0 16px 48px -12px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 248, 240, 0.04) inset',
  cardHover: '0 20px 56px -12px rgba(0, 0, 0, 0.72), 0 1px 0 rgba(255, 248, 240, 0.05) inset, 0 0 0 1px rgba(232, 130, 50, 0.25)',
  glow: '0 0 40px -8px rgba(232, 114, 12, 0.30)',
  cta: '0 14px 28px -10px rgba(232, 114, 12, 0.45)',
  nav: '0 18px 48px rgba(0, 0, 0, 0.55)',
} as const;

export const motion = {
  durationFast: '150ms',
  durationNormal: '250ms',
  durationSlow: '400ms',
  easeSpring: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export const glass = {
  background: 'rgba(19, 16, 13, 0.82)',
  blur: '20px',
  border: '1px solid rgba(255, 248, 240, 0.08)',
} as const;

/** Token CSS entry paths */
export const tokenStyles = {
  colors: './colors.css',
  typography: './typography.css',
  spacing: './spacing.css',
  radius: './radius.css',
  elevation: './elevation.css',
  glass: './glass.css',
  motion: './motion.css',
} as const;
