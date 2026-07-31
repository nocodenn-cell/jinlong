import { beforeEach, describe, expect, it } from 'vitest'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import { DEFAULT_PRICING_CONTEXT } from '@shared/pricing/types'

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
    ultimoRemovido: null,
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
      precoUnitario: 10,
      precoOriginal: 10,
    })
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-2',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 10,
      precoOriginal: 10,
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
      precoUnitario: 10,
      precoOriginal: 10,
    })

    useCarrinhoStore.getState().alterarQuantidade('linha-1', 0)

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.totalLiquido).toBe(0)
    expect(state.totalDesconto).toBe(0)
  })

  it('desconto manual não permite preço negativo (ATACADO, isento do limite de 15%)', () => {
    // VAREJO com desconto > 15% agora exige gerente (MVF #1, ver testes abaixo);
    // o piso de preço é exercitado aqui via ATACADO, que é isento do limite.
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 10,
      precoOriginal: 10,
      resultado: {
        precoUnitario: 10,
        precoOriginal: 10,
        descontoUnitario: 0,
        tipoPreco: 'ATACADO',
      },
    })

    useCarrinhoStore.getState().aplicarDescontoManual('linha-1', 50, 'teste')

    const state = useCarrinhoStore.getState()
    expect(state.itens[0]?.resultado?.precoUnitario).toBe(0)
    expect(state.itens[0]?.resultado?.tipoPreco).toBe('MANUAL')
    expect(state.totalLiquido).toBe(0)
  })

  it('sincronizarPrecoCalculadoRpc aplica atacado mantendo referência de varejo', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 6,
      precoUnitario: 100,
      precoOriginal: 100,
      metaPdv: { precoVarejoReferencia: 100 },
    })
    useCarrinhoStore.getState().sincronizarPrecoCalculadoRpc('linha-1', {
      precoUnitario: 80,
      tipoPreco: 'ATACADO',
    })
    const it = useCarrinhoStore.getState().itens[0]
    expect(it?.resultado?.tipoPreco).toBe('ATACADO')
    expect(it?.resultado?.precoOriginal).toBe(100)
    expect(it?.resultado?.precoUnitario).toBe(80)
    expect(it?.resultado?.descontoUnitario).toBe(20)
    expect(useCarrinhoStore.getState().totalDesconto).toBe(120)
  })

  it('sincronizarPrecoCalculadoRpc ignora linha MANUAL', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 2,
      precoUnitario: 8,
      precoOriginal: 10,
      resultado: {
        precoUnitario: 8,
        precoOriginal: 10,
        descontoUnitario: 2,
        tipoPreco: 'MANUAL',
      },
    })
    useCarrinhoStore.getState().sincronizarPrecoCalculadoRpc('linha-1', {
      precoUnitario: 5,
      tipoPreco: 'ATACADO',
    })
    const it = useCarrinhoStore.getState().itens[0]
    expect(it?.resultado?.tipoPreco).toBe('MANUAL')
    expect(it?.resultado?.precoUnitario).toBe(8)
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
      precoUnitario: 10,
      precoOriginal: 10,
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
      precoUnitario: 10,
      precoOriginal: 10,
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
      precoUnitario: 10,
      precoOriginal: 10,
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

  it('#13 restaurarUltimoRemovido repõe a linha na posição original', () => {
    const add = (id: string, produtoId: string) =>
      useCarrinhoStore.getState().adicionarItem({
        id,
        produtoId,
        nome: produtoId,
        quantidade: 1,
        precoUnitario: 10,
        precoOriginal: 10,
      })
    add('linha-1', 'p-1')
    add('linha-2', 'p-2')
    add('linha-3', 'p-3')

    useCarrinhoStore.getState().removerItem('linha-2')
    let state = useCarrinhoStore.getState()
    expect(state.itens.map((i) => i.id)).toEqual(['linha-1', 'linha-3'])
    expect(state.ultimoRemovido?.index).toBe(1)
    expect(state.totalLiquido).toBe(20)

    useCarrinhoStore.getState().restaurarUltimoRemovido()
    state = useCarrinhoStore.getState()
    expect(state.itens.map((i) => i.id)).toEqual(['linha-1', 'linha-2', 'linha-3'])
    expect(state.ultimoRemovido).toBeNull()
    expect(state.totalLiquido).toBe(30)
  })

  it('#13 restaurarUltimoRemovido é no-op sem buffer e não duplica linha já reposta', () => {
    // sem buffer
    useCarrinhoStore.getState().restaurarUltimoRemovido()
    expect(useCarrinhoStore.getState().itens).toHaveLength(0)

    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 10,
      precoOriginal: 10,
    })
    useCarrinhoStore.getState().removerItem('linha-1')
    // re-bipa o mesmo produto antes de desfazer
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 10,
      precoOriginal: 10,
    })
    useCarrinhoStore.getState().restaurarUltimoRemovido()
    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(1)
    expect(state.itens[0]?.quantidade).toBe(1)
    expect(state.ultimoRemovido).toBeNull()
  })

  // MVF #1: Validação de limite de desconto
  it('desconto manual acima do limite em VAREJO rejeita', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 100,
      precoOriginal: 100,
      resultado: {
        precoUnitario: 100,
        precoOriginal: 100,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO',
      },
    })

    // 25% discount (limit is 15%) should throw
    expect(() => {
      useCarrinhoStore.getState().aplicarDescontoManual('linha-1', 25)
    }).toThrow(/acima do limite permitido/)

    // Venda não foi modificada
    const state = useCarrinhoStore.getState()
    expect(state.itens[0]?.resultado?.precoUnitario).toBe(100)
    expect(state.itens[0]?.resultado?.tipoPreco).toBe('VAREJO')
  })

  it('desconto manual até o limite em VAREJO aceita', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 1,
      precoUnitario: 100,
      precoOriginal: 100,
      resultado: {
        precoUnitario: 100,
        precoOriginal: 100,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO',
      },
    })

    // 15% discount (at limit) should succeed
    useCarrinhoStore.getState().aplicarDescontoManual('linha-1', 15)

    const state = useCarrinhoStore.getState()
    expect(state.itens[0]?.resultado?.precoUnitario).toBe(85)
    expect(state.itens[0]?.resultado?.tipoPreco).toBe('MANUAL')
  })

  it('desconto manual acima do limite em ATACADO aceita', () => {
    useCarrinhoStore.getState().adicionarItem({
      id: 'linha-1',
      produtoId: 'p-1',
      nome: 'Produto A',
      quantidade: 6,
      precoUnitario: 80,
      precoOriginal: 100,
      resultado: {
        precoUnitario: 80,
        precoOriginal: 100,
        descontoUnitario: 20,
        tipoPreco: 'ATACADO',
      },
    })

    // 30% discount (above limit) should succeed for ATACADO
    expect(() => {
      useCarrinhoStore.getState().aplicarDescontoManual('linha-1', 24) // 30% of 80
    }).not.toThrow()

    const state = useCarrinhoStore.getState()
    expect(state.itens[0]?.resultado?.precoUnitario).toBe(56)
    expect(state.itens[0]?.resultado?.tipoPreco).toBe('MANUAL')
  })
})

