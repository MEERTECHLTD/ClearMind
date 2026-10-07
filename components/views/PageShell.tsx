import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cx } from '../tasks/ui';

/** Page frame shared by the productivity / activity / templates views (matches the task views). */
export function PageShell({ title, subtitle, actions, children, back, wide }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; back?: boolean; wide?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-white dark:bg-[#05050A]">
      <div className={`${wide ? 'max-w-4xl' : 'max-w-3xl'} mx-auto px-4 sm:px-8 pt-6 pb-24`}>
        <header className="flex items-center gap-2 mb-4">
          {back ? (
            <button onClick={() => history.back()} className={`p-1 -ml-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Back"><ChevronLeft size={20} /></button>
          ) : null}
          <div className="flex-1 min-w-0">
            <h1 className={`text-2xl font-bold truncate ${cx.text}`}>{title}</h1>
            {subtitle ? <p className={`text-sm mt-0.5 ${cx.muted}`}>{subtitle}</p> : null}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border ${cx.border} ${cx.card} p-4 ${className}`}>
      {title || right ? (
        <div className="flex items-center gap-2 mb-3">
          {title ? <h2 className={`text-sm font-semibold flex-1 ${cx.text}`}>{title}</h2> : <div className="flex-1" />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: NoInfer<T>) => void; options: { value: NoInfer<T>; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-gray-100 dark:bg-white/5 p-0.5 gap-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${value === o.value
            ? 'bg-white dark:bg-[#1A1F2B] text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageLoading() {
  return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
}
