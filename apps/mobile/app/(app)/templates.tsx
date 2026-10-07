import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { TEMPLATES } from '@clearmind/shared/domain';
import { TaskScreen } from '../../components/tasks/TaskScreen';
import { applyTemplate } from '../../services/taskActions';
import { useToast } from '../../components/ui';

export default function TemplatesScreen() {
  const router = useRouter();
  const toast = useToast();
  return (
    <TaskScreen title="Templates" subtitle="Start a project with sections and tasks" back fab={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {TEMPLATES.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => { const p = applyTemplate(t.id); toast.show(`Created “${p.title}”`, 'success'); router.replace(`/(app)/project/${p.id}`); }}
            className="mb-3 p-4 rounded-2xl bg-midnight-light border border-line active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={`Use template ${t.name}`}
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">{t.icon}</Text>
              <View className="flex-1">
                <Text className="text-ink text-base font-semibold">{t.name}</Text>
                <Text className="text-ink-muted text-sm mt-0.5">{t.description}</Text>
              </View>
            </View>
            <View className="flex-row flex-wrap mt-3">
              {t.sections.map((s) => (
                <View key={s.name} className="px-2 py-1 rounded-md bg-midnight mr-1.5 mb-1.5 border border-line"><Text className="text-ink-muted text-xs">{s.name}{s.tasks.length ? ` · ${s.tasks.length}` : ''}</Text></View>
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </TaskScreen>
  );
}
