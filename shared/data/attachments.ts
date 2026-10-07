/**
 * Vault attachments stored in Firestore (works on the free plan — no Cloud
 * Storage bucket needed). Bytes are split into base64 chunks of ≤ 700 KB raw
 * (~933 KB encoded, under Firestore's 1 MiB doc limit):
 *
 *   users/{uid}/attachments/{id}             — Attachment metadata (written LAST,
 *                                              so a half-finished upload is invisible)
 *   users/{uid}/attachmentChunks/{id}_{i}    — { data: base64, i }
 *
 * The API is storage-agnostic (put / get bytes / delete / subscribe), so it can
 * move to Cloud Storage later without touching the UI.
 */
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import type { Attachment } from '../types';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_CHUNK_BYTES = 700 * 1024;

const metaCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'attachments');
const chunkDoc = (db: Firestore, uid: string, id: string, i: number) => doc(db, 'users', uid, 'attachmentChunks', `${id}_${i}`);

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class AttachmentError extends Error {}

/** Upload bytes + metadata. Chunks first, metadata last (atomic visibility). */
export async function putAttachment(db: Firestore, uid: string, meta: Omit<Attachment, 'chunks' | 'size'>, bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<Attachment> {
  if (bytes.length > ATTACHMENT_MAX_BYTES) throw new AttachmentError(`Files up to ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB are supported`);
  const chunks = Math.max(1, Math.ceil(bytes.length / ATTACHMENT_CHUNK_BYTES));
  for (let i = 0; i < chunks; i++) {
    await setDoc(chunkDoc(db, uid, meta.id, i), { i, data: bytesToBase64(bytes.subarray(i * ATTACHMENT_CHUNK_BYTES, (i + 1) * ATTACHMENT_CHUNK_BYTES)) });
    onProgress?.(i + 1, chunks);
  }
  const full: Attachment = { ...meta, size: bytes.length, chunks };
  await setDoc(doc(metaCol(db, uid), meta.id), full);
  return full;
}

export async function getAttachmentBytes(db: Firestore, uid: string, a: Pick<Attachment, 'id' | 'chunks' | 'size'>): Promise<Uint8Array> {
  const parts = await Promise.all(Array.from({ length: a.chunks }, (_, i) => getDoc(chunkDoc(db, uid, a.id, i))));
  const out = new Uint8Array(a.size);
  let off = 0;
  for (const p of parts) {
    if (!p.exists()) throw new AttachmentError('Attachment data is missing');
    const b = base64ToBytes(String(p.data().data));
    out.set(b.subarray(0, Math.min(b.length, out.length - off)), off);
    off += b.length;
  }
  return out;
}

/** Rename/move (metadata only — bytes are keyed by id). */
export async function updateAttachment(db: Firestore, uid: string, id: string, patch: Partial<Pick<Attachment, 'name' | 'folder' | 'width' | 'height'>>): Promise<void> {
  await updateDoc(doc(metaCol(db, uid), id), { ...patch, updatedAt: new Date().toISOString() });
}

/** Soft delete (tombstone, so other devices drop it) + remove the bytes. */
export async function deleteAttachment(db: Firestore, uid: string, a: Pick<Attachment, 'id' | 'chunks'>): Promise<void> {
  await updateDoc(doc(metaCol(db, uid), a.id), { deleted: true, updatedAt: new Date().toISOString() });
  const b = writeBatch(db);
  for (let i = 0; i < a.chunks; i++) b.delete(chunkDoc(db, uid, a.id, i));
  await b.commit();
}

/** Undo a soft delete when the bytes are still available locally: re-upload. */
export async function restoreAttachment(db: Firestore, uid: string, a: Attachment, bytes: Uint8Array): Promise<Attachment> {
  return putAttachment(db, uid, { ...a, deleted: false, updatedAt: new Date().toISOString() } as Attachment, bytes);
}

/** Realtime metadata (including tombstones, so clients can evict caches). */
export function subscribeAttachments(db: Firestore, uid: string, cb: (all: Attachment[]) => void, onError?: (e: unknown) => void): () => void {
  return onSnapshot(metaCol(db, uid), (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Attachment), id: d.id }))), onError);
}
