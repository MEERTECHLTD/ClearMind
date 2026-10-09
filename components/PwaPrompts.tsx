import React from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X, Share, PlusSquare, AppWindow } from 'lucide-react';
import { applyUpdate, dismissUpdate, useServiceWorkerUpdate, type InstallMode } from '../services/pwa';
import { Modal } from './tasks/ui';

/** Small non-blocking "new version" bar, styled like the task toast. */
export function UpdatePrompt() {
  const { updateReady } = useServiceWorkerUpdate();
  if (!updateReady) return null;
  return createPortal(
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-4 bg-gray-900 text-white dark:bg-[#1A1F2E] border border-gray-700 rounded-xl px-4 py-3 shadow-2xl text-sm"
      role="status"
      aria-live="polite"
    >
      <span>New version available</span>
      <button className="inline-flex items-center gap-1.5 font-semibold text-blue-400 hover:text-blue-300" onClick={applyUpdate}>
        <RefreshCw size={14} />Reload
      </button>
      <button className="text-gray-400 hover:text-white" onClick={dismissUpdate} aria-label="Dismiss"><X size={14} /></button>
    </div>,
    document.body,
  );
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3 items-start">
    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">{n}</span>
    <span className="pt-0.5">{children}</span>
  </li>
);

/** Manual install steps for browsers without an install prompt (Safari). */
export function InstallInstructions({ mode, onClose }: { mode: InstallMode | null; onClose: () => void }) {
  const open = mode === 'safari-mac' || mode === 'ios';
  return (
    <Modal open={open} onClose={onClose} title="Install ClearMind">
      <div className="p-5 text-sm text-gray-700 dark:text-gray-300 space-y-4">
        {mode === 'safari-mac' ? (
          <ol className="space-y-3">
            <Step n={1}>In the Safari menu bar, choose <b>File</b> → <b>Add to Dock…</b> <AppWindow size={14} className="inline -mt-0.5" /></Step>
            <Step n={2}>Click <b>Add</b>. ClearMind opens in its own window from the Dock, Launchpad and Spotlight.</Step>
          </ol>
        ) : (
          <ol className="space-y-3">
            <Step n={1}>Tap the <b>Share</b> button <Share size={14} className="inline -mt-0.5" /> in Safari’s toolbar.</Step>
            <Step n={2}>Choose <b>Add to Home Screen</b> <PlusSquare size={14} className="inline -mt-0.5" />, then <b>Add</b>.</Step>
          </ol>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">Your data and sign-in carry over — it’s the same ClearMind, in its own window.</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white">Got it</button>
        </div>
      </div>
    </Modal>
  );
}
