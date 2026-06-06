import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';

export interface Option<T extends string = string> {
  label: string;
  value: T;
}

/** Tap-to-open modal picker (replaces every web <select>). */
export function Select<T extends string = string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View className={className}>
      {label ? <Text className="text-ink-muted text-xs mb-1.5 ml-1">{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-midnight-light rounded-2xl px-4 py-3.5 border border-hairline active:opacity-80"
      >
        <Text className="text-ink text-base">{current?.label ?? 'Select…'}</Text>
        <ChevronDown size={18} color="#9ca3af" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setOpen(false)}>
          <Pressable className="bg-midnight-light rounded-t-3xl border-t border-hairline pb-8 pt-2">
            {label ? <Text className="text-ink-muted text-xs text-center py-2">{label}</Text> : null}
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between px-6 py-4 active:bg-midnight-lighter"
                >
                  <Text className={`text-base ${sel ? 'text-accent font-semibold' : 'text-ink'}`}>{o.label}</Text>
                  {sel ? <Check size={18} color="#3B82F6" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
