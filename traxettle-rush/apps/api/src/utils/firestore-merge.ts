/**
 * Firestore's write semantics, shared by the in-memory stand-ins (local mock
 * mode and tests). They must match the real SDK: a stand-in that merges more
 * loosely hides bugs that only appear against a real database.
 *
 * - `set(data, { merge: true })` writes only the leaf fields in `data`. Nested
 *   maps are merged key by key, so keys missing from `data` survive. An empty
 *   map is the exception: it replaces the field (DocumentMask.fromObject in
 *   @google-cloud/firestore).
 * - `update(data)` reads each top-level key as a field path ("a.b" reaches into
 *   maps) and replaces that field outright, nested maps included.
 *
 * Both expect JSON-cloned input; `undefined` values are skipped, matching
 * `ignoreUndefinedProperties`.
 */

type DocData = Record<string, unknown>;
type LeafWrite = [path: string[], value: unknown];

function isPlainObject(value: unknown): value is DocData {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function setAtPath(target: DocData, path: string[], value: unknown): void {
  let node = target;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key] as DocData;
  }
  node[path[path.length - 1]] = value;
}

function leafWrites(data: DocData, prefix: string[] = []): LeafWrite[] {
  const keys = Object.keys(data);
  if (keys.length === 0 && prefix.length > 0) return [[prefix, {}]];
  return keys.flatMap((key): LeafWrite[] => {
    const value = data[key];
    if (value === undefined) return [];
    const path = [...prefix, key];
    return isPlainObject(value) ? leafWrites(value, path) : [[path, value]];
  });
}

export function applySetMerge(existing: DocData, data: DocData): DocData {
  const next = clone(existing);
  for (const [path, value] of leafWrites(data)) setAtPath(next, path, value);
  return next;
}

export function applyUpdate(existing: DocData, data: DocData): DocData {
  const next = clone(existing);
  for (const [field, value] of Object.entries(data)) {
    if (value !== undefined) setAtPath(next, field.split('.'), value);
  }
  return next;
}
