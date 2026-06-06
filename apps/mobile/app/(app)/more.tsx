import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Settings, ChevronRight, NotebookPen, Target, Flame, Flag, CalendarDays,
  ScrollText, LayoutGrid, GraduationCap, FolderKanban, Network, BarChart3, Sparkles, MessageSquareWarning,
} from 'lucide-react-native';
import { Screen, AppHeader, Card, Badge } from '../../components/ui';

// Views shipping in upcoming phases — shown so the roadmap is visible.
const SOON: { label: string; icon: React.ReactNode }[] = [
  { label: 'Notes', icon: <NotebookPen size={20} color="#9ca3af" /> },
  { label: 'Goals', icon: <Target size={20} color="#9ca3af" /> },
  { label: 'Habits', icon: <Flame size={20} color="#9ca3af" /> },
  { label: 'Milestones', icon: <Flag size={20} color="#9ca3af" /> },
  { label: 'Calendar', icon: <CalendarDays size={20} color="#9ca3af" /> },
  { label: 'Daily Log', icon: <ScrollText size={20} color="#9ca3af" /> },
  { label: 'Daily Mapper', icon: <LayoutGrid size={20} color="#9ca3af" /> },
  { label: 'Applications', icon: <FolderKanban size={20} color="#9ca3af" /> },
  { label: 'Learning Vault', icon: <GraduationCap size={20} color="#9ca3af" /> },
  { label: 'Projects', icon: <FolderKanban size={20} color="#9ca3af" /> },
  { label: 'Mind Map', icon: <Network size={20} color="#9ca3af" /> },
  { label: 'Analytics', icon: <BarChart3 size={20} color="#9ca3af" /> },
  { label: 'Iris (AI)', icon: <Sparkles size={20} color="#9ca3af" /> },
  { label: 'Rant Corner', icon: <MessageSquareWarning size={20} color="#9ca3af" /> },
];

export default function MoreScreen() {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <AppHeader title="More" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push('/(app)/settings')}>
          <Card className="flex-row items-center mb-6">
            <Settings size={22} color="#3B82F6" />
            <Text className="text-ink text-base font-semibold flex-1 ml-3">Settings</Text>
            <ChevronRight size={20} color="#9ca3af" />
          </Card>
        </Pressable>

        <Text className="text-ink-muted text-xs font-semibold mb-2 ml-1">COMING SOON</Text>
        <Card className="p-0 overflow-hidden">
          {SOON.map((item, i) => (
            <View key={item.label} className={`flex-row items-center px-4 py-3.5 ${i > 0 ? 'border-t border-hairline' : ''}`}>
              <View className="opacity-70">{item.icon}</View>
              <Text className="text-ink-muted text-base flex-1 ml-3">{item.label}</Text>
              <Badge label="Soon" tone="muted" />
            </View>
          ))}
        </Card>
        <Text className="text-ink-muted text-center text-xs mt-6">
          Full views are landing in upcoming updates. Tasks &amp; your dashboard are live now.
        </Text>
      </ScrollView>
    </Screen>
  );
}
