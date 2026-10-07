/** Dependency-free Firestore value sanitising (shared by client and admin code). */
// Firestore rejects `undefined`; convert it to `null` recursively. Mirrors the
// original web implementation exactly (objects recurse, arrays map, Dates pass).
export const sanitizeForFirestore = <T extends object>(obj: T): T => {
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      sanitized[key] = null;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeForFirestore(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : (item === undefined ? null : item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
};
