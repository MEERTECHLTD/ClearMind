import React from 'react';
import { View, Text } from 'react-native';

type Tone = 'accent' | 'green' | 'amber' | 'red' | 'muted';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: 'bg-accent/15', fg: 'text-accent' },
  green: { bg: 'bg-emerald-500/15', fg: 'text-emerald-400' },
  amber: { bg: 'bg-amber-500/15', fg: 'text-amber-400' },
  red: { bg: 'bg-red-500/15', fg: 'text-red-400' },
  muted: { bg: 'bg-midnight-lighter', fg: 'text-ink-muted' },
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View className={`px-2.5 py-1 rounded-full ${t.bg}`}>
      <Text className={`text-xs font-semibold ${t.fg}`}>{label}</Text>
    </View>
  );
}
