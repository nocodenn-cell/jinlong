import { beforeEach, describe, expect, it } from 'vitest'
import type { ItemCarrinho } from '@core/stores/unifiedCartStore'
import { DEFAULT_PRICING_CONTEXT } from '@core/pricing/types'
import { useDesktopCartStore } from '../stores/cartStore'
import { recalcularPrecoItemLocal } from './recalcularPrecoItemLocal'
import type { PrecoCanonicoSnapshot } from './resolverPrecoCanonicoLocal'

function resetStore() {
  useDesktopCartStore.setState({
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

const SNAP: PrecoCanonicoSnapshot = {
  lojaId: null,
  quantidadeMinimaAtacadoPadrao: 10,
  tiers: [
    {
      id: 'r-10',
      produtoId: 'produto-1',
      lojaId: null,
      quantidadeMinima: 10,
      precoUnitario: 80,
    },
    {
      id: 'r-50',
      produtoId: 'produto-1',
      lojaId: null,
      quantidadeMinima: 50,
      precoUnitario: 70,
    },
  ],
}

function seedItem(overrides: Partial<ItemCarrinho> = {}): ItemCarrinho {
  const item: ItemCarrinho = {
    id: 'item-1',
    produtoId: 'produto-1',
    nome: 'Produto A',
    quantidade: 1,
    precoVariejo: 100,
    precoUnitario: 100,
    precoOriginal: 100,
    metaPdv: { precoVarejoReferencia: 100, precoAtacadoCatalogo: 85 },
    resultado: { precoUnitario: 100, precoOriginal: 100, descontoUnitario: 0, tipoPreco: 'VAREJO' },
    ...overrides,
  }
  useDesktopCartStore.getState().adicionarItem(item)
  return item
}

describe('recalcularPrecoItemLocal (canônico)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('cruzar faixa de 50 aplica ATACADO absoluto', () => {
    const item = seedItem()
    recalcularPrecoItemLocal(item, 60, SNAP)
    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('ATACADO')
    expect(atualizado.resultado?.precoUnitario).toBe(70)
  })

  it('quantidade abaixo de qualquer faixa mantém VAREJO', () => {
    const item = seedItem()
    recalcularPrecoItemLocal(item, 3, SNAP)
    expect(useDesktopCartStore.getState().itens[0].resultado?.precoUnitario).toBe(100)
  })

  it('linha MANUAL não é recalculada', () => {
    const item = seedItem({
      precoUnitario: 40,
      resultado: { precoUnitario: 40, precoOriginal: 100, descontoUnitario: 60, tipoPreco: 'MANUAL' },
    })
    recalcularPrecoItemLocal(item, 60, SNAP)
    expect(useDesktopCartStore.getState().itens[0].resultado?.precoUnitario).toBe(40)
  })

  it('linha PROMOCAO não é recalculada', () => {
    const item = seedItem({
      precoUnitario: 30,
      resultado: { precoUnitario: 30, precoOriginal: 100, descontoUnitario: 70, tipoPreco: 'PROMOCAO' },
    })
    recalcularPrecoItemLocal(item, 60, SNAP)
    expect(useDesktopCartStore.getState().itens[0].resultado?.precoUnitario).toBe(30)
  })

  it('quantidade inválida não altera', () => {
    const item = seedItem()
    recalcularPrecoItemLocal(item, 0, SNAP)
    expect(useDesktopCartStore.getState().itens[0].resultado?.precoUnitario).toBe(100)
  })

  it('VAREJO → ATACADO → volta a VAREJO', () => {
    const item = seedItem()
    recalcularPrecoItemLocal(item, 60, SNAP)
    let atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.precoUnitario).toBe(70)

    useDesktopCartStore.getState().alterarQuantidade(item.id, 4)
    recalcularPrecoItemLocal(atualizado, 4, SNAP)
    atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.precoUnitario).toBe(100)
    expect(useDesktopCartStore.getState().totalLiquido).toBe(400)
  })
})
