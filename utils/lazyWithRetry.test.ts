import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, loadWithRetry } from './lazyWithRetry';

describe('isChunkLoadError', () => {
  it('recognises the chunk-load failures of Chrome, Firefox and Safari', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/VaultView-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });
  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('loadWithRetry', () => {
  const store = new Map<string, string>();
  const reload = vi.fn();
  beforeEach(() => {
    store.clear();
    reload.mockReset();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    vi.stubGlobal('window', { location: { reload } });
  });
  const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/a.js');

  it('retries once and succeeds on a transient failure', async () => {
    const factory = vi.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce('ok');
    await expect(loadWithRetry(factory)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when the chunk is really gone, then gives up instead of looping', async () => {
    const factory = vi.fn().mockRejectedValue(chunkError());
    const pending = loadWithRetry(factory);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // Same build fails again (the reload didn't help): no second reload, the error surfaces.
    await expect(loadWithRetry(factory)).rejects.toThrow(/dynamically imported module/);
    expect(reload).toHaveBeenCalledTimes(1);
    void pending;
  });

  it('does not retry non-chunk errors', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(loadWithRetry(factory)).rejects.toThrow('boom');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
