import React from 'react';
import { Pressable, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BG: Record<Variant, string> = {
  primary: '', // gradient fill (below)
  secondary: 'bg-midnight-lighter active:opacity-80',
  ghost: 'bg-transparent active:opacity-60',
  danger: 'bg-red-500/15 active:bg-red-500/25',
};
const FG: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  ghost: 'text-accent',
  danger: 'text-red-400',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  className = '',
  full = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  full?: boolean;
}) {
  const off = disabled || loading;
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      className={`flex-row items-center justify-center rounded-full py-3.5 px-5 overflow-hidden ${BG[variant]} ${full ? '' : 'self-start'} ${off ? 'opacity-50' : 'active:opacity-90'} ${className}`}
    >
      {isPrimary ? (
        <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : '#3B82F6'} />
      ) : (
        <View className="flex-row items-center">
          {icon ? <View className="mr-2">{icon}</View> : null}
          <Text className={`font-bold text-base ${FG[variant]}`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
