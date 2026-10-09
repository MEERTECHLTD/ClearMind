/**
 * React.lazy that survives deploys.
 *
 * After a deploy, a tab that is still running the previous build asks for lazy
 * chunks (e.g. /assets/VaultView-<oldhash>.js) that no longer exist. Plain
 * React.lazy caches that rejected promise forever, so the view never renders
 * until a manual refresh. Here we:
 *
 *   1. retry the import once (covers a flaky network);
 *   2. if it still fails with a chunk-load error, reload the page once so the
 *      tab picks up the new index.html and its new chunk names. A sessionStorage
 *      marker holding the URL of the build that triggered the reload prevents
 *      loops: if the reload lands on the same build again, we stop and let the
 *      error boundary show a Retry/Reload screen instead;
 *   3. remember failed loaders so the boundary (or a route change) can discard
 *      the cached rejection and try again (`resetFailedLazy`).
 */
import { createElement, lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'cm.chunkReloadFrom';
/** Identifies the running build: this module is bundled into the hashed entry chunk. */
const BUILD_MARKER = import.meta.url;

export function isChunkLoadError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  const msg = String(err?.message ?? e ?? '');
  return (
    err?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script|is not a valid JavaScript MIME type/i.test(msg)
  );
}

/** Reload once per build. Returns false if we already reloaded from this build (or can't tell). */
export function reloadOnceForNewBuild(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === BUILD_MARKER) return false;
    sessionStorage.setItem(RELOAD_KEY, BUILD_MARKER);
  } catch {
    return false; // storage blocked: never auto-reload, the boundary offers a button
  }
  window.location.reload();
  return true;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loadWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (first) {
    if (!isChunkLoadError(first)) throw first;
    await wait(500);
    try {
      return await factory();
    } catch (second) {
      if (isChunkLoadError(second) && reloadOnceForNewBuild()) {
        return new Promise<T>(() => {}); // the page is reloading; keep showing the spinner
      }
      throw second;
    }
  }
}

const failed = new Set<() => void>();

/** Forget cached failures so the next render tries to load again. */
export function resetFailedLazy() {
  failed.forEach((reset) => reset());
  failed.clear();
}

export function lazyWithRetry<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  const make = () =>
    lazy(() =>
      loadWithRetry(factory).catch((e) => {
        failed.add(reset);
        throw e;
      }),
    );
  let current = make();
  function reset() {
    current = make();
  }
  const Lazy = (props: P) => createElement(current as ComponentType<P>, props);
  return Lazy;
}
