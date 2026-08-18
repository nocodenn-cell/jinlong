/**
 * Vitest em ambiente `node` não expõe `localStorage`; o `persist` do Zustand depende dele.
 * Polyfill em memória + alias `window` → `globalThis` para testes sem ruído no stderr.
 */
const memory = new Map<string, string>()

function readMemoryItem(key: string): string | null {
  const value = memory.get(key)
  return value === undefined ? null : value
}

const localStoragePolyfill: Storage = {
  get length() {
    return memory.size
  },
  clear() {
    memory.clear()
  },
  getItem(key: string) {
    return readMemoryItem(key)
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

/**
 * jsdom não implementa `Element.prototype.scrollIntoView` (é layout, e jsdom não
 * faz layout). Componentes que rolam até o campo com erro — como
 * `ProdutoFormModal` ao focar o primeiro campo inválido — lançam
 * `el.scrollIntoView is not a function` DENTRO de um efeito do React, o que o
 * Vitest reporta como "unhandled error" e derruba um teste qualquer da mesma
 * thread. Era a causa da falha intermitente de
 * `catalogoNovoProdutoEntradas.behavior.test.tsx`, que passava isolada e falhava
 * na suíte completa (a origem do erro nem sempre é o arquivo acusado).
 *
 * No-op é o comportamento correto aqui: rolagem não tem efeito observável em
 * jsdom, e o que os testes verificam é o foco, que continua real.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewPolyfill() {
    /* sem layout em jsdom — nada a rolar */
  }
}
