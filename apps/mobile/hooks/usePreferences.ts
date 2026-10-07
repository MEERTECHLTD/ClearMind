/**
 * Synced preferences (one record per account) merged over shared defaults.
 * Changes apply immediately on this device (optimistic) and sync to every
 * other client. Side effects that must happen outside React (theme, cached
 * home view for the boot redirect) are applied by PreferenceEffects.
 */
import { useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Preferences } from '@clearmind/shared';
import { resolvePreferences, type ResolvedPreferences } from '@clearmind/shared/domain';
import { STORES } from '../services/db';
import { useCollection } from './useCollection';
import { savePreferences } from '../services/taskActions';
import { setThemePref, getThemePref } from '../lib/theme';

export const HOME_VIEW_KEY = 'clearmind:homeView';

export function usePreferences(): { prefs: ResolvedPreferences; loaded: boolean; update: (patch: Partial<Preferences>) => void } {
  const { items, loading } = useCollection<Preferences>(STORES.PREFERENCES);
  const prefs = resolvePreferences(items[0]);
  const update = useCallback((patch: Partial<Preferences>) => { savePreferences(patch); }, []);
  return { prefs, loaded: !loading, update };
}

/** Applies preference side effects (mount once under the signed-in layout). */
export function usePreferenceEffects() {
  const { prefs, loaded } = usePreferences();
  useEffect(() => {
    if (!loaded) return;
    if (prefs.theme !== getThemePref()) setThemePref(prefs.theme);
  }, [loaded, prefs.theme]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(HOME_VIEW_KEY, prefs.homeView).catch(() => {});
  }, [loaded, prefs.homeView]);
}
