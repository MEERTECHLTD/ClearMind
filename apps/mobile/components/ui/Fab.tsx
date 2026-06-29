import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';

/** Floating action button, bottom-right, gradient fill. Light haptic on press. */
export function Fab({ onPress, icon }: { onPress: () => void; icon?: React.ReactNode }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };
  return (
    <Pressable
      onPress={handlePress}
      className="absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center overflow-hidden active:opacity-90"
      style={{ elevation: 6 }}
    >
      <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {icon ?? <Plus size={28} color="#fff" />}
    </Pressable>
  );
}
