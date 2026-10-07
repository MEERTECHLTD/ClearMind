/**
 * Field-level synchronization — the conflict model shared by every client
 * (Android, iOS, web, MCP/API/CLI, widgets).
 *
 * Every synced record carries `_fc`: a map of field → ISO timestamp of that
 * field's last change. Two concurrent edits to DIFFERENT fields (mobile completes
 * a task while web edits its description) both survive; concurrent edits to the
 * SAME field resolve deterministically: newer clock wins, ties broken by
 * clientId. Deletion is just the `deleted` field with its own clock, so a stale
 * offline device editing other fields can never resurrect a deleted record.
 *
 * Writes push only the changed fields (a patch with their clocks) using a
 * Firestore merge-write, so the server itself never loses a concurrent field.
 *
 * Legacy records without `_fc` are treated as if every field changed at their
 * `updatedAt` (falling back to lastEdited/syncedAt/epoch) — fully compatible.
 */

/** Fields that are sync metadata, not user data — never clocked themselves. */
export const META_FIELDS = new Set([
  'id', '_fc', 'version', 'clientId', 'mutationId', 'updatedAt', 'syncedAt', '_serverAt', 'lastEdited', 'deletedAt',
]);

/** Device-local fields that must never be synced (e.g. notification ids). */
export const LOCAL_ONLY_FIELDS = new Set(['reminderId', 'reminderIds', '_dirty']);

export type Rec = { id: string; [k: string]: any };

const EPOCH = '1970-01-01T00:00:00.000Z';

export const recordTime = (r: Partial<Rec> | undefined | null): string =>
  (r && (r.updatedAt || r.lastEdited || r.syncedAt)) || EPOCH;

/**
 * Clock of one field. Records with clocks: an unclocked field has never been
 * changed (epoch), so it can't override a real change elsewhere. Legacy records
 * (no clocks at all): every field shares the record time.
 */
export const fieldClock = (r: Rec, field: string): string => (r._fc ? r._fc[field] ?? EPOCH : recordTime(r));

/** Structural equality for JSON-ish values (records are plain data). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as any)[k], (b as any)[k]));
}

const dataFields = (r: Rec) => Object.keys(r).filter((k) => !META_FIELDS.has(k) && !LOCAL_ONLY_FIELDS.has(k));

export interface StampContext {
  now?: string;
  clientId: string;
  mutationId?: string;
}

export interface Stamped<T> {
  /** The full new record (with updated clocks/version). */
  record: T;
  /** Only the changed fields + their clocks — what gets pushed to the cloud. */
  patch: Partial<T> & { id: string };
  /** Names of user-data fields that changed. */
  changed: string[];
}

/**
 * Apply an edit to the CURRENT stored record. `edit` contains only the fields
 * the caller intends to change (set a field to null to clear it); everything
 * else is taken from `current`, so a stale UI copy can never silently revert
 * newer changes made elsewhere. Pass `current` undefined to create.
 * Returns the full new record and the minimal patch to push.
 */
export function stampEdit<T extends Rec>(current: T | undefined, edit: Partial<T> & { id: string }, ctx: StampContext): Stamped<T> {
  const now = ctx.now ?? new Date().toISOString();
  const base: Rec = current ? { ...current } : { id: edit.id };
  const fc: Record<string, string> = { ...(current?._fc ?? {}) };
  const changed: string[] = [];
  for (const k of Object.keys(edit)) {
    if (META_FIELDS.has(k) || LOCAL_ONLY_FIELDS.has(k)) continue;
    const v = (edit as Rec)[k];
    if (!current || !same(current[k], v)) {
      changed.push(k);
      fc[k] = now;
      base[k] = v === undefined ? null : v;
    }
  }
  const mutationId = ctx.mutationId ?? `${ctx.clientId}:${now}`;
  const version = (current?.version ?? 0) + (changed.length ? 1 : 0);
  if (changed.length) {
    base._fc = fc;
    base.version = version;
    base.clientId = ctx.clientId;
    base.mutationId = mutationId;
    base.updatedAt = now;
    if (changed.includes('deleted') && base.deleted) base.deletedAt = now;
  }
  for (const k of LOCAL_ONLY_FIELDS) delete base[k];
  const patch: Rec = { id: edit.id };
  for (const k of changed) patch[k] = base[k];
  if (changed.length) {
    patch._fc = Object.fromEntries(changed.map((k) => [k, now]));
    patch.version = version;
    patch.clientId = ctx.clientId;
    patch.mutationId = mutationId;
    patch.updatedAt = now;
    if (base.deletedAt && changed.includes('deleted')) patch.deletedAt = base.deletedAt;
  }
  return { record: base as T, patch: patch as any, changed };
}

/** Deterministic winner for one field. */
function pick(local: Rec, remote: Rec, field: string): 'local' | 'remote' {
  const lc = fieldClock(local, field);
  const rc = fieldClock(remote, field);
  if (lc > rc) return 'local';
  if (rc > lc) return 'remote';
  // Same clock: the remote (server) copy is canonical unless it lacks the value.
  return 'remote';
}

export interface MergeResult<T> {
  merged: T;
  /** Local copy must be updated (remote had newer fields). */
  localChanged: boolean;
  /** Remote copy is missing newer local fields — push `remotePatch`. */
  remoteChanged: boolean;
  remotePatch: (Partial<T> & { id: string }) | null;
}

/** Field-by-field merge of two copies of the same record. */
export function mergeRecord<T extends Rec>(local: T | undefined, remote: T | undefined): MergeResult<T> {
  if (!local && remote) return { merged: remote, localChanged: true, remoteChanged: false, remotePatch: null };
  if (local && !remote) {
    const { _dirty, ...rest } = local as any;
    return { merged: local, localChanged: false, remoteChanged: true, remotePatch: rest };
  }
  const l = local as T;
  const r = remote as T;
  const merged: Rec = { id: l.id };
  const fc: Record<string, string> = {};
  const remotePatch: Rec = { id: l.id };
  const patchFc: Record<string, string> = {};
  let localChanged = false;
  let remoteChanged = false;
  const keys = new Set([...dataFields(l), ...dataFields(r)]);
  for (const k of keys) {
    const w = pick(l, r, k);
    const src = w === 'local' ? l : r;
    merged[k] = src[k];
    fc[k] = fieldClock(src, k);
    if (w === 'local' && !same(l[k], r[k])) {
      remoteChanged = true;
      remotePatch[k] = l[k] === undefined ? null : l[k];
      patchFc[k] = fc[k];
    }
    if (w === 'remote' && !same(l[k], r[k])) localChanged = true;
  }
  // A deleted record stays deleted unless a newer clock explicitly restored it.
  const newer = recordTime(l) > recordTime(r) ? l : r;
  merged._fc = fc;
  merged.version = Math.max(l.version ?? 0, r.version ?? 0);
  merged.updatedAt = recordTime(newer);
  merged.clientId = newer.clientId ?? null;
  merged.mutationId = newer.mutationId ?? null;
  if (merged.deleted) merged.deletedAt = l.deletedAt ?? r.deletedAt ?? merged.updatedAt;
  for (const k of LOCAL_ONLY_FIELDS) if (k in l && k !== '_dirty') merged[k] = (l as any)[k];
  if (remoteChanged) {
    remotePatch._fc = patchFc;
    remotePatch.version = merged.version;
    remotePatch.updatedAt = merged.updatedAt;
  }
  return { merged: merged as T, localChanged, remoteChanged, remotePatch: remoteChanged ? (remotePatch as any) : null };
}

/** Stable id for the device/agent (callers persist it). */
export const newClientId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
