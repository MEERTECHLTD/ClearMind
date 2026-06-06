import React from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';

/** Floating action button, bottom-right. */
export function Fab({ onPress, icon }: { onPress: () => void; icon?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-accent items-center justify-center active:bg-accent-hover shadow-lg"
      style={{ elevation: 6 }}
    >
      {icon ?? <Plus size={28} color="#fff" />}
    </Pressable>
  );
}
