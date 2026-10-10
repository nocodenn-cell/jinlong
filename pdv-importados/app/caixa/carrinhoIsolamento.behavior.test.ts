import { beforeEach, describe, expect, it } from 'vitest'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import type { ItemCarrinho } from '@/stores/unifiedCartStore'

function item(partial: Partial<ItemCarrinho> & Pick<ItemCarrinho, 'id' | 'produtoId'>): ItemCarrinho {
  return {
    nome: 'Produto teste',
    quantidade: 1,
    precoUnitario: 10,
    precoOriginal: 10,
    ...partial,
  }
}

function reset() {
  useCarrinhoStore.getState().setCartOwnerForSession(null)
  useCarrinhoStore.setState({
    itens: [],
    cartOwnerUserId: null,
    cartLojaId: null,
    vendaIdempotencyKey: null,
    vendaFinalizacaoPendente: false,
  })
}

function marcarReidratacaoSemDono() {
  const finish = useCarrinhoStore.persist.getOptions().onRehydrateStorage?.(useCarrinhoStore.getState())
  finish?.(useCarrinhoStore.getState(), undefined)
}

describe('carrinho — isolamento e contrato', () => {
  beforeEach(reset)

  it('operador B não herda o cupom do operador A', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))

    useCarrinhoStore.getState().setCartOwnerForSession('operador-b', 'loja-a')

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.cartOwnerUserId).toBe('operador-b')
    expect(state.totalLiquido).toBe(0)
  })

  it('o mesmo operador recupera o cupom quando o dono persistido confere', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1', precoUnitario: 12, precoOriginal: 12 }))
    const chave = useCarrinhoStore.getState().garantirVendaIdempotencyKey()

    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(1)
    expect(state.vendaIdempotencyKey).toBe(chave)
    expect(state.totalLiquido).toBe(12)
  })

  it('reidratação sem dono não é adotada pelo próximo operador', () => {
    useCarrinhoStore.setState({
      itens: [item({ id: 'alheio', produtoId: 'p1' })],
      cartOwnerUserId: null,
      cartLojaId: 'loja-a',
    })
    marcarReidratacaoSemDono()

    useCarrinhoStore.getState().setCartOwnerForSession('operador-b', 'loja-a')

    expect(useCarrinhoStore.getState().itens).toHaveLength(0)
    expect(useCarrinhoStore.getState().cartOwnerUserId).toBe('operador-b')
  })

  it('cupom em memória ainda sem dono continua com o operador que autenticar na mesma sessão', () => {
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')
    expect(useCarrinhoStore.getState().itens).toHaveLength(1)
    expect(useCarrinhoStore.getState().cartOwnerUserId).toBe('operador-a')
  })

  it('troca de loja do mesmo operador descarta o cupom e a chave de idempotência', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))
    useCarrinhoStore.getState().garantirVendaIdempotencyKey()

    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-b')

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.cartLojaId).toBe('loja-b')
    expect(state.cartOwnerUserId).toBe('operador-a')
    expect(state.vendaIdempotencyKey).toBeNull()
  })

  it('primeira vinculação de loja não apaga venda em andamento', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a')
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))

    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')

    expect(useCarrinhoStore.getState().itens).toHaveLength(1)
    expect(useCarrinhoStore.getState().cartLojaId).toBe('loja-a')
  })

  it('agrega repetido com o mesmo preço automático', () => {
    const add = (id: string) =>
      useCarrinhoStore.getState().adicionarItem(item({ id, produtoId: 'p1', precoUnitario: 10, precoOriginal: 10 }))
    add('l1')
    add('l2')
    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(1)
    expect(state.itens[0]?.quantidade).toBe(2)
    expect(state.totalLiquido).toBe(20)
  })

  it('não agrega o mesmo produto quando o desconto manual difere', () => {
    useCarrinhoStore.getState().adicionarItem(
      item({
        id: 'com-desconto',
        produtoId: 'p1',
        precoOriginal: 10,
        precoUnitario: 8,
        resultado: { precoUnitario: 8, precoOriginal: 10, descontoUnitario: 2, tipoPreco: 'MANUAL' },
      }),
    )
    useCarrinhoStore.getState().adicionarItem(
      item({
        id: 'sem-desconto',
        produtoId: 'p1',
        precoOriginal: 10,
        precoUnitario: 10,
        resultado: { precoUnitario: 10, precoOriginal: 10, descontoUnitario: 0, tipoPreco: 'VAREJO' },
      }),
    )
    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(2)
    expect(state.totalLiquido).toBe(18)
  })

  it('agrega varejo e atacado do mesmo produto para o recálculo de faixa', () => {
    useCarrinhoStore.getState().adicionarItem(
      item({
        id: 'atacado',
        produtoId: 'p1',
        quantidade: 6,
        precoUnitario: 8,
        precoOriginal: 10,
        resultado: { precoUnitario: 8, precoOriginal: 10, descontoUnitario: 2, tipoPreco: 'ATACADO' },
      }),
    )
    useCarrinhoStore.getState().adicionarItem(
      item({
        id: 'varejo',
        produtoId: 'p1',
        resultado: { precoUnitario: 10, precoOriginal: 10, descontoUnitario: 0, tipoPreco: 'VAREJO' },
      }),
    )
    expect(useCarrinhoStore.getState().itens).toHaveLength(1)
    expect(useCarrinhoStore.getState().itens[0]?.quantidade).toBe(7)
  })

  it('quantidade zero ou negativa remove a linha e não fica no cupom', () => {
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))
    useCarrinhoStore.getState().alterarQuantidade('l1', 0)
    expect(useCarrinhoStore.getState().itens).toHaveLength(0)

    useCarrinhoStore.getState().adicionarItem(item({ id: 'l2', produtoId: 'p2' }))
    useCarrinhoStore.getState().alterarQuantidade('l2', -3)
    expect(useCarrinhoStore.getState().itens).toHaveLength(0)
    expect(useCarrinhoStore.getState().totalLiquido).toBe(0)
  })

  it('quantidade inválida não altera a linha nem entra no cupom', () => {
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1', quantidade: 2 }))
    useCarrinhoStore.getState().alterarQuantidade('l1', Number.NaN)
    expect(useCarrinhoStore.getState().itens[0]?.quantidade).toBe(2)

    useCarrinhoStore.getState().adicionarItem(item({ id: 'zero', produtoId: 'p9', quantidade: 0 }))
    useCarrinhoStore.getState().adicionarItem(item({ id: 'neg', produtoId: 'p8', quantidade: -1 }))
    expect(useCarrinhoStore.getState().itens).toHaveLength(1)
  })

  it('desconto de gerente autorizado respeita o teto e o token', () => {
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1', precoUnitario: 100, precoOriginal: 100 }))
    useCarrinhoStore.getState().setMaxDescontoGerentePercentual(20)
    useCarrinhoStore.getState().aplicarDescontoGerente(10, 'token-ok', 20)

    const autorizado = useCarrinhoStore.getState()
    expect(autorizado.descontoGerentePercentual).toBe(10)
    expect(autorizado.descontoGerenteToken).toBe('token-ok')
    expect(autorizado.totalLiquido).toBe(90)
  })

  it('desconto de gerente acima do teto é cortado e zero limpa o token', () => {
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1', precoUnitario: 100, precoOriginal: 100 }))
    useCarrinhoStore.getState().setMaxDescontoGerentePercentual(20)
    useCarrinhoStore.getState().aplicarDescontoGerente(80, 'token-alto', 20)
    expect(useCarrinhoStore.getState().descontoGerentePercentual).toBe(20)
    expect(useCarrinhoStore.getState().totalLiquido).toBe(80)

    useCarrinhoStore.getState().aplicarDescontoGerente(0, 'token-alto', 20)
    expect(useCarrinhoStore.getState().descontoGerentePercentual).toBe(0)
    expect(useCarrinhoStore.getState().descontoGerenteToken).toBeNull()
    expect(useCarrinhoStore.getState().totalLiquido).toBe(100)
  })

  it('limpar o cupom após finalizar ou cancelar zera itens, dono e loja', () => {
    useCarrinhoStore.getState().setCartOwnerForSession('operador-a', 'loja-a')
    useCarrinhoStore.getState().adicionarItem(item({ id: 'l1', produtoId: 'p1' }))
    useCarrinhoStore.getState().garantirVendaIdempotencyKey()

    useCarrinhoStore.getState().limparCarrinho()

    const state = useCarrinhoStore.getState()
    expect(state.itens).toHaveLength(0)
    expect(state.cartOwnerUserId).toBeNull()
    expect(state.cartLojaId).toBeNull()
    expect(state.vendaIdempotencyKey).toBeNull()
    expect(state.totalLiquido).toBe(0)
  })
})
