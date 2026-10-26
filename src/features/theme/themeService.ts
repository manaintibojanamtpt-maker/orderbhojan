import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/lib/nativePlatform';

export type ThemeMode = 'system' | 'dark' | 'light';

const THEME_STORAGE_KEY = 'ob-theme-preference';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage access fallback
  }
  return 'system';
}

export function resolveEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode === 'light' ? 'light' : 'dark';
}

export async function applyStatusBarTheme(effective: 'light' | 'dark'): Promise<void> {
  if (typeof window === 'undefined' || !isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (effective === 'light') {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#FAF7F2' });
    } else {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0E0C0A' });
    }
  } catch {
    // Non-fatal if platform does not support status bar color change
  }
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const effective = resolveEffectiveTheme(mode);
  document.documentElement.setAttribute('data-theme', effective);
  document.documentElement.classList.toggle('theme-light', effective === 'light');
  document.documentElement.classList.toggle('theme-dark', effective === 'dark');

  // Update meta theme-color for browser chrome
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', effective === 'light' ? '#FAF7F2' : '#0E0C0A');
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage access fallback
  }

  // Update Capacitor native status bar asynchronously
  void applyStatusBarTheme(effective);

  // Notify active subscribers
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('ob-theme-change', { detail: { mode, effective } }),
    );
  }
}

let systemThemeListenerAttached = false;

export function initTheme(): void {
  const current = getStoredTheme();
  applyTheme(current);

  if (!systemThemeListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
    systemThemeListenerAttached = true;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemChange = () => {
      if (getStoredTheme() === 'system') {
        applyTheme('system');
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemChange);
    } else if (typeof (mediaQuery as any).addListener === 'function') {
      (mediaQuery as any).addListener(handleSystemChange);
    }
  }
}

export function useTheme(): {
  theme: ThemeMode;
  effectiveTheme: 'dark' | 'light';
  setTheme: (mode: ThemeMode) => void;
} {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() =>
    resolveEffectiveTheme(getStoredTheme()),
  );

  useEffect(() => {
    const handleThemeChange = () => {
      const mode = getStoredTheme();
      setThemeState(mode);
      setEffectiveTheme(resolveEffectiveTheme(mode));
    };

    window.addEventListener('ob-theme-change', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);

    return () => {
      window.removeEventListener('ob-theme-change', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const setTheme = (mode: ThemeMode) => {
    applyTheme(mode);
    setThemeState(mode);
    setEffectiveTheme(resolveEffectiveTheme(mode));
  };

  return { theme, effectiveTheme, setTheme };
}
