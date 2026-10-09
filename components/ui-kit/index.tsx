/**
 * Shared building blocks for the original ClearMind tools (calendar, habits,
 * goals, applications, …) so they look and behave like the task views.
 * Everything here is a thin layer over the task design system
 * (components/tasks/ui.tsx tokens + components/views/PageShell.tsx frame).
 */
import React, { useCallback } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { cx, useTaskToast } from '../tasks/ui';
import { useTaskUI } from '../tasks/TaskContext';
import { createTask, type NewTaskInput } from '../tasks/actions';

export { cx, Modal, Popover, MenuItem, useTaskToast } from '../tasks/ui';
export { Empty } from '../tasks/TaskList';
export { PageShell, Card, Segmented, PageLoading } from '../views/PageShell';

/** Full-width page (canvas / board / calendar grid) with the same header as PageShell. */
export function FullPage({ title, subtitle, actions, children, scroll = true, bodyClassName = '' }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
  /** false = the body fills the remaining height and manages its own overflow (canvases). */
  scroll?: boolean; bodyClassName?: string;
}) {
  return (
    <div className={`h-full flex flex-col bg-white dark:bg-[#05050A] ${scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}>
      <header className="flex flex-wrap items-center gap-2 px-4 sm:px-8 pt-6 mb-4 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl font-bold truncate ${cx.text}`}>{title}</h1>
          {subtitle ? <p className={`text-sm mt-0.5 ${cx.muted}`}>{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={`px-4 sm:px-8 ${scroll ? 'pb-24' : 'flex-1 min-h-0 pb-4'} ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/** Icon-only button: always labelled (aria-label + title), 16px icon by convention. */
export function IconBtn({ label, onClick, children, danger, active, disabled, className = '', type = 'button' }: {
  label: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode;
  danger?: boolean; active?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cx.hover} ${
        danger ? 'text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400' : active ? 'text-blue-600 dark:text-blue-400' : cx.muted
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Labelled form control. */
export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={`block text-xs font-medium mb-1 ${cx.muted}`}>{label}</span>
      {children}
      {hint ? <span className={`block text-xs mt-1 ${cx.faint}`}>{hint}</span> : null}
    </label>
  );
}

export const inputCls = `w-full ${cx.input}`;

/** Modal body / footer spacing matching the task dialogs. */
export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 space-y-4 overflow-y-auto ${className}`}>{children}</div>;
}
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${cx.border}`}>{children}</div>;
}

export function ProgressBar({ value, max = 100, color = '#3B82F6', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Small neutral (or coloured) pill. */
export function Badge({ children, color, className = '' }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md ${color ? '' : `bg-gray-100 dark:bg-white/5 ${cx.muted}`} ${className}`}
      style={color ? { color, background: `${color}1A` } : undefined}
    >
      {children}
    </span>
  );
}

/** "+ Add task" row (same look as the task lists' AddTaskRow) with a custom action. */
export function AddRow({ onClick, label = 'Add task' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className={`group w-full flex items-center gap-3 py-2 px-1 text-sm ${cx.muted} hover:text-blue-600 dark:hover:text-blue-400`}>
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"><Plus size={16} /></span>
      {label}
    </button>
  );
}

export function ErrorState({ title, subtitle, onRetry }: { title: string; subtitle?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6" role="alert">
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4"><AlertTriangle size={30} className="text-red-500" /></div>
      <p className={`font-semibold ${cx.text}`}>{title}</p>
      {subtitle ? <p className={`text-sm mt-1 max-w-sm ${cx.muted}`}>{subtitle}</p> : null}
      {onRetry ? <button onClick={onRetry} className={`mt-4 ${cx.btnGhost}`}>Try again</button> : null}
    </div>
  );
}

/**
 * Create a real task (shared domain layer) from another tool — a milestone,
 * application, resource, mind-map node … — and confirm with a toast that can
 * open it. Quick Add can't prefill a title on the web, so this writes directly.
 */
export function useCreateLinkedTask() {
  const toast = useTaskToast();
  const { openTask } = useTaskUI();
  return useCallback((input: NewTaskInput) => {
    const title = input.title.trim();
    if (!title) return null;
    const t = createTask({ ...input, title });
    toast(`Task added: ${title.length > 40 ? `${title.slice(0, 40)}…` : title}`, { label: 'Open', onClick: () => openTask(t.id) });
    return t;
  }, [toast, openTask]);
}
