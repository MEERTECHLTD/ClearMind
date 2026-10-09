import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen, AppHeader, SegmentedControl } from '../../components/ui';
import { DailyLogPanel } from '../../components/journal/DailyLogPanel';
import { RantPanel } from '../../components/journal/RantPanel';

type Mode = 'log' | 'rants';

/**
 * Journal — personal writing in one place: the Daily Log (wins, failures, mood)
 * and Rant Corner (vent, get AI perspective). Two modes of one workspace; the
 * records stay in their own stores because they mean different things.
 */
export default function JournalScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [mode, setMode] = useState<Mode>(tab === 'rants' ? 'rants' : 'log');
  return (
    <Screen padded={false}>
      <AppHeader title="Journal" subtitle={mode === 'log' ? 'Log your wins, failures and mood' : 'Vent it out, then move forward'} />
      <SegmentedControl<Mode>
        segments={[{ label: 'Daily log', value: 'log' }, { label: 'Rants', value: 'rants' }]}
        value={mode}
        onChange={setMode}
        className="mx-4 mb-2"
      />
      {mode === 'log' ? <DailyLogPanel /> : <RantPanel />}
    </Screen>
  );
}
