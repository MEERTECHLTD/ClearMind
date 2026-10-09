import { View, Text, Pressable } from 'react-native';
import { ArrowUp, ArrowDown, Check, Lock } from 'lucide-react-native';
import { NAV_DESTINATIONS, DEFAULT_PREFERENCES } from '@clearmind/shared/domain';
import { usePreferences } from '../../../hooks/usePreferences';
import { SettingsPage, Group, Row } from '../../../components/settings/ui';
import { T } from '../../../lib/theme';

const MAX = 6; // 5 destinations + Browse

export default function NavigationSettings() {
  const { prefs, update } = usePreferences();
  const tabs = (prefs.navTabs ?? DEFAULT_PREFERENCES.navTabs).filter((t) => t !== 'browse');
  const set = (next: string[]) => update({ navTabs: [...next, 'browse'] });
  const toggle = (id: string) => (tabs.includes(id) ? set(tabs.filter((t) => t !== id)) : tabs.length < MAX - 1 ? set([...tabs, id]) : undefined);
  const move = (id: string, d: -1 | 1) => {
    const i = tabs.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= tabs.length) return;
    const n = [...tabs];
    [n[i], n[j]] = [n[j], n[i]];
    set(n);
  };
  return (
    <SettingsPage title="Navigation">
      <Group title="Bottom tabs" footer={`Pick up to ${MAX - 1} destinations plus Browse, which is always available. Order follows the list.`}>
        {tabs.map((id, i) => {
          const d = NAV_DESTINATIONS.find((x) => x.id === id)!;
          return (
            <Row key={id} label={d.label} icon={<Check size={18} color={T.accent} />} onPress={() => toggle(id)} right={
              <View className="flex-row">
                <Pressable onPress={() => move(id, -1)} disabled={i === 0} hitSlop={8} className="p-1.5" accessibilityLabel={`Move ${d.label} up`}><ArrowUp size={18} color={i === 0 ? T.line : T.muted} /></Pressable>
                <Pressable onPress={() => move(id, 1)} disabled={i === tabs.length - 1} hitSlop={8} className="p-1.5" accessibilityLabel={`Move ${d.label} down`}><ArrowDown size={18} color={i === tabs.length - 1 ? T.line : T.muted} /></Pressable>
              </View>
            } />
          );
        })}
        <Row label="Browse" icon={<Lock size={16} color={T.muted} />} detail="Always shown" />
      </Group>
      <Group title="Available">
        {NAV_DESTINATIONS.filter((d) => d.id !== 'browse' && !tabs.includes(d.id)).map((d) => (
          <Row key={d.id} label={d.label} onPress={() => toggle(d.id)} disabled={tabs.length >= MAX - 1} detail={tabs.length >= MAX - 1 ? 'Remove a tab first' : 'Tap to add'} />
        ))}
      </Group>
      <Text className="text-ink-muted text-xs text-center mt-6 mx-8">Everything else stays one tap away in Browse.</Text>
    </SettingsPage>
  );
}
