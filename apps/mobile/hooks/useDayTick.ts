import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayISO } from '@clearmind/shared/tasks';

/**
 * Returns today's 'YYYY-MM-DD' and re-renders when the date changes (checked
 * every minute and whenever the app returns to the foreground), so Today /
 * Upcoming re-bucket tasks after midnight without a restart.
 */
export function useDayTick(): string {
  const [day, setDay] = useState(todayISO());
  useEffect(() => {
    const check = () => setDay((d) => (d === todayISO() ? d : todayISO()));
    const id = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  return day;
}
