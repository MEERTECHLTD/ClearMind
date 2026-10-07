import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Target, CalendarRange, Palmtree, Flame } from 'lucide-react-native';
import { WEEKDAY_SHORT } from '@clearmind/shared/tasks';
import { usePreferences } from '../../../hooks/usePreferences';
import { SettingsPage, Group, ChoiceRow, SwitchRow, Row } from '../../../components/settings/ui';
import { T } from '../../../lib/theme';

const n = (arr: number[]) => arr.map((x) => ({ value: x, label: String(x) }));

export default function ProductivitySettings() {
  const router = useRouter();
  const { prefs, update } = usePreferences();
  const order = prefs.weekStart === 0 ? [0, 1, 2, 3, 4, 5, 6] : prefs.weekStart === 6 ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0];
  const toggleDay = (d: number) => update({ daysOff: prefs.daysOff.includes(d) ? prefs.daysOff.filter((x) => x !== d) : [...prefs.daysOff, d] });
  return (
    <SettingsPage title="Productivity">
      <Group title="Goals" footer="Meeting your daily goal builds your streak and Momentum score.">
        <ChoiceRow icon={<Target size={20} color={T.accent} />} label="Daily goal" value={prefs.dailyGoal} onChange={(v) => update({ dailyGoal: v })} choices={n([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20])} />
        <ChoiceRow icon={<CalendarRange size={20} color={T.accent} />} label="Weekly goal" value={prefs.weeklyGoal} onChange={(v) => update({ weeklyGoal: v })} choices={n([5, 10, 15, 20, 25, 30, 40, 50, 75, 100])} />
      </Group>
      <Group title="Days off" footer="Days off never break your streak.">
        <View className="flex-row justify-between px-4 py-3">
          {order.map((d) => {
            const off = prefs.daysOff.includes(d);
            return (
              <Pressable key={d} onPress={() => toggleDay(d)} className={`w-11 h-11 rounded-full items-center justify-center ${off ? 'bg-accent' : 'bg-midnight'}`} style={{ borderWidth: 1, borderColor: off ? T.accent : T.line }} accessibilityRole="checkbox" accessibilityState={{ checked: off }} accessibilityLabel={`${WEEKDAY_SHORT[d]} off`}>
                <Text className={off ? 'text-white font-semibold' : 'text-ink'}>{WEEKDAY_SHORT[d].slice(0, 2)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group footer="Pauses streaks while you’re away.">
        <SwitchRow icon={<Palmtree size={20} color={T.accent} />} label="Vacation mode" value={prefs.vacation} onChange={(v) => update({ vacation: v })} />
      </Group>
      <Group>
        <Row icon={<Flame size={20} color={T.accent} />} label="View productivity" onPress={() => router.push('/(app)/productivity')} />
      </Group>
    </SettingsPage>
  );
}
