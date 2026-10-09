import { useCallback, useEffect, useState } from 'react';
import { tabFromHash, withHashParam } from '../../utils/routes';

/**
 * A view's tab, kept in the hash as `?tab=<id>` so deep links and redirects
 * (`#analytics` → `#insights?tab=life`) land on the right tab. Switching tabs
 * replaces the current history entry (tabs aren't separate back-stack steps).
 */
export function useHashTab<T extends string>(allowed: readonly T[], fallback: T): [T, (t: T) => void] {
  const read = useCallback(() => tabFromHash(window.location.hash, allowed, fallback), [allowed, fallback]);
  const [tab, setTabState] = useState<T>(read);
  useEffect(() => {
    const on = () => setTabState(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [read]);
  const setTab = useCallback((t: T) => {
    setTabState(t);
    const next = withHashParam(window.location.hash, 'tab', t === fallback ? null : t);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${next}`);
  }, [fallback]);
  return [tab, setTab];
}
