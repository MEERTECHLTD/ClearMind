import { useCallback, useEffect, useState } from 'react';
import { View, Text, AppState } from 'react-native';
import { Bell, BellOff, AlarmClock, CalendarClock, Sunrise, BarChart3, Moon, Send, Settings2 } from 'lucide-react-native';
import { usePreferences } from '../../../hooks/usePreferences';
import { SettingsPage, Group, Row, SwitchRow, ChoiceRow, TIME_CHOICES } from '../../../components/settings/ui';
import { Button, useToast } from '../../../components/ui';
import { getPermissionStatus, requestPermission, openSystemSettings, sendTestNotification, type PermissionState } from '../../../services/notifications';
import { scheduleReplan } from '../../../services/runtime';
import { T } from '../../../lib/theme';

const REMINDER_CHOICES = [
  { value: null, label: 'No default reminder' },
  { value: 0, label: 'At the due time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

export default function NotificationSettings() {
  const { prefs, update } = usePreferences();
  const toast = useToast();
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const refresh = useCallback(() => { void getPermissionStatus().then(setPerm); }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);
  const set = (patch: Parameters<typeof update>[0]) => { update(patch); scheduleReplan(300); };

  return (
    <SettingsPage title="Reminders & notifications">
      {perm !== 'granted' ? (
        <View className="mx-4 mt-4 p-4 rounded-2xl bg-midnight-light border border-line">
          <View className="flex-row items-center mb-2">
            {perm === 'denied' ? <BellOff size={20} color={T.danger} /> : <Bell size={20} color={T.accent} />}
            <Text className="text-ink font-semibold text-base ml-2">{perm === 'denied' ? 'Notifications are off' : 'Never miss what matters'}</Text>
          </View>
          <Text className="text-ink-muted text-sm leading-5">
            {perm === 'denied'
              ? 'ClearMind can’t remind you until notifications are allowed for it in your phone’s settings.'
              : 'Get a nudge when tasks are due, a short plan each morning, and quick actions — Complete, Snooze, Tomorrow — right from the notification. You choose what you receive below.'}
          </Text>
          <View className="mt-3">
            {perm === 'denied'
              ? <Button title="Open system settings" onPress={openSystemSettings} icon={<Settings2 size={18} color="#fff" />} />
              : <Button title="Turn on notifications" onPress={async () => { const r = await requestPermission(); setPerm(r); if (r === 'granted') { scheduleReplan(0); toast.show('Notifications on', 'success'); } }} icon={<Bell size={18} color="#fff" />} />}
          </View>
        </View>
      ) : null}

      <Group title="Task reminders" footer="Timed tasks get the default reminder automatically. Add more per task, or type “!30m” / “!9am” in Quick Add.">
        <SwitchRow icon={<AlarmClock size={20} color={T.accent} />} label="Task reminders" value={prefs.notifyReminders} onChange={(v) => set({ notifyReminders: v })} />
        <ChoiceRow icon={<CalendarClock size={20} color={T.accent} />} label="Default reminder" value={prefs.defaultReminder ?? null} onChange={(v) => set({ defaultReminder: v })} choices={REMINDER_CHOICES} />
        <SwitchRow label="Add default reminder to new timed tasks" value={prefs.autoReminders} onChange={(v) => set({ autoReminders: v })} />
      </Group>

      <Group title="Planning & summaries">
        <SwitchRow icon={<Sunrise size={20} color={T.accent} />} label="Daily plan" detail="Today’s count and anything overdue" value={prefs.notifyOverdue} onChange={(v) => set({ notifyOverdue: v })} />
        <ChoiceRow label="Daily plan time" value={prefs.dailyPlanAt ?? null} onChange={(v) => set({ dailyPlanAt: v })} choices={TIME_CHOICES} />
        <SwitchRow icon={<BarChart3 size={20} color={T.accent} />} label="Weekly summary" detail="At the end of your week" value={prefs.weeklySummary} onChange={(v) => set({ weeklySummary: v })} />
      </Group>

      <Group title="Quiet hours" footer="Reminders that fall inside quiet hours arrive when they end.">
        <ChoiceRow icon={<Moon size={20} color={T.accent} />} label="Start" value={prefs.quietStart ?? null} onChange={(v) => set({ quietStart: v })} choices={TIME_CHOICES} />
        <ChoiceRow label="End" value={prefs.quietEnd ?? null} onChange={(v) => set({ quietEnd: v })} choices={TIME_CHOICES} />
      </Group>

      {perm === 'granted' ? (
        <Group>
          <Row icon={<Send size={20} color={T.accent} />} label="Send a test notification" onPress={async () => toast.show((await sendTestNotification()) ? 'Sent — it arrives in a moment' : 'Couldn’t send', 'info')} />
        </Group>
      ) : null}
    </SettingsPage>
  );
}
