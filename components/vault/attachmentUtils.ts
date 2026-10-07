/**
 * Pure helpers for vault attachments (no React / Firebase / DOM): unique
 * naming, size validation, the blob-cache eviction policy, attachment folder
 * resolution and embed-link text. Unit tested in node (attachmentUtils.test.ts).
 */
import type { Attachment } from '../../types';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Soft cap for downloaded bytes cached in IndexedDB (cloud mode). */
export const CACHE_CAP_BYTES = 200 * 1024 * 1024;

const norm = (f: string | null | undefined) => (f ?? '').replace(/^\/+|\/+$/g, '');

export function splitExt(name: string): [base: string, ext: string] {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

/** Characters Obsidian (and our link syntax) can't carry in a file name. */
export function sanitizeFileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim();
  return clean || 'file';
}

export const isValidFileName = (name: string) => !!name.trim() && !/[\\/:*?"<>|#^[\]]/.test(name) && name.trim() !== '.' && name.trim() !== '..';

/** "name.png" → "name 1.png", "name 2.png"… until it's free (case-insensitive) among `taken`. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((t) => t.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  const [base, ext] = splitExt(name);
  const stem = base.replace(/ \d+$/, '');
  for (let i = 1; ; i++) {
    const cand = `${stem} ${i}${ext}`;
    if (!set.has(cand.toLowerCase())) return cand;
  }
}

/** Names already used in `folder` (live attachments only). */
export const namesInFolder = (all: Pick<Attachment, 'name' | 'folder' | 'deleted'>[], folder: string | null | undefined) =>
  all.filter((a) => !a.deleted && norm(a.folder) === norm(folder)).map((a) => a.name);

/** Null when OK, else a user-facing message. */
export function validateSize(size: number, max = ATTACHMENT_MAX_BYTES): string | null {
  if (size > max) return `Files up to ${Math.round(max / 1024 / 1024)} MB are supported`;
  return null;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[u]}`;
}

// ------------------------------------------------------------------ cache eviction

export interface CacheEntry { id: string; size: number; lastAccess: number; /** Source of truth (local mode) — never evicted. */ pinned?: boolean }

/**
 * Least-recently-used eviction: which entries to drop so the evictable total
 * (pinned entries don't count) plus `incoming` fits under `cap`.
 */
export function planEviction(entries: CacheEntry[], cap = CACHE_CAP_BYTES, incoming = 0): string[] {
  const evictable = entries.filter((e) => !e.pinned).sort((a, b) => a.lastAccess - b.lastAccess);
  let total = evictable.reduce((s, e) => s + e.size, 0) + incoming;
  const out: string[] = [];
  for (const e of evictable) {
    if (total <= cap) break;
    out.push(e.id);
    total -= e.size;
  }
  return out;
}

// ------------------------------------------------------------------ where uploads go

export type AttachmentLocation = 'root' | 'current' | 'folder';

/** Folder for new attachments: vault root, the note's folder, or a fixed folder (default "Attachments"). */
export function attachmentFolderFor(s: { attachmentLocation?: AttachmentLocation; attachmentFolder?: string }, noteFolder?: string | null): string | null {
  const loc = s.attachmentLocation ?? 'folder';
  if (loc === 'root') return null;
  if (loc === 'current') return norm(noteFolder) || null;
  return norm(s.attachmentFolder ?? 'Attachments') || null;
}

// ------------------------------------------------------------------ naming & link text

const pad = (n: number) => String(n).padStart(2, '0');
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
  'application/pdf': '.pdf', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
Object.assign(MIME_BY_EXT, { '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json', '.zip': 'application/zip', '.flac': 'audio/flac', '.mkv': 'video/x-matroska', '.bmp': 'image/bmp' });

export const guessMime = (name: string, given?: string) => (given && given !== 'application/octet-stream' ? given : MIME_BY_EXT[splitExt(name)[1].toLowerCase()] ?? (given || 'application/octet-stream'));

/**
 * Name for an uploaded file. Clipboard images arrive as "image.png" (or
 * nameless) → Obsidian's "Pasted image 20261007143005.png".
 */
export function uploadName(file: { name?: string; type?: string }, now = new Date(), pasted = false): string {
  const raw = (file.name ?? '').trim();
  const generic = !raw || (pasted && /^image\.(png|jpe?g|gif|webp)$/i.test(raw));
  if (!generic) return sanitizeFileName(raw);
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const ext = splitExt(raw)[1] || EXT_BY_MIME[file.type ?? ''] || '';
  return `${(file.type ?? '').startsWith('image/') ? 'Pasted image' : 'Pasted file'} ${stamp}${ext}`;
}

/** Link target for an attachment: bare name, or the full path when the name is ambiguous in the vault. */
export function linkTargetFor(a: Pick<Attachment, 'id' | 'name' | 'folder'>, all: Pick<Attachment, 'id' | 'name' | 'deleted'>[]): string {
  const dup = all.some((x) => x.id !== a.id && !x.deleted && x.name.toLowerCase() === a.name.toLowerCase());
  return dup && a.folder ? `${norm(a.folder)}/${a.name}` : a.name;
}

/** Text inserted for freshly uploaded files: one `![[…]]` per file, newline separated. */
export const embedText = (targets: string[]) => targets.map((t) => `![[${t}]]`).join('\n');

/** `![[file|300]]` / `|300x200` → size; anything else → nothing. */
export function parseEmbedSize(alias?: string | null): { width?: number; height?: number } {
  const m = /^\s*(\d+)(?:x(\d+))?\s*$/.exec(alias ?? '');
  return m ? { width: Number(m[1]), height: m[2] ? Number(m[2]) : undefined } : {};
}

/** Does `q` (lower-case search terms, `file:`/`path:` aware) match an attachment path? */
export function attachmentMatches(path: string, groups: { field: string; value: string; neg: boolean }[][]): boolean {
  const p = path.toLowerCase();
  const name = p.split('/').pop() ?? p;
  return groups.some((g) => {
    if (!g.length || g.some((t) => !['any', 'file', 'path'].includes(t.field))) return false;
    if (!g.some((t) => !t.neg)) return false;
    return g.every((t) => {
      const hit = t.field === 'file' ? name.includes(t.value) : p.includes(t.value);
      return t.neg ? !hit : hit;
    });
  });
}
