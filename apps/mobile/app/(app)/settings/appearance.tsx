import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { Check, Rows3, Rows2 } from 'lucide-react-native';
import { usePreferences } from '../../../hooks/usePreferences';
import { SettingsPage, Group, ChoiceRow, Segments } from '../../../components/settings/ui';
import { T, useScheme, type ThemePref } from '../../../lib/theme';
import { useToast } from '../../../components/ui';
import { logWarn } from '../../../lib/logger';

/* eslint-disable @typescript-eslint/no-var-requires */
const ICONS: { name: string | null; label: string; preview: any }[] = [
  { name: null, label: 'Midnight', preview: require('../../../assets/icons/default-preview.png') },
  { name: 'Light', label: 'Light', preview: require('../../../assets/icons/light-preview.png') },
  { name: 'Ocean', label: 'Ocean', preview: require('../../../assets/icons/ocean-preview.png') },
  { name: 'Sunset', label: 'Sunset', preview: require('../../../assets/icons/sunset-preview.png') },
  { name: 'Forest', label: 'Forest', preview: require('../../../assets/icons/forest-preview.png') },
  { name: 'Mono', label: 'Mono', preview: require('../../../assets/icons/mono-preview.png') },
];

function useAppIcons() {
  const [mod, setMod] = useState<null | typeof import('expo-alternate-app-icons')>(null);
  useEffect(() => { import('expo-alternate-app-icons').then(setMod).catch((e) => logWarn('alt icons: ' + String(e))); }, []);
  return mod;
}

export default function AppearanceSettings() {
  const { prefs, update } = usePreferences();
  const scheme = useScheme();
  const toast = useToast();
  const icons = useAppIcons();
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => { if (icons?.supportsAlternateIcons) setCurrent(icons.getAppIconName() ?? null); }, [icons]);

  const pickIcon = async (name: string | null) => {
    if (!icons) return;
    try {
      await icons.setAlternateAppIcon(name as any);
      setCurrent(name);
      update({ appIcon: name });
      if (Platform.OS === 'android') toast.show('Icon updated — your launcher may take a moment to refresh', 'info');
    } catch (e) {
      toast.show('Couldn’t change the icon on this device', 'error');
      logWarn('set icon: ' + String(e));
    }
  };

  return (
    <SettingsPage title="Appearance">
      <Group title="Theme" footer={prefs.theme === 'system' ? `Following your device — currently ${scheme}.` : undefined}>
        <Segments<ThemePref>
          value={prefs.theme}
          onChange={(v) => update({ theme: v })}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        />
      </Group>

      {icons?.supportsAlternateIcons ? (
        <Group title="App icon" footer={Platform.OS === 'android' ? 'Android swaps the launcher icon; some launchers refresh it after a few seconds.' : undefined}>
          <View className="flex-row flex-wrap px-3 py-3">
            {ICONS.map((ic) => {
              const selected = (current ?? null) === ic.name;
              return (
                <Pressable key={ic.label} onPress={() => pickIcon(ic.name)} className="items-center w-1/3 py-2" accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${ic.label} icon`}>
                  <View style={{ borderRadius: 18, borderWidth: 3, borderColor: selected ? T.accent : 'transparent', padding: 2 }}>
                    <Image source={ic.preview} style={{ width: 64, height: 64, borderRadius: 14 }} />
                    {selected ? <View style={{ position: 'absolute', right: -4, top: -4, backgroundColor: T.accent, borderRadius: 10, padding: 2 }}><Check size={14} color="#fff" /></View> : null}
                  </View>
                  <Text className={`text-xs mt-1.5 ${selected ? 'text-accent font-semibold' : 'text-ink-muted'}`}>{ic.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Group>
      ) : null}

      <Group title="Layout">
        <ChoiceRow
          icon={prefs.density === 'compact' ? <Rows3 size={20} color={T.accent} /> : <Rows2 size={20} color={T.accent} />}
          label="Task list density"
          value={prefs.density}
          onChange={(v) => update({ density: v })}
          choices={[{ value: 'comfortable', label: 'Comfortable', detail: 'More breathing room' }, { value: 'compact', label: 'Compact', detail: 'More tasks on screen' }]}
        />
      </Group>
    </SettingsPage>
  );
}
