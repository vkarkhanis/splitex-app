/**
 * A small, resettable in-memory Firestore for tests that exercise real query
 * paths across several collections. Modelled on the mock in config/firebase.ts
 * but isolated per test file and independent of environment variables.
 *
 * Usage:
 *   const store = createMemoryFirestore();
 *   jest.mock('../../config/firebase', () => ({ db: store.db, auth: {}, storage: {} }));
 *   beforeEach(() => store.reset());
 */

type Filter = { field: string; op: string; value: any };

export interface MemoryFirestore {
  db: any;
  reset(): void;
  seed(collectionPath: string, id: string, data: Record<string, any>): void;
  get(collectionPath: string, id: string): Record<string, any> | null;
  all(collectionPath: string): Array<Record<string, any> & { id: string }>;
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const normalize = (p: string) => p.replace(/^\/+|\/+$/g, '');

export function createMemoryFirestore(): MemoryFirestore {
  const docs = new Map<string, Record<string, any>>();
  let counter = 0;

  const isDirectChild = (docPath: string, collectionPath: string) => {
    if (!docPath.startsWith(`${collectionPath}/`)) return false;
    const rest = docPath.slice(collectionPath.length + 1);
    return rest.length > 0 && !rest.includes('/');
  };

  const matches = (data: any, f: Filter) => {
    const left = data?.[f.field];
    switch (f.op) {
      case '==': return left === f.value;
      case '!=': return left !== f.value;
      case '<': return left < f.value;
      case '<=': return left <= f.value;
      case '>': return left > f.value;
      case '>=': return left >= f.value;
      case 'in': return Array.isArray(f.value) && f.value.includes(left);
      case 'not-in': return Array.isArray(f.value) && !f.value.includes(left);
      case 'array-contains': return Array.isArray(left) && left.includes(f.value);
      case 'array-contains-any': return Array.isArray(left) && Array.isArray(f.value) && f.value.some((v: any) => left.includes(v));
      default: throw new Error(`memoryFirestore: unsupported operator ${f.op}`);
    }
  };

  const snapshot = (path: string): any => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : clone(data)),
      ref: docRef(path),
    };
  };

  const docRef = (rawPath: string): any => {
    const path = normalize(rawPath);
    return {
      id: path.split('/').pop(),
      path,
      get: async () => snapshot(path),
      set: async (data: any, options?: { merge?: boolean }) => {
        const prev = docs.get(path);
        docs.set(path, options?.merge && prev ? { ...prev, ...clone(data) } : clone(data || {}));
      },
      update: async (data: any) => {
        const prev = docs.get(path);
        if (!prev) throw new Error(`No document to update: ${path}`);
        docs.set(path, { ...prev, ...clone(data) });
      },
      delete: async () => {
        docs.delete(path);
        for (const key of [...docs.keys()]) if (key.startsWith(`${path}/`)) docs.delete(key);
      },
      collection: (sub: string) => collectionRef(`${path}/${sub}`),
    };
  };

  const query = (collectionPath: string, filters: Filter[] = [], limitTo: number | null = null): any => ({
    where: (field: string, op: string, value: any) => query(collectionPath, [...filters, { field, op, value }], limitTo),
    orderBy: () => query(collectionPath, filters, limitTo),
    limit: (n: number) => query(collectionPath, filters, n),
    get: async () => {
      let results = [...docs.keys()]
        .filter((p) => isDirectChild(p, collectionPath))
        .sort()
        .map(snapshot)
        .filter((s) => filters.every((f) => matches(s.data(), f)));
      if (limitTo !== null) results = results.slice(0, limitTo);
      return { docs: results, empty: results.length === 0, size: results.length };
    },
  });

  const collectionRef = (rawPath: string): any => {
    const path = normalize(rawPath);
    return {
      ...query(path),
      doc: (id?: string) => docRef(`${path}/${id || `auto-${++counter}`}`),
      add: async (data: any) => {
        const ref = docRef(`${path}/auto-${++counter}`);
        await ref.set(data);
        return ref;
      },
    };
  };

  const db = {
    collection: (path: string) => collectionRef(path),
    batch: () => {
      const ops: Array<() => Promise<any>> = [];
      const api = {
        set: (ref: any, data: any, options?: any) => { ops.push(() => ref.set(data, options)); return api; },
        update: (ref: any, data: any) => { ops.push(() => ref.update(data)); return api; },
        delete: (ref: any) => { ops.push(() => ref.delete()); return api; },
        commit: async () => { for (const op of ops) await op(); return []; },
      };
      return api;
    },
    runTransaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        get: (ref: any) => ref.get(),
        set: (ref: any, data: any, options?: any) => ref.set(data, options),
        update: (ref: any, data: any) => ref.update(data),
        delete: (ref: any) => ref.delete(),
      }),
  };

  return {
    db,
    reset: () => { docs.clear(); counter = 0; },
    seed: (collectionPath, id, data) => { docs.set(`${normalize(collectionPath)}/${id}`, clone(data)); },
    get: (collectionPath, id) => {
      const d = docs.get(`${normalize(collectionPath)}/${id}`);
      return d === undefined ? null : clone(d);
    },
    all: (collectionPath) =>
      [...docs.entries()]
        .filter(([p]) => isDirectChild(p, normalize(collectionPath)))
        .map(([p, d]) => ({ id: p.split('/').pop()!, ...clone(d) })),
  };
}
