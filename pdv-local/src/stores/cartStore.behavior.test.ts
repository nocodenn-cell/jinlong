import { beforeEach, describe, expect, it } from 'vitest'
import { defaultPdvConfig } from '../config/pdvConfig'
import { useCartStore } from './cartStore'

const memoryStorage = (() => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => {
      data.clear()
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  }
})()

if (!('localStorage' in globalThis)) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  })
}

function resetCartStore() {
  useCartStore.setState({
    itens: [],
    regras: [],
    totalBruto: 0,
    totalDesconto: 0,
    totalLiquido: 0,
    totalItens: 0,
    totalUnidades: 0,
    descontoGerentePercentual: 0,
    descontoGerenteValor: 0,
    descontoGerenteToken: null,
    maxDescontoGerentePercentual: defaultPdvConfig.maxDescontoGerentePercentual,
  })
}

describe('useCartStore behavior', () => {
  beforeEach(() => {
    resetCartStore()
  })

  it('agrega quantidade ao adicionar o mesmo produto', () => {
    const store = useCartStore.getState()

    store.adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCartStore.getState().adicionarItem({
      id: 'linha-2',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 2,
      precoVariejo: 10,
    })

    const state = useCartStore.getState()
    expect(state.itens).toHaveLength(1)
    expect(state.itens[0]?.quantidade).toBe(3)
    expect(state.totalItens).toBe(1)
    expect(state.totalUnidades).toBe(3)
    expect(state.totalLiquido).toBe(30)
  })

  it('remove item ao alterar quantidade para zero', () => {
    useCartStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })

    useCartStore.getState().alterarQuantidade('linha-1', 0)

    const state = useCartStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.totalBruto).toBe(0)
    expect(state.totalLiquido).toBe(0)
    expect(state.totalUnidades).toBe(0)
  })

  it('limita desconto de gerente ao máximo configurado', () => {
    useCartStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 2,
      precoVariejo: 50,
    })

    useCartStore.getState().setMaxDescontoGerentePercentual(5)
    useCartStore.getState().aplicarDescontoGerente(20)

    const state = useCartStore.getState()
    expect(state.descontoGerentePercentual).toBe(5)
    expect(state.descontoGerenteValor).toBe(5)
    expect(state.totalLiquido).toBe(95)
  })
})

