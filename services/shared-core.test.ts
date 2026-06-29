/**
 * Shared-core integration tests.
 *
 * Unlike sync.test.ts (which duplicates the logic for isolation), these import
 * the REAL @clearmind/shared modules that both web and mobile consume, proving
 * the Phase 1 extraction preserved behavior. Resolved via the Vite alias in
 * vite.config.ts (which Vitest reuses).
 */
/// <reference types="vitest/globals" />

import {
  STORES,
  STORE_TO_FIRESTORE,
  getFirestoreCollectionName,
  getLocalStoreName,
  getAllFirestoreCollections,
  getSyncableStores,
} from '@clearmind/shared/data/collections';
import { mergeItems, getItemTimestamp, type SyncableItem } from '@clearmind/shared/sync/merge';

describe('shared/data/collections (real module)', () => {
  it('maps every store except profile to a Firestore collection', () => {
    const storeValues = Object.values(STORES).filter(s => s !== 'profile');
    for (const store of storeValues) {
      expect(typeof STORE_TO_FIRESTORE[store]).toBe('string');
    }
    expect(STORE_TO_FIRESTORE['profile']).toBeUndefined();
  });

  it('preserves the deliberate collection renames', () => {
    expect(getFirestoreCollectionName(STORES.LOGS)).toBe('dailyLogs');
    expect(getFirestoreCollectionName(STORES.DAILY_MAPPER)).toBe('timeblocks');
    expect(getFirestoreCollectionName(STORES.DAILY_MAPPER_TEMPLATES)).toBe('timeblocktemplates');
    expect(getFirestoreCollectionName(STORES.LEARNING_RESOURCES)).toBe('learningResources');
    expect(getFirestoreCollectionName(STORES.LEARNING_FOLDERS)).toBe('learningFolders');
  });

  it('round-trips local <-> firestore names', () => {
    for (const localStore of getSyncableStores()) {
      expect(getLocalStoreName(getFirestoreCollectionName(localStore))).toBe(localStore);
    }
  });

  it('exposes 16 syncable stores / collections, all unique', () => {
    expect(getSyncableStores().length).toBe(16);
    const fs = getAllFirestoreCollections();
    expect(new Set(fs).size).toBe(fs.length);
  });
});

describe('shared/sync/merge (real module)', () => {
  const item = (id: string, updatedAt: string, deleted = false): SyncableItem => ({ id, updatedAt, deleted });

  it('pushes local-only to cloud and pulls cloud-only to local', () => {
    const r = mergeItems([item('a', '2026-01-09T10:00:00Z')], [item('b', '2026-01-09T10:00:00Z')]);
    expect(r.merged.length).toBe(2);
    expect(r.toUpdateCloud.map(i => i.id)).toEqual(['a']);
    expect(r.toUpdateLocal.map(i => i.id)).toEqual(['b']);
  });

  it('resolves conflicts last-write-wins, cloud wins ties', () => {
    expect(mergeItems([item('x', '2026-01-09T12:00:00Z')], [item('x', '2026-01-09T10:00:00Z')]).toUpdateCloud.length).toBe(1);
    expect(mergeItems([item('x', '2026-01-09T10:00:00Z')], [item('x', '2026-01-09T12:00:00Z')]).toUpdateLocal.length).toBe(1);
    const tie = mergeItems([{ ...item('x', '2026-01-09T10:00:00Z'), s: 'local' }] as any, [{ ...item('x', '2026-01-09T10:00:00Z'), s: 'cloud' }] as any);
    expect((tie.merged[0] as any).s).toBe('cloud');
    expect(tie.toUpdateLocal.length + tie.toUpdateCloud.length).toBe(0);
  });

  it('propagates a newer local soft-delete to the cloud', () => {
    const r = mergeItems([item('x', '2026-01-09T12:00:00Z', true)], [item('x', '2026-01-09T10:00:00Z', false)]);
    expect(r.merged[0].deleted).toBe(true);
    expect(r.toUpdateCloud.length).toBe(1);
  });

  it('prioritizes updatedAt > lastEdited > syncedAt', () => {
    expect(getItemTimestamp({ id: '1', updatedAt: '2026-01-09T10:00:00Z', lastEdited: '2026-01-09T11:00:00Z' }))
      .toBe(new Date('2026-01-09T10:00:00Z').getTime());
    expect(getItemTimestamp({ id: '1', lastEdited: '2026-01-09T11:00:00Z', syncedAt: '2026-01-09T12:00:00Z' }))
      .toBe(new Date('2026-01-09T11:00:00Z').getTime());
    expect(getItemTimestamp({ id: '1' })).toBe(new Date('1970-01-01T00:00:00.000Z').getTime());
  });
});
