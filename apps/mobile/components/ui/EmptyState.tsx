import React from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';

/** The one empty state: icon in a soft circle, title, hint, optional call to action. */
export function EmptyState({
  icon,
  title,
  subtitle,
  ctaTitle,
  onCta,
  fill = true,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  ctaTitle?: string;
  onCta?: () => void;
  /** Grow to fill the parent (centred); false for inline use inside lists. */
  fill?: boolean;
}) {
  return (
    <View className={`${fill ? 'flex-1' : ''} items-center justify-center px-10 py-16`}>
      {icon ? <View className="w-20 h-20 rounded-full bg-midnight-light items-center justify-center mb-4">{icon}</View> : null}
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
