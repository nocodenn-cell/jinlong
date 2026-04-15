/**
 * Vitest em ambiente `node` não expõe `localStorage`; o `persist` do Zustand depende dele.
 * Polyfill em memória + alias `window` → `globalThis` para testes sem ruído no stderr.
 */
const memory = new Map<string, string>()

const localStoragePolyfill: Storage = {
  get length() {
    return memory.size
  },
  clear() {
    memory.clear()
  },
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null
  },
  key(index: number) {
    const keys = Array.from(memory.keys())
    return index >= 0 && index < keys.length ? keys[index] : null
  },
  removeItem(key: string) {
    memory.delete(key)
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStoragePolyfill,
  writable: true,
  configurable: true,
})

if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true,
  })
}
