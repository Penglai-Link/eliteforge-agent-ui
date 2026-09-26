export function ensureTestLocalStorage() {
  if (typeof window === "undefined") return;

  try {
    if (window.localStorage) return;
  } catch {
    // jsdom exposes localStorage only for non-opaque origins.
  }

  const items = new Map<string, string>();
  const storage: Storage = {
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    get length() {
      return items.size;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
