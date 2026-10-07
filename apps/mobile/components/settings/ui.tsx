/**
 * Settings design system: a page shell, grouped sections, and row types
 * (navigation, switch, choice-in-sheet, value). Every settings page uses these
 * so the whole area looks and behaves consistently.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { ChevronRight, Check } from 'lucide-react-native';
import { Screen, AppHeader, Sheet } from '../ui';
import { T } from '../../lib/theme';

export function SettingsPage({ title, children, subtitle, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Screen padded={false}>
      <AppHeader title={title} subtitle={subtitle} right={right} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View className="mt-6 px-4">
      {title ? <Text className="text-ink-muted text-xs font-semibold mb-2 ml-1 uppercase" accessibilityRole="header">{title}</Text> : null}
      <View className="rounded-2xl bg-midnight-light border border-line overflow-hidden">
        {items.map((c, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: T.line } : undefined}>{c}</View>
        ))}
      </View>
      {footer ? <Text className="text-ink-muted text-xs mt-2 mx-1 leading-4">{footer}</Text> : null}
    </View>
  );
}

export function Row({ icon, label, value, onPress, danger, detail, right, disabled }: {
  icon?: React.ReactNode; label: string; value?: string; onPress?: () => void; danger?: boolean; detail?: string; right?: React.ReactNode; disabled?: boolean;
}) {
  const body = (
    <View className="flex-row items-center px-4 py-3" style={{ minHeight: 52, opacity: disabled ? 0.5 : 1 }}>
      {icon ? <View className="w-8">{icon}</View> : null}
      <View className="flex-1 mr-2">
        <Text className={`text-[15px] ${danger ? 'text-red-500' : 'text-ink'}`}>{label}</Text>
        {detail ? <Text className="text-ink-muted text-xs mt-0.5">{detail}</Text> : null}
      </View>
      {value ? <Text className="text-ink-muted text-sm mr-1" numberOfLines={1} style={{ maxWidth: 170 }}>{value}</Text> : null}
      {right ?? (onPress ? <ChevronRight size={18} color={T.muted} /> : null)}
    </View>
  );
  if (!onPress || disabled) return body;
  return (
    <Pressable onPress={onPress} className="active:bg-midnight-lighter" accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}>
      {body}
    </Pressable>
  );
}

export function SwitchRow({ icon, label, detail, value, onChange, disabled }: { icon?: React.ReactNode; label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row
      icon={icon}
      label={label}
      detail={detail}
      disabled={disabled}
      right={<Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: T.accent, false: T.card2 }} thumbColor="#fff" accessibilityLabel={label} />}
    />
  );
}

export interface Choice<V> { value: V; label: string; detail?: string }

/** A row showing the current choice; tapping opens a sheet to pick another. */
export function ChoiceRow<V extends string | number | null>({ icon, label, value, choices, onChange, detail }: {
  icon?: React.ReactNode; label: string; value: V; choices: Choice<V>[]; onChange: (v: V) => void; detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = choices.find((c) => c.value === value)?.label ?? String(value ?? '—');
  return (
    <>
      <Row icon={icon} label={label} detail={detail} value={current} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} padded={false}>
        <ScrollView style={{ maxHeight: 460 }}>
          {choices.map((c) => (
            <Pressable
              key={String(c.value)}
              onPress={() => { onChange(c.value); setOpen(false); }}
              className="flex-row items-center px-5 py-3.5 active:bg-midnight-lighter"
              accessibilityRole="radio"
              accessibilityState={{ selected: c.value === value }}
            >
              <View className="flex-1">
                <Text className="text-ink text-[15px]">{c.label}</Text>
                {c.detail ? <Text className="text-ink-muted text-xs mt-0.5">{c.detail}</Text> : null}
              </View>
              {c.value === value ? <Check size={18} color={T.accent} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

/** Small segmented chooser for 2–4 options inline. */
export function Segments<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <View className="flex-row bg-midnight rounded-xl p-1 mx-4 my-3 border border-line">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`flex-1 items-center py-2 rounded-lg ${value === o.value ? 'bg-accent' : ''}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.value }}
        >
          <Text className={value === o.value ? 'text-white font-semibold' : 'text-ink'}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const TIME_CHOICES: Choice<string | null>[] = [
  { value: null, label: 'Off' },
  ...['06:00', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => ({ value: t, label: t })),
];
