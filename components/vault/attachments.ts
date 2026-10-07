/**
 * Web attachment store for the vault.
 *
 * Metadata
 *   - cloud (signed-in Firebase user): realtime `subscribeAttachments`
 *     (users/{uid}/attachments, bytes chunked in Firestore — shared/data/attachments).
 *   - local (no user / Firebase not configured): IndexedDB `clearmind-attachments`
 *     (`meta` store; bytes in `blobs`, pinned so they're never evicted).
 * Bytes
 *   Always cached as Blobs in the `blobs` store (LRU, ~200 MB for cloud copies);
 *   `getAttachmentUrl` hands out one memoised object URL per attachment, revoked
 *   on delete / sign-out.
 * Mutations: uploadFiles, renameAttachment (rewrites links in notes/canvases),
 * deleteAttachments (returns undo), downloadAttachment.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Attachment, Note } from '../../types';
import { auth, db, firebaseService, isFirebaseConfigured } from '../../services/firebase';
import {
  putAttachment, getAttachmentBytes, updateAttachment, deleteAttachment, restoreAttachment, subscribeAttachments, AttachmentError,
} from '../../shared/data/attachments';
import { buildIndex, prepareNote, rewriteLinksForAttachmentRename, attachmentPath } from '../../shared/notes';
import { STORES } from '../../services/db';
import { getStore } from '../tasks/store';
import {
  ATTACHMENT_MAX_BYTES, CACHE_CAP_BYTES, uniqueName, namesInFolder, validateSize, planEviction, guessMime, uploadName,
  isValidFileName, formatBytes, type CacheEntry,
} from './attachmentUtils';

export { AttachmentError, ATTACHMENT_MAX_BYTES };

// ------------------------------------------------------------------ toast sink (set by the vault shell)

type Toast = (msg: string, action?: { label: string; onClick: () => void }) => void;
let toastSink: Toast = (m) => console.info('[attachments]', m);
export const setAttachmentToast = (t: Toast) => { toastSink = t; };

// ------------------------------------------------------------------ IndexedDB

const DB_NAME = 'clearmind-attachments';
interface BlobRec { id: string; blob: Blob; size: number; lastAccess: number; pinned?: boolean }

let dbp: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB unavailable')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx<T>(store: 'meta' | 'blobs', mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb();
  return req(f(d.transaction(store, mode).objectStore(store)));
}
const blobGet = (id: string) => tx<BlobRec | undefined>('blobs', 'readonly', (s) => s.get(id) as IDBRequest<BlobRec | undefined>).catch(() => undefined);
const blobPut = (r: BlobRec) => tx('blobs', 'readwrite', (s) => s.put(r)).catch(() => undefined);
const blobDel = (id: string) => tx('blobs', 'readwrite', (s) => s.delete(id)).catch(() => undefined);

/** Evict least-recently-used cached (non-pinned) blobs above the cap. */
async function evict(incoming = 0) {
  try {
    const d = await idb();
    const all = await req(d.transaction('blobs', 'readonly').objectStore('blobs').getAll()) as BlobRec[];
    const entries: CacheEntry[] = all.map((r) => ({ id: r.id, size: r.size, lastAccess: r.lastAccess, pinned: r.pinned }));
    for (const id of planEviction(entries, CACHE_CAP_BYTES, incoming)) await blobDel(id);
  } catch { /* cache is best effort */ }
}

// ------------------------------------------------------------------ store

interface State { mode: 'cloud' | 'local'; uid: string | null; items: Attachment[]; loaded: boolean }
let state: State = { mode: 'local', uid: null, items: [], loaded: false };
let liveCache: Attachment[] = [];
const listeners = new Set<() => void>();
const emit = () => { liveCache = state.items.filter((a) => !a.deleted); listeners.forEach((l) => l()); };
const setState = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
function revoke(id: string) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  pending.delete(id);
}

let started = false;
let unsubMeta: (() => void) | null = null;
let generation = 0;

async function loadLocal(gen: number) {
  try {
    const items = await tx<Attachment[]>('meta', 'readonly', (s) => s.getAll() as IDBRequest<Attachment[]>);
    if (gen === generation) setState({ items, loaded: true });
  } catch { if (gen === generation) setState({ items: [], loaded: true }); }
}

function switchUser(uid: string | null) {
  if (started && uid === state.uid && (uid ? state.mode === 'cloud' : state.mode === 'local')) return;
  const gen = ++generation;
  unsubMeta?.(); unsubMeta = null;
  for (const id of [...urls.keys()]) revoke(id);
  pending.clear();
  state = { mode: uid ? 'cloud' : 'local', uid, items: [], loaded: false };
  emit();
  if (uid && db) {
    unsubMeta = subscribeAttachments(db, uid, (all) => {
      if (gen !== generation) return;
      for (const a of all) if (a.deleted) { revoke(a.id); void blobDel(a.id); }
      setState({ items: all, loaded: true });
    }, () => { if (gen === generation) setState({ loaded: true }); });
  } else void loadLocal(gen);
}

function start() {
  if (started) return;
  started = true;
  if (!isFirebaseConfigured()) { switchUser(null); return; }
  switchUser(auth?.currentUser?.uid ?? null);
  firebaseService.onAuthChange((u) => switchUser(u?.uid ?? null));
}

const subscribe = (l: () => void) => { start(); listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => liveCache;
const loadedSnap = () => state.loaded;

/** Live (non-deleted) attachments. */
export function useAttachments(): Attachment[] { return useSyncExternalStore(subscribe, snapshot, snapshot); }
export const useAttachmentsLoaded = () => useSyncExternalStore(subscribe, loadedSnap, loadedSnap);
export function getAttachments(): Attachment[] { start(); return liveCache; }
export const getAttachment = (id: string) => getAttachments().find((a) => a.id === id) ?? null;

const notesStore = () => getStore<Note>(STORES.NOTES);
const indexNow = () => buildIndex(notesStore().getSnapshot().items.filter((n) => !n.deleted), getAttachments());
const newId = () => `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ------------------------------------------------------------------ bytes & URLs

async function bytesOf(a: Attachment): Promise<Blob> {
  const rec = await blobGet(a.id);
  if (rec) {
    void blobPut({ ...rec, lastAccess: Date.now() });
    return rec.blob.type ? rec.blob : new Blob([rec.blob], { type: a.mime });
  }
  if (state.mode !== 'cloud' || !db || !state.uid) throw new AttachmentError('File data is missing on this device');
  const bytes = await getAttachmentBytes(db, state.uid, a);
  const blob = new Blob([bytes as BlobPart], { type: a.mime });
  await evict(blob.size);
  void blobPut({ id: a.id, blob, size: blob.size, lastAccess: Date.now() });
  return blob;
}

/** Object URL for an attachment (memoised per id; fetched from Firestore on a cache miss). */
export function getAttachmentUrl(a: Attachment): Promise<string> {
  const hit = urls.get(a.id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(a.id);
  if (!p) {
    const gen = generation;
    p = bytesOf(a).then((blob) => {
      const u = URL.createObjectURL(blob);
      if (gen !== generation) { URL.revokeObjectURL(u); throw new AttachmentError('Account changed'); }
      urls.set(a.id, u);
      return u;
    });
    p.catch(() => pending.delete(a.id));
    pending.set(a.id, p);
  }
  return p;
}
/** Synchronous peek (for widgets that render immediately when the URL is already known). */
export const peekAttachmentUrl = (id: string) => urls.get(id) ?? null;

export function useAttachmentUrl(a: Attachment | null | undefined): { url: string | null; loading: boolean; error: string | null } {
  const [s, setS] = useState<{ id: string | null; url: string | null; error: string | null }>({ id: null, url: null, error: null });
  useEffect(() => {
    if (!a) return;
    let alive = true;
    const known = peekAttachmentUrl(a.id);
    setS({ id: a.id, url: known, error: null });
    if (!known) getAttachmentUrl(a).then((url) => { if (alive) setS({ id: a.id, url, error: null }); }, (e) => { if (alive) setS({ id: a.id, url: null, error: e instanceof Error ? e.message : 'Could not load file' }); });
    return () => { alive = false; };
  }, [a?.id, a?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return { url: null, loading: false, error: null };
  const mine = s.id === a.id;
  return { url: mine ? s.url : null, loading: !mine || (!s.url && !s.error), error: mine ? s.error : null };
}

// ------------------------------------------------------------------ upload

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return out;
    }
    const u = URL.createObjectURL(file);
    try {
      return await new Promise((res) => { const img = new Image(); img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => res(null); img.src = u; });
    } finally { URL.revokeObjectURL(u); }
  } catch { return null; }
}

export interface UploadOpts {
  /** 0…1 across all files. */
  onProgress?: (fraction: number) => void;
  /** Files came from the clipboard (generic "image.png" → "Pasted image <stamp>.png"). */
  pasted?: boolean;
}

/** Upload files into `folder`. Too-large files are skipped with a toast. Returns created attachments. */
export async function uploadFiles(files: File[], folder: string | null, opts: UploadOpts = {}): Promise<Attachment[]> {
  start();
  const f = folder?.replace(/^\/+|\/+$/g, '') || null;
  const ok: File[] = [];
  for (const file of files) {
    const err = validateSize(file.size, ATTACHMENT_MAX_BYTES);
    if (err) toastSink(`“${file.name || 'File'}” is ${formatBytes(file.size)} — ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
    else ok.push(file);
  }
  if (!ok.length) return [];
  const total = ok.reduce((s, x) => s + Math.max(1, x.size), 0);
  let done = 0;
  opts.onProgress?.(0);
  const taken = namesInFolder(getAttachments(), f);
  const created: Attachment[] = [];
  const gen = generation;
  for (const file of ok) {
    const name = uniqueName(uploadName(file, new Date(), opts.pasted), taken);
    taken.push(name);
    const mime = guessMime(name, file.type);
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    const [dims, buf] = await Promise.all([imageSize(blob), file.arrayBuffer()]);
    const bytes = new Uint8Array(buf);
    const now = new Date().toISOString();
    const meta = { id: newId(), name, folder: f, mime, createdAt: now, updatedAt: now, width: dims?.width ?? null, height: dims?.height ?? null };
    const weight = Math.max(1, file.size);
    let a: Attachment;
    try {
      if (state.mode === 'cloud' && db && state.uid) {
        a = await putAttachment(db, state.uid, meta, bytes, (i, n) => opts.onProgress?.((done + (weight * i) / n) / total));
        await evict(bytes.length);
        void blobPut({ id: a.id, blob, size: bytes.length, lastAccess: Date.now() });
      } else {
        a = { ...meta, size: bytes.length, chunks: 0 };
        await blobPut({ id: a.id, blob, size: bytes.length, lastAccess: Date.now(), pinned: true });
        await tx('meta', 'readwrite', (s) => s.put(a));
      }
    } catch (e) {
      toastSink(`Upload of “${name}” failed${e instanceof Error && e.message ? `: ${e.message}` : ''}`);
      continue;
    }
    if (gen !== generation) break;
    urls.set(a.id, URL.createObjectURL(blob));
    if (!state.items.some((x) => x.id === a.id)) setState({ items: [...state.items, a] });
    created.push(a);
    done += weight;
    opts.onProgress?.(done / total);
  }
  return created;
}

// ------------------------------------------------------------------ rename / move

async function patchMeta(a: Attachment, patch: Partial<Attachment>) {
  const next = { ...a, ...patch, updatedAt: new Date().toISOString() };
  if (state.mode === 'cloud' && db && state.uid) await updateAttachment(db, state.uid, a.id, patch as Partial<Pick<Attachment, 'name' | 'folder'>>);
  else await tx('meta', 'readwrite', (s) => s.put(next));
  setState({ items: state.items.map((x) => (x.id === a.id ? next : x)) });
}

/**
 * Rename and/or move an attachment; links in notes and canvases are rewritten.
 * Returns how many notes changed (a toast reports it too).
 */
export async function renameAttachment(id: string, next: { name?: string; folder?: string | null }): Promise<number> {
  const a = getAttachment(id);
  if (!a) throw new AttachmentError('File not found');
  const name = (next.name ?? a.name).trim();
  const folder = next.folder === undefined ? a.folder ?? null : (next.folder?.replace(/^\/+|\/+$/g, '') || null);
  if (name === a.name && (folder ?? null) === (a.folder ?? null)) return 0;
  if (!isValidFileName(name)) throw new AttachmentError('File names can’t be empty or contain \\ / : * ? " < > | # ^ [ ]');
  if (namesInFolder(getAttachments().filter((x) => x.id !== id), folder).some((n) => n.toLowerCase() === name.toLowerCase())) {
    throw new AttachmentError(`“${attachmentPath({ name, folder })}” already exists`);
  }
  const changes = rewriteLinksForAttachmentRename(indexNow(), id, { name, folder });
  await patchMeta(a, { name, folder });
  const store = notesStore();
  const byId = new Map(store.getSnapshot().items.map((n) => [n.id, n]));
  const updated = [...changes].map(([nid, content]) => byId.get(nid) && prepareNote({ ...byId.get(nid)!, content })).filter(Boolean) as Note[];
  if (updated.length) {
    await store.putMany(updated);
    toastSink(`Updated links in ${updated.length} note${updated.length === 1 ? '' : 's'}`);
  }
  return updated.length;
}

// ------------------------------------------------------------------ delete (with undo)

/** Delete attachments; bytes are kept in memory so the returned undo can restore them. */
export async function deleteAttachments(ids: string[]): Promise<() => Promise<void>> {
  const victims = getAttachments().filter((a) => ids.includes(a.id));
  const kept: { a: Attachment; blob: Blob | null }[] = [];
  for (const a of victims) {
    const blob = await bytesOf(a).catch(() => null);
    kept.push({ a, blob });
    if (state.mode === 'cloud' && db && state.uid) await deleteAttachment(db, state.uid, a);
    else await tx('meta', 'readwrite', (s) => s.delete(a.id));
    revoke(a.id);
    await blobDel(a.id);
  }
  setState({ items: state.items.filter((x) => !ids.includes(x.id)) });
  const gen = generation;
  return async () => {
    if (gen !== generation) return;
    const restored: Attachment[] = [];
    for (const { a, blob } of kept) {
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let r: Attachment;
      if (state.mode === 'cloud' && db && state.uid) {
        r = await restoreAttachment(db, state.uid, a, bytes);
        void blobPut({ id: a.id, blob, size: bytes.length, lastAccess: Date.now() });
      } else {
        r = { ...a, deleted: false, updatedAt: new Date().toISOString() };
        await blobPut({ id: a.id, blob, size: bytes.length, lastAccess: Date.now(), pinned: true });
        await tx('meta', 'readwrite', (s) => s.put(r));
      }
      restored.push(r);
    }
    setState({ items: [...state.items.filter((x) => !restored.some((r) => r.id === x.id)), ...restored] });
  };
}

// ------------------------------------------------------------------ download

export async function downloadAttachment(a: Attachment): Promise<void> {
  const url = await getAttachmentUrl(a);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
