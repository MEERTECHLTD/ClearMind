/**
 * Applications (#applications) — the tracker and the AI Reviewer as two tabs
 * of one destination (the Reviewer is no longer a separate sidebar entry).
 * #reviewer redirects to #applications?tab=reviewer. Both tools stay their own
 * components; a tab, once opened, stays mounted so switching back keeps its
 * state (an in-progress review, filters…). The `?joinWorkspace=` invite flow is
 * handled by the tracker, which is the default tab.
 */
import React, { Suspense, useState } from 'react';
import { Briefcase, ScanSearch } from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { cx } from '../tasks/ui';
import { PageLoading } from './PageShell';
import { useHashTab } from './useHashTab';

const ApplicationsView = lazyWithRetry(() => import('./ApplicationsView'));
const ApplicationReviewerView = lazyWithRetry(() => import('./ApplicationReviewerView'));

const TABS = ['tracker', 'reviewer'] as const;
type Tab = (typeof TABS)[number];

export default function ApplicationsWorkspace() {
  const [tab, setTab] = useHashTab<Tab>(TABS, 'tracker');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]));

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button
      role="tab" id={`apps-tab-${id}`} aria-selected={tab === id} aria-controls={`apps-panel-${id}`} onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 px-3 py-2.5 -mb-px border-b-2 text-sm font-medium transition-colors ${tab === id
        ? 'border-blue-600 text-blue-700 dark:text-blue-300'
        : `border-transparent ${cx.muted} hover:text-gray-900 dark:hover:text-gray-100`}`}
    >{icon}{label}</button>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div role="tablist" aria-label="Applications" className={`shrink-0 flex gap-1 px-4 sm:px-8 border-b ${cx.border} bg-white dark:bg-[#05050A]`}>
        {tabBtn('tracker', 'Tracker', <Briefcase size={16} />)}
        {tabBtn('reviewer', 'AI Reviewer', <ScanSearch size={16} />)}
      </div>
      <div className="flex-1 min-h-0 relative">
        {TABS.filter((t) => visited.has(t)).map((t) => (
          <div key={t} role="tabpanel" id={`apps-panel-${t}`} aria-labelledby={`apps-tab-${t}`} className={`h-full ${tab === t ? '' : 'hidden'}`}>
            <Suspense fallback={<PageLoading />}>
              {t === 'tracker' ? <ApplicationsView /> : <ApplicationReviewerView />}
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
