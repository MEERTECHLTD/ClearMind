import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';

function pad(n: number) { return String(n).padStart(2, '0'); }
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Date picker field. value = 'YYYY-MM-DD' (or undefined). */
export function DateField({
  label, value, onChange, placeholder = 'Pick a date', clearable = true,
}: {
  label?: string; value?: string; onChange: (v: string | undefined) => void; placeholder?: string; clearable?: boolean;
}) {
  const [show, setShow] = useState(false);
  const current = value ? new Date(value + 'T00:00:00') : new Date();
  return (
    <View>
      {label ? <Text className="text-ink-muted text-xs mb-1.5 ml-1">{label}</Text> : null}
      <Pressable onPress={() => setShow(true)} className="flex-row items-center justify-between bg-midnight-light rounded-2xl px-4 py-3.5 border border-hairline active:opacity-80">
        <Text className={value ? 'text-ink' : 'text-ink-muted'}>{value || placeholder}</Text>
        <View className="flex-row items-center">
          {clearable && value ? (
            <Pressable onPress={() => onChange(undefined)} hitSlop={8} className="mr-3"><Text className="text-ink-muted text-xs">Clear</Text></Pressable>
          ) : null}
          <Calendar size={18} color="#9ca3af" />
        </View>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={current}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, d) => {
            setShow(Platform.OS === 'ios');
            if (e.type === 'set' && d) onChange(toISODate(d));
          }}
        />
      ) : null}
    </View>
  );
}

/** Time picker field. value = 'HH:MM' (or undefined). */
export function TimeField({
  label, value, onChange, placeholder = 'Pick a time', clearable = true,
}: {
  label?: string; value?: string; onChange: (v: string | undefined) => void; placeholder?: string; clearable?: boolean;
}) {
  const [show, setShow] = useState(false);
  const base = new Date();
  if (value) {
    const [h, m] = value.split(':').map(Number);
    base.setHours(h || 0, m || 0, 0, 0);
  }
  return (
    <View>
      {label ? <Text className="text-ink-muted text-xs mb-1.5 ml-1">{label}</Text> : null}
      <Pressable onPress={() => setShow(true)} className="flex-row items-center justify-between bg-midnight-light rounded-2xl px-4 py-3.5 border border-hairline active:opacity-80">
        <Text className={value ? 'text-ink' : 'text-ink-muted'}>{value || placeholder}</Text>
        <View className="flex-row items-center">
          {clearable && value ? (
            <Pressable onPress={() => onChange(undefined)} hitSlop={8} className="mr-3"><Text className="text-ink-muted text-xs">Clear</Text></Pressable>
          ) : null}
          <Clock size={18} color="#9ca3af" />
        </View>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={base}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShow(Platform.OS === 'ios');
            if (e.type === 'set' && d) onChange(toHM(d));
          }}
        />
      ) : null}
    </View>
  );
}
