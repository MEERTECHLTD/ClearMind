/**
 * Journal (#journal) — Daily log and Rants as two tabs of one destination.
 * The records stay separate (logs vs rants mean different things); only the
 * place you find them is shared. Old routes #dailylog / #rant redirect here.
 */
import React from 'react';
import { PageShell, Segmented } from './PageShell';
import { useHashTab } from './useHashTab';
import DailyLogPanel from './DailyLogView';
import RantsPanel from './RantCorner';

const TABS = ['log', 'rants'] as const;
type Tab = (typeof TABS)[number];

export default function JournalView() {
  const [tab, setTab] = useHashTab<Tab>(TABS, 'log');
  return (
    <PageShell
      title="Journal"
      subtitle={tab === 'log' ? 'Document your wins and failures, one day at a time.' : 'Vent, then turn it into something useful.'}
      wide
    >
      <div className="mb-4">
        <Segmented<Tab> label="Journal section" value={tab} onChange={setTab} options={[{ value: 'log', label: 'Daily log' }, { value: 'rants', label: 'Rants' }]} />
      </div>
      {tab === 'log' ? <DailyLogPanel /> : <RantsPanel />}
    </PageShell>
  );
}
