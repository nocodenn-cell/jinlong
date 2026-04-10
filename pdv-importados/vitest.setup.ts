/**
 * Vitest roda em `environment: 'node'`, onde `localStorage` não existe.
 * O middleware `persist` do Zustand usa `localStorage` por padrão e emite stderr
 * se o storage estiver indisponível; este polyfill elimina o ruído nos testes.
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

// `persist` usa `window.localStorage` por padrão; em Node não há `window`.
if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true,
  })
}
