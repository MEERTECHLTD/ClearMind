import React from 'react';
import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';

export function SliderField({
  label, value, onChange, min = 0, max = 100, step = 1, suffix = '%',
}: {
  label?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <View>
      <View className="flex-row justify-between items-center mb-1">
        {label ? <Text className="text-ink-muted text-xs ml-1">{label}</Text> : <View />}
        <Text className="text-ink text-sm font-semibold">{Math.round(value)}{suffix}</Text>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor="#3B82F6"
        maximumTrackTintColor="#1f2937"
        thumbTintColor="#3B82F6"
      />
    </View>
  );
}
