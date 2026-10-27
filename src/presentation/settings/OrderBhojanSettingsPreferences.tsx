import { useMemo } from 'react';
import { useTheme, type ThemeMode } from '@/features/theme/themeService';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SettingsPreferenceViewModel } from '@bhojan/storefront-design-system/settings';
import { useAuth } from '@/shared/providers/AuthProvider';
import { useCustomerProfile } from '@/features/auth/hooks/useCustomerProfile';
import { updateCustomerPreferences } from '@/features/auth/infrastructure/customerRepository';
import { useDevicePushStatus } from '@/features/notifications/hooks/useDevicePushStatus';
import { notifyToast } from '@/shared/providers/BdsToastProvider';

const SPICE_LEVELS = ['Mild', 'Medium', 'Hot'] as const;
const DIETARY_OPTIONS = ['Veg', 'Egg', 'Non-veg'] as const;

export function useCustomerSettingsActions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionUser } = useAuth();
  const profileQuery = useCustomerProfile();
  const devicePush = useDevicePushStatus();
  const { theme: currentTheme, setTheme: setCurrentTheme } = useTheme();

  const preferenceRows = useMemo((): readonly SettingsPreferenceViewModel[] => {
    const prefs = profileQuery.data?.preferences;
    return [
      { id: 'spice', icon: '🌶', label: 'Spice level', value: prefs?.spiceLevel ?? 'Medium' },
      { id: 'dietary', icon: '🥬', label: 'Dietary', value: prefs?.dietary ?? 'Veg' },
      {
        id: 'theme',
        icon: '🎨',
        label: 'Appearance',
        value: currentTheme === 'light' ? 'Light (Warm Cream)' : currentTheme === 'system' ? 'System default' : 'Dark (Culinary Warm)',
      },
      {
        id: 'notifications',
        icon: '🔔',
        // Device readiness (OS permission + FCM registration), not Firestore preference default.
        label: 'Push notifications',
        value: devicePush.settingsLabel,
      },
    ];
  }, [devicePush.settingsLabel, profileQuery.data?.preferences]);

  const handlePreferenceRow = (id: string) => {
    if (id === 'theme') {
      const THEMES: ThemeMode[] = ['dark', 'light', 'system'];
      const next = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length]!;
      
      setCurrentTheme(next);
      notifyToast(`Theme set to ${next === 'light' ? 'Light (Warm Cream)' : next === 'system' ? 'System' : 'Dark (Culinary)'}`, 'success');
      return;
    }
    const uid = sessionUser?.uid;
    if (!uid) return;

    if (id === 'notifications') {
      navigate('/notifications');
      return;
    }

    const prefs = profileQuery.data?.preferences;
    const invalidateProfile = () => {
      void queryClient.invalidateQueries({ queryKey: ['customer', 'profile', uid] });
    };
    const savePreference = async (patch: Parameters<typeof updateCustomerPreferences>[1]) => {
      try {
        await updateCustomerPreferences(uid, patch);
        invalidateProfile();
      } catch {
        notifyToast('Could not save preference. Try again.', 'danger');
      }
    };

    if (id === 'spice') {
      const current = prefs?.spiceLevel ?? 'Medium';
      const next = SPICE_LEVELS[(SPICE_LEVELS.indexOf(current) + 1) % SPICE_LEVELS.length]!;
      void savePreference({ spiceLevel: next });
      return;
    }

    if (id === 'dietary') {
      const current = prefs?.dietary ?? 'Veg';
      const next = DIETARY_OPTIONS[(DIETARY_OPTIONS.indexOf(current) + 1) % DIETARY_OPTIONS.length]!;
      void savePreference({ dietary: next });
    }
  };

  return {
    preferenceRows,
    handlePreferenceRow,
  };
}
