/**
 * Collision-resistant local id. Date.now() alone collides on two creates within
 * the same millisecond (INSERT OR REPLACE would silently overwrite the first).
 * Timestamp prefix keeps ids roughly sortable; random suffix removes collisions.
 */
export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
