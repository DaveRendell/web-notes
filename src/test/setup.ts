import 'fake-indexeddb/auto';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: () => undefined,
});

installMemoryStorage('localStorage');
installMemoryStorage('sessionStorage');

function installMemoryStorage(name: 'localStorage' | 'sessionStorage') {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };

  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
}
