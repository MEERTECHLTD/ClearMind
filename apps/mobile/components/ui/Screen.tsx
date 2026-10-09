import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

/** Page wrapper: safe-area + dark bg + optional scroll + keyboard avoidance. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  contentClassName = '',
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentClassName?: string;
}) {
  const pad = padded ? 'px-4' : '';
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className={`${pad} ${contentClassName}`}>{children}</View>
    </ScrollView>
  ) : (
    <View className={`flex-1 ${pad} ${contentClassName}`}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-midnight">
      {/* Edge-to-edge (Android 15+/targetSdk 36) disables adjustResize, so pad for
          the keyboard on Android too — otherwise bottom inputs sit under it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
