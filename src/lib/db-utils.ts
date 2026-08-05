export function ensureArray<T>(val: T[] | null | undefined): T[] {
  if (Array.isArray(val)) return val;
  return [];
}
