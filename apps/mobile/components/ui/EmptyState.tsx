import React from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  subtitle,
  ctaTitle,
  onCta,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  ctaTitle?: string;
  onCta?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-10 py-16">
      {icon ? <View className="mb-4 opacity-80">{icon}</View> : null}
      <Text className="text-ink text-lg font-semibold text-center">{title}</Text>
      {subtitle ? <Text className="text-ink-muted text-sm text-center mt-2">{subtitle}</Text> : null}
      {ctaTitle && onCta ? (
        <View className="mt-6">
          <Button title={ctaTitle} onPress={onCta} full={false} />
        </View>
      ) : null}
    </View>
  );
}
