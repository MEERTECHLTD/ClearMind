import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isFirebaseConfigured } from '../lib/firebase';
import { isApiConfigured } from '../services/gemini';
import { getSyncableStores, STORES } from '@clearmind/shared/data/collections';

// Phase 2 placeholder home. It deliberately imports from BOTH the shared core
// and the mobile adapters so the skeleton proves end-to-end wiring: the same
// store map the web uses, the same Firebase project, the same Gemini core.
export default function Home() {
  return (
    <SafeAreaView className="flex-1 bg-midnight">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-accent text-3xl font-extrabold">ClearMind</Text>
        <Text className="text-ink-muted mt-1 text-base">Mobile — Phase 2 skeleton</Text>

        <View className="mt-8 w-full rounded-2xl bg-midnight-light p-5">
          <Row label="Firebase configured" value={String(isFirebaseConfigured())} />
          <Row label="Gemini configured" value={String(isApiConfigured())} />
          <Row label="Syncable stores (shared)" value={String(getSyncableStores().length)} />
          <Row label="Total local stores" value={String(Object.keys(STORES).length)} />
        </View>

        <Text className="text-ink-muted/70 mt-6 text-center text-xs">
          Shared core wired. Auth, sqlite sync, UI kit and views land in Phases 3–9
          (see apps/mobile/ROADMAP.md).
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-ink">{label}</Text>
      <Text className="text-accent font-semibold">{value}</Text>
    </View>
  );
}
