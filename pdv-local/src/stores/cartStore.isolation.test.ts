import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cartStore'

function reset() {
  useCartStore.getState().setCartOwnerForSession(null)
  useCartStore.getState().limparCarrinho()
}

describe('cartStore desktop — loja, quantidade e desconto', () => {
  beforeEach(reset)

  it('troca de loja não mantém itens da loja anterior', () => {
    useCartStore.getState().setCartLojaForSession('loja-a')
    useCartStore.getState().adicionarItem({
      id: 'l1',
      produtoId: 'p1',
      nome: 'Produto',
      quantidade: 1,
      precoVariejo: 10,
    })

    useCartStore.getState().setCartLojaForSession('loja-b')

    expect(useCartStore.getState().itens).toHaveLength(0)
    expect(useCartStore.getState().cartLojaId).toBe('loja-b')
  })

  it('não agrega linha manual com preço diferente', () => {
    useCartStore.getState().adicionarItem({
      id: 'manual',
      produtoId: 'p1',
      nome: 'Produto',
      quantidade: 1,
      precoVariejo: 10,
      precoUnitario: 7,
      precoOriginal: 10,
      resultado: { precoUnitario: 7, precoOriginal: 10, descontoUnitario: 3, tipoPreco: 'MANUAL' },
    })
    useCartStore.getState().adicionarItem({
      id: 'cheio',
      produtoId: 'p1',
      nome: 'Produto',
      quantidade: 1,
      precoVariejo: 10,
    })

    expect(useCartStore.getState().itens).toHaveLength(2)
  })

  it('quantidade negativa não permanece no cupom', () => {
    useCartStore.getState().adicionarItem({
      id: 'l1',
      produtoId: 'p1',
      nome: 'Produto',
      quantidade: 1,
      precoVariejo: 10,
    })
    useCartStore.getState().alterarQuantidade('l1', -2)
    expect(useCartStore.getState().itens).toHaveLength(0)
  })

  it('desconto de gerente sem teto suficiente não aplica o percentual pedido', () => {
    useCartStore.getState().adicionarItem({
      id: 'l1',
      produtoId: 'p1',
      nome: 'Produto',
      quantidade: 1,
      precoVariejo: 100,
    })
    useCartStore.getState().setMaxDescontoGerentePercentual(5)
    useCartStore.getState().aplicarDescontoGerente(40, null, 5)
    expect(useCartStore.getState().descontoGerentePercentual).toBe(5)
    expect(useCartStore.getState().descontoGerenteToken).toBeNull()
    expect(useCartStore.getState().totalLiquido).toBe(95)
  })
})
