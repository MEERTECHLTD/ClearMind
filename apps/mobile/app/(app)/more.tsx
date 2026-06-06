import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Settings, ChevronRight, NotebookPen, Target, Flame, Flag, ScrollText, FolderKanban,
  MessageSquareWarning, LayoutGrid, GraduationCap, Network, BarChart3, Sparkles,
} from 'lucide-react-native';
import { Screen, AppHeader, Card, Badge } from '../../components/ui';

type Item = { label: string; icon: React.ReactNode; href: Href };

const ACTIVE: Item[] = [
  { label: 'Notes', icon: <NotebookPen size={20} color="#3B82F6" />, href: '/(app)/notes' },
  { label: 'Daily Log', icon: <ScrollText size={20} color="#3B82F6" />, href: '/(app)/dailylog' },
  { label: 'Goals', icon: <Target size={20} color="#3B82F6" />, href: '/(app)/goals' },
  { label: 'Habits', icon: <Flame size={20} color="#3B82F6" />, href: '/(app)/habits' },
  { label: 'Milestones', icon: <Flag size={20} color="#3B82F6" />, href: '/(app)/milestones' },
  { label: 'Applications', icon: <FolderKanban size={20} color="#3B82F6" />, href: '/(app)/applications' },
  { label: 'Rant Corner', icon: <MessageSquareWarning size={20} color="#3B82F6" />, href: '/(app)/rant' },
];

const SOON = ['Iris (AI)', 'Daily Mapper', 'Learning Vault', 'Projects', 'Mind Map', 'Analytics'];
const SOON_ICONS: Record<string, React.ReactNode> = {
  'Iris (AI)': <Sparkles size={20} color="#9ca3af" />,
  'Daily Mapper': <LayoutGrid size={20} color="#9ca3af" />,
  'Learning Vault': <GraduationCap size={20} color="#9ca3af" />,
  Projects: <FolderKanban size={20} color="#9ca3af" />,
  'Mind Map': <Network size={20} color="#9ca3af" />,
  Analytics: <BarChart3 size={20} color="#9ca3af" />,
};

export default function MoreScreen() {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <AppHeader title="More" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Card className="p-0 overflow-hidden mb-6">
          {ACTIVE.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.href)}
              className={`flex-row items-center px-4 py-3.5 active:bg-midnight-lighter ${i > 0 ? 'border-t border-hairline' : ''}`}
            >
              {item.icon}
              <Text className="text-ink text-base font-medium flex-1 ml-3">{item.label}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </Pressable>
          ))}
        </Card>

        <Card className="p-0 overflow-hidden mb-6">
          <Pressable onPress={() => router.push('/(app)/settings')} className="flex-row items-center px-4 py-3.5 active:bg-midnight-lighter">
            <Settings size={20} color="#3B82F6" />
            <Text className="text-ink text-base font-medium flex-1 ml-3">Settings</Text>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
        </Card>

        <Text className="text-ink-muted text-xs font-semibold mb-2 ml-1">COMING SOON</Text>
        <Card className="p-0 overflow-hidden">
          {SOON.map((label, i) => (
            <View key={label} className={`flex-row items-center px-4 py-3.5 ${i > 0 ? 'border-t border-hairline' : ''}`}>
              <View className="opacity-70">{SOON_ICONS[label]}</View>
              <Text className="text-ink-muted text-base flex-1 ml-3">{label}</Text>
              <Badge label="Soon" tone="muted" />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
