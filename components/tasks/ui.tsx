import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Task, TaskPriority } from '../../types';
import { isOverdue, parseISODate, diffDays } from '../../shared/tasks';

// ------------------------------------------------------------------ tokens

export const PRIORITY_COLOR: Record<TaskPriority, string> = { High: '#F43F5E', Medium: '#F59E0B', Low: '#3B82F6', None: '#9CA3AF' };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { High: 'Priority 1', Medium: 'Priority 2', Low: 'Priority 3', None: 'Priority 4' };
export const PRIORITY_SHORT: Record<TaskPriority, string> = { High: 'P1', Medium: 'P2', Low: 'P3', None: 'P4' };
export const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

/** Theme-aware class sets (light + dark), used across the task UI. */
export const cx = {
  text: 'text-gray-900 dark:text-gray-100',
  muted: 'text-gray-500 dark:text-gray-400',
  faint: 'text-gray-400 dark:text-gray-500',
  border: 'border-gray-200 dark:border-gray-800',
  card: 'bg-white dark:bg-[#0F1219]',
  hover: 'hover:bg-gray-100 dark:hover:bg-white/5',
  input: 'bg-white dark:bg-[#05050A] border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40',
  btnPrimary: 'px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed',
  btnGhost: 'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10',
};

export function dueColor(t: Pick<Task, 'dueDate' | 'dueTime'> & { completed?: boolean }, now = new Date()): string {
  if (isOverdue({ completed: false, ...t } as Task, now)) return '#EF4444';
  const d = parseISODate(t.dueDate);
  if (!d) return '#9CA3AF';
  const delta = diffDays(now, d);
  if (delta === 0) return '#16A34A';
  if (delta === 1) return '#D97706';
  if (delta > 1 && delta < 7) return '#8B5CF6';
  return '#9CA3AF';
}

// ------------------------------------------------------------------ modal

export function Modal({
  open, onClose, children, title, wide = false, labelledBy,
}: { open: boolean; onClose: () => void; children: React.ReactNode; title?: string; wide?: boolean; labelledBy?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/50 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby={labelledBy}
        className={`${cx.card} w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} h-full sm:h-auto sm:max-h-[88vh] sm:rounded-xl shadow-2xl border ${cx.border} flex flex-col overflow-hidden`}
      >
        {title ? (
          <div className={`flex items-center px-5 py-3 border-b ${cx.border}`}>
            <h2 className={`flex-1 font-semibold ${cx.text}`}>{title}</h2>
            <button onClick={onClose} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Close"><X size={18} /></button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ popover

/** Dropdown anchored under (or above, if no room) an element; closes on outside click / Esc. */
export function Popover({
  anchor, open, onClose, children, width = 280,
}: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 300;
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className={`fixed z-[120] ${cx.card} border ${cx.border} rounded-xl shadow-2xl py-1.5 max-h-[70vh] overflow-y-auto`}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  icon, label, hint, onClick, danger, selected,
}: { icon?: React.ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean; selected?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left ${cx.hover} ${danger ? 'text-red-500' : cx.text}`}
      role="menuitem"
      aria-checked={selected}
    >
      {icon ? <span className="w-5 flex justify-center">{icon}</span> : null}
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className={`text-xs ${cx.muted}`}>{hint}</span> : null}
      {selected ? <span className="text-blue-500 text-xs">✓</span> : null}
    </button>
  );
}

// ------------------------------------------------------------------ toast with undo

interface ToastState { id: number; message: string; action?: { label: string; onClick: () => void } }
const ToastCtx = createContext<(message: string, action?: ToastState['action']) => void>(() => {});
export const useTaskToast = () => useContext(ToastCtx);

export function TaskToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((message: string, action?: ToastState['action']) => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, action });
    timer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? createPortal(
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-4 bg-gray-900 text-white dark:bg-[#1A1F2E] border border-gray-700 rounded-xl px-4 py-3 shadow-2xl text-sm" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.action ? (
            <button className="font-semibold text-blue-400 hover:text-blue-300" onClick={() => { toast.action!.onClick(); setToast(null); }}>
              {toast.action.label}
            </button>
          ) : null}
          <button className="text-gray-400 hover:text-white" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>,
        document.body,
      ) : null}
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ checkbox

export function TaskCheck({ task, checked, onToggle, size = 18 }: { task: Pick<Task, 'priority' | 'title'>; checked: boolean; onToggle: () => void; size?: number }) {
  const color = PRIORITY_COLOR[(task.priority && task.priority in PRIORITY_COLOR ? task.priority : 'None') as TaskPriority];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
      className="group/check shrink-0 rounded-full flex items-center justify-center transition-colors"
      style={{ width: size, height: size, border: `2px solid ${color}`, background: checked ? color : `${color}1A` }}
    >
      <svg viewBox="0 0 24 24" width={size - 6} height={size - 6} className={checked ? 'opacity-100' : 'opacity-0 group-hover/check:opacity-60'}>
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={checked ? '#fff' : color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
