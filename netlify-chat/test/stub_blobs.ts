// In-memory stand-in for @netlify/blobs: one shared Map per store name.
const stores = new Map<string, Map<string, string>>();
export function getStore(name: string) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name)!;
  return {
    get: (k: string) => Promise.resolve(m.get(k) ?? null),
    set: (k: string, v: string) => {
      m.set(k, v);
      return Promise.resolve();
    },
  };
}
