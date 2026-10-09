/**
 * Web PWA plumbing: service-worker registration + "new version" update flow,
 * and the platform-aware install action behind the top bar's install button.
 * See docs/WEB_CACHING_AND_PWA.md.
 */
import { useSyncExternalStore } from 'react';

// ------------------------------------------------------------------ service worker

type Snapshot = { updateReady: boolean };
let snapshot: Snapshot = { updateReady: false };
const listeners = new Set<() => void>();
const emit = (next: Snapshot) => { snapshot = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

let waitingWorker: ServiceWorker | null = null;
let userAcceptedUpdate = false;
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function setWaiting(sw: ServiceWorker | null) {
  waitingWorker = sw;
  emit({ updateReady: !!sw });
  sw?.addEventListener('statechange', () => {
    // Activated by someone else (another tab accepted, or a legacy-worker takeover).
    if (sw.state !== 'installed' && waitingWorker === sw) setWaiting(null);
  });
}

/**
 * Register /sw.js (production builds only — dev never has a service worker).
 * Safe to call repeatedly; returns the same registration promise.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    registration = Promise.resolve(null);
    return registration;
  }
  const sw = navigator.serviceWorker;
  sw.addEventListener('controllerchange', () => {
    // Only reload when this tab asked for the update; other tabs keep working and
    // pick the new build up on their next navigation/reload.
    if (userAcceptedUpdate) window.location.reload();
  });
  registration = sw
    .register('/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      const track = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const check = () => {
          // "installed" while another worker controls the page = an update is waiting.
          if (worker.state === 'installed' && sw.controller) setWaiting(worker);
        };
        check();
        worker.addEventListener('statechange', check);
      };
      if (reg.waiting && sw.controller) setWaiting(reg.waiting);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Look for a new deploy when the app comes back to the foreground, and hourly.
      const poll = () => { reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
      window.setInterval(poll, 60 * 60 * 1000);
      return reg;
    })
    .catch((e) => {
      console.warn('Service worker registration failed', e);
      return null;
    });
  return registration;
}

/** Activate the waiting worker and reload into the new version. */
export function applyUpdate() {
  userAcceptedUpdate = true;
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Fallback if controllerchange never fires (e.g. the worker was already activated).
    window.setTimeout(() => window.location.reload(), 3000);
  } else {
    window.location.reload();
  }
}

export function dismissUpdate() {
  emit({ updateReady: false });
}

export function useServiceWorkerUpdate(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

// ------------------------------------------------------------------ install

/** What the install button does on this browser. */
export type InstallMode =
  | 'prompt' //       Chromium/Edge desktop & Android: native beforeinstallprompt
  | 'safari-mac' //   Safari 17+ on macOS: File → Add to Dock
  | 'ios' //          Safari on iPhone/iPad: Share → Add to Home Screen
  | 'android-app' //  Android without a web-install prompt: the Play Store app
  | 'none'; //        already installed, or no install path (e.g. Firefox desktop)

export const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=tech.meertech.clearmind';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallSnapshot = { mode: InstallMode; installed: boolean };
let deferred: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
let installSnap: InstallSnapshot = { mode: 'none', installed: false };
const subscribeInstall = (l: () => void) => { installListeners.add(l); return () => { installListeners.delete(l); }; };

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectInstallMode(ua: string, opts: { standalone: boolean; hasPrompt: boolean; maxTouchPoints: number }): InstallMode {
  if (opts.standalone) return 'none';
  const android = /Android/i.test(ua);
  if (android) return 'android-app'; // native app first on Android
  if (opts.hasPrompt) return 'prompt';
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && opts.maxTouchPoints > 1); // iPadOS reports "Macintosh"
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|FxiOS|EdgiOS|Edg\/|OPR\//.test(ua);
  if (iOS) return 'ios';
  if (safari && /Macintosh/i.test(ua)) {
    const v = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return v >= 17 ? 'safari-mac' : 'none';
  }
  return 'none';
}

function recompute() {
  const standalone = isStandalone();
  installSnap = {
    installed: standalone,
    mode: detectInstallMode(navigator.userAgent, { standalone, hasPrompt: !!deferred, maxTouchPoints: navigator.maxTouchPoints || 0 }),
  };
  installListeners.forEach((l) => l());
}

let installInit = false;
/** Start listening for install-related events. Call once at startup (before the browser fires beforeinstallprompt). */
export function initInstall() {
  if (installInit || typeof window === 'undefined') return;
  installInit = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    recompute();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    recompute();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', recompute);
  recompute();
}

/** Show the native install dialog (mode 'prompt'). Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // a prompt event can only be used once
  await e.prompt();
  const { outcome } = await e.userChoice;
  recompute();
  return outcome === 'accepted';
}

export function useInstall(): InstallSnapshot {
  return useSyncExternalStore(subscribeInstall, () => installSnap, () => installSnap);
}
