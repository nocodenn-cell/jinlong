import { beforeEach, describe, expect, it } from 'vitest'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import { DEFAULT_PRICING_CONTEXT } from '@/core/pricing/types'

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

function resetCarrinhoStore() {
  useCarrinhoStore.setState({
    itens: [],
    regras: [],
    pricingCtx: DEFAULT_PRICING_CONTEXT,
    cartOwnerUserId: null,
    totalBruto: 0,
    totalDesconto: 0,
    totalLiquido: 0,
    totalItens: 0,
    totalUnidades: 0,
  })
}

describe('useCarrinhoStore behavior', () => {
  beforeEach(() => {
    resetCarrinhoStore()
  })

  it('incrementa quantidade quando adiciona produto repetido', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-2',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(1)
    expect(state.itens[0]?.quantidade).toBe(2)
    expect(state.totalUnidades).toBe(2)
    expect(state.totalLiquido).toBe(20)
  })

  it('remove item quando quantidade vira zero', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })

    useCarrinhoStore.getState().alterarQuantidade('linha-1', 0)

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.totalLiquido).toBe(0)
    expect(state.totalDesconto).toBe(0)
  })

  it('desconto manual não permite preço negativo', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })

    useCarrinhoStore.getState().aplicarDescontoManual('linha-1', 50, 'teste')

    const state = useCarrinhoStore.getState()
    expect(state.itens[0]?.resultado.precoUnitario).toBe(0)
    expect(state.itens[0]?.resultado.tipoPreco).toBe('MANUAL')
    expect(state.totalLiquido).toBe(0)
  })

  it('setCartOwnerForSession atribui dono quando carrinho vazio', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('user-a')
    expect(useCarrinhoStore.getState().cartOwnerUserId).toBe('user-a')
  })

  it('setCartOwnerForSession reivindica legado (itens sem dono) sem apagar', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCarrinhoStore.setState({ cartOwnerUserId: null })
    useCarrinhoStore.getState().setCartOwnerForSession('user-b')
    const state = useCarrinhoStore.getState()
    expect(state.cartOwnerUserId).toBe('user-b')
    expect(state.itens).toHaveLength(1)
  })

  it('setCartOwnerForSession limpa quando dono persistido difere do novo utilizador', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCarrinhoStore.setState({ cartOwnerUserId: 'user-a' })
    useCarrinhoStore.getState().setCartOwnerForSession('user-b')
    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.cartOwnerUserId).toBe('user-b')
    expect(state.totalLiquido).toBe(0)
  })

  it('setCartOwnerForSession(null) zera carrinho e dono', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCarrinhoStore.setState({ cartOwnerUserId: 'user-a' })
    useCarrinhoStore.getState().setCartOwnerForSession(null)
    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.cartOwnerUserId).toBeNull()
  })

  it('limparCarrinho remove dono', () => {
    useCarrinhoStore.setState({ cartOwnerUserId: 'user-a' })
    useCarrinhoStore.getState().limparCarrinho()
    expect(useCarrinhoStore.getState().cartOwnerUserId).toBeNull()
  })
})

