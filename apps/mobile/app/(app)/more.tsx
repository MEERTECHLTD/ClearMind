import React from 'react';
import { Text, Pressable, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Settings, ChevronRight, NotebookPen, Target, Flame, Flag, ScrollText, FolderKanban,
  MessageSquareWarning, LayoutGrid, GraduationCap, Network, BarChart3,
} from 'lucide-react-native';
import { Screen, AppHeader, Card } from '../../components/ui';

type Item = { label: string; icon: React.ReactNode; href: Href };

// Everything not on the bottom tab bar (Home, Tasks, Iris, Calendar live there).
const ITEMS: Item[] = [
  { label: 'Notes', icon: <NotebookPen size={20} color="#3B82F6" />, href: '/(app)/notes' },
  { label: 'Daily Log', icon: <ScrollText size={20} color="#3B82F6" />, href: '/(app)/dailylog' },
  { label: 'Daily Mapper', icon: <LayoutGrid size={20} color="#3B82F6" />, href: '/(app)/dailymapper' },
  { label: 'Goals', icon: <Target size={20} color="#3B82F6" />, href: '/(app)/goals' },
  { label: 'Habits', icon: <Flame size={20} color="#3B82F6" />, href: '/(app)/habits' },
  { label: 'Milestones', icon: <Flag size={20} color="#3B82F6" />, href: '/(app)/milestones' },
  { label: 'Projects', icon: <FolderKanban size={20} color="#3B82F6" />, href: '/(app)/projects' },
  { label: 'Applications', icon: <FolderKanban size={20} color="#3B82F6" />, href: '/(app)/applications' },
  { label: 'Learning Vault', icon: <GraduationCap size={20} color="#3B82F6" />, href: '/(app)/learningvault' },
  { label: 'Mind Map', icon: <Network size={20} color="#3B82F6" />, href: '/(app)/mindmap' },
  { label: 'Analytics', icon: <BarChart3 size={20} color="#3B82F6" />, href: '/(app)/analytics' },
  { label: 'Rant Corner', icon: <MessageSquareWarning size={20} color="#3B82F6" />, href: '/(app)/rant' },
];

export default function MoreScreen() {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <AppHeader title="More" subtitle="All your ClearMind tools" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Card className="p-0 overflow-hidden mb-6">
          {ITEMS.map((item, i) => (
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

        <Card className="p-0 overflow-hidden">
          <Pressable onPress={() => router.push('/(app)/settings')} className="flex-row items-center px-4 py-3.5 active:bg-midnight-lighter">
            <Settings size={20} color="#3B82F6" />
            <Text className="text-ink text-base font-medium flex-1 ml-3">Settings</Text>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  );
}
