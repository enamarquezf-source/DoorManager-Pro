type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type BrowserStorage = { localStorage: TokenStorage; sessionStorage: TokenStorage };

export function createAuthStorage(demo: boolean, key: string, browser: BrowserStorage | undefined = typeof window === 'undefined' ? undefined : window): TokenStorage {
  if (!demo) {
    // Retire the old persistent login only. Downloaded work and queues are kept.
    try { browser?.localStorage.removeItem(key); } catch { /* Storage can be disabled. */ }
  }
  try {
    const storage = demo ? browser?.localStorage : browser?.sessionStorage;
    if (storage) return storage;
  } catch { /* Never fall back to persistent login for Pro. */ }
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
