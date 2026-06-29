import React from 'react';
import { View } from 'react-native';

type Tone = 'accent' | 'green' | 'amber' | 'red';
const FILL: Record<Tone, string> = {
  accent: 'bg-accent',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

export function ProgressBar({ value, tone = 'accent', className = '' }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View className={`h-2 rounded-full bg-midnight-lighter overflow-hidden ${className}`}>
      <View className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </View>
  );
}
