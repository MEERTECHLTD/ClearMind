/**
 * Insights (#insights) — one destination for progress: the "Tasks" tab is the
 * productivity dashboard (momentum, goals, streaks, from the completion log);
 * the "Life" tab is the cross-tool charts that used to be Analytics. Old routes
 * #productivity / #analytics redirect to the matching tab.
 */
import React, { Suspense } from 'react';
import { Settings2 } from 'lucide-react';
import { cx } from '../tasks/ui';
import { go } from '../tasks/TaskViews';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { PageShell, Segmented, PageLoading } from './PageShell';
import { useHashTab } from './useHashTab';
import ProductivityPanel from './ProductivityView';

// Charts (recharts) only load when the Life tab is opened.
const LifePanel = lazyWithRetry(() => import('./AnalyticsView'));

const TABS = ['tasks', 'life'] as const;
type Tab = (typeof TABS)[number];

export default function InsightsView() {
  const [tab, setTab] = useHashTab<Tab>(TABS, 'tasks');
  return (
    <PageShell
      title="Insights"
      subtitle={tab === 'tasks' ? 'Momentum, goals and streaks — across every device and agent' : 'Mood, habits, goals and projects at a glance'}
      wide
      actions={tab === 'tasks' ? (
        <button onClick={() => go('settings?s=productivity')} className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`} aria-label="Productivity goals settings"><Settings2 size={15} /><span className="hidden sm:inline">Goals</span></button>
      ) : undefined}
    >
      <div className="mb-4">
        <Segmented<Tab> label="Insights section" value={tab} onChange={setTab} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'life', label: 'Life' }]} />
      </div>
      {tab === 'tasks' ? <ProductivityPanel /> : <Suspense fallback={<PageLoading />}><LifePanel /></Suspense>}
    </PageShell>
  );
}
