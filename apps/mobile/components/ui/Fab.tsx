import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';

/** Floating action button, bottom-right, gradient fill. */
export function Fab({ onPress, icon }: { onPress: () => void; icon?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute bottom-6 right-5 w-14 h-14 rounded-full items-center justify-center overflow-hidden active:opacity-90"
      style={{ elevation: 6 }}
    >
      <LinearGradient colors={['#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {icon ?? <Plus size={28} color="#fff" />}
    </Pressable>
  );
}
