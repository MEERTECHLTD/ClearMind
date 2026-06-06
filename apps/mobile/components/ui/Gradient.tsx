import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Preset = 'accent' | 'brand' | 'sky' | 'violet';
const PRESETS: Record<Preset, [string, string]> = {
  accent: ['#3B82F6', '#2563EB'],
  brand: ['#3B82F6', '#1e40af'],
  sky: ['#38bdf8', '#3B82F6'],
  violet: ['#6366f1', '#3B82F6'],
};

/**
 * Gradient fill behind children. Implemented as a clipping View (className for
 * layout) + an absolute-fill LinearGradient, so NativeWind classNames work
 * normally and the gradient degrades to nothing harmful if it can't render.
 */
export function Gradient({
  preset = 'accent',
  colors,
  className = '',
  style,
  children,
}: {
  preset?: Preset;
  colors?: [string, string, ...string[]];
  className?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  return (
    <View className={className} style={[{ overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={colors ?? PRESETS[preset]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
