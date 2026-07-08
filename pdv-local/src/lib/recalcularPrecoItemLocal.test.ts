import { beforeEach, describe, expect, it } from 'vitest'
import type { ItemCarrinho } from '@core/stores/unifiedCartStore'
import type { RegraPreco } from '@core/pricing/types'
import { DEFAULT_PRICING_CONTEXT } from '@core/pricing/types'
import { useDesktopCartStore } from '../stores/cartStore'
import { recalcularPrecoItemLocal } from './recalcularPrecoItemLocal'

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

/** Faixas espelhando `regras_preco` já normalizadas por `mapRegraPrecoRow` (minQuantidade + quantidadeMinima). */
const REGRAS: RegraPreco[] = [
  { id: 'r-50', nome: '50+', tipo: 'ATACADO', minQuantidade: 50, quantidadeMinima: 50, descontoPercentual: 30, ativo: true },
  { id: 'r-10', nome: '10+', tipo: 'ATACADO', minQuantidade: 10, quantidadeMinima: 10, descontoPercentual: 20, ativo: true },
]

function seedItem(overrides: Partial<ItemCarrinho> = {}): ItemCarrinho {
  const item: ItemCarrinho = {
    id: 'item-1',
    produtoId: 'produto-1',
    nome: 'Produto A',
    quantidade: 1,
    precoVariejo: 100,
    precoUnitario: 100,
    precoOriginal: 100,
    resultado: { precoUnitario: 100, precoOriginal: 100, descontoUnitario: 0, tipoPreco: 'VAREJO' },
    ...overrides,
  }
  useDesktopCartStore.getState().adicionarItem(item)
  return item
}

describe('recalcularPrecoItemLocal', () => {
  beforeEach(() => {
    resetStore()
  })

  it('cruzar a faixa de 50 unidades aplica ATACADO com o desconto da faixa maior', () => {
    const item = seedItem()

    recalcularPrecoItemLocal(item, 60, REGRAS, DEFAULT_PRICING_CONTEXT)

    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('ATACADO')
    expect(atualizado.resultado?.precoUnitario).toBe(70)
    expect(atualizado.resultado?.precoOriginal).toBe(100)
  })

  it('quantidade abaixo de qualquer faixa mantém VAREJO', () => {
    const item = seedItem()

    recalcularPrecoItemLocal(item, 3, REGRAS, DEFAULT_PRICING_CONTEXT)

    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('VAREJO')
    expect(atualizado.resultado?.precoUnitario).toBe(100)
  })

  it('linha MANUAL não é recalculada ao mudar quantidade', () => {
    const item = seedItem({
      precoUnitario: 40,
      resultado: { precoUnitario: 40, precoOriginal: 100, descontoUnitario: 60, tipoPreco: 'MANUAL' },
    })

    recalcularPrecoItemLocal(item, 60, REGRAS, DEFAULT_PRICING_CONTEXT)

    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('MANUAL')
    expect(atualizado.resultado?.precoUnitario).toBe(40)
  })

  it('linha PROMOCAO não é recalculada ao mudar quantidade', () => {
    const item = seedItem({
      precoUnitario: 30,
      resultado: { precoUnitario: 30, precoOriginal: 100, descontoUnitario: 70, tipoPreco: 'PROMOCAO' },
    })

    recalcularPrecoItemLocal(item, 60, REGRAS, DEFAULT_PRICING_CONTEXT)

    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('PROMOCAO')
    expect(atualizado.resultado?.precoUnitario).toBe(30)
  })

  it('quantidade inválida (<=0) não altera o preço', () => {
    const item = seedItem()

    recalcularPrecoItemLocal(item, 0, REGRAS, DEFAULT_PRICING_CONTEXT)

    const atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('VAREJO')
    expect(atualizado.resultado?.precoUnitario).toBe(100)
  })

  it('VAREJO → ATACADO → redução de quantidade retorna ao preço base de VAREJO', () => {
    const item = seedItem()

    recalcularPrecoItemLocal(item, 60, REGRAS, DEFAULT_PRICING_CONTEXT)
    let atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('ATACADO')
    expect(atualizado.resultado?.precoUnitario).toBe(70)
    expect(atualizado.resultado?.precoOriginal).toBe(100)

    useDesktopCartStore.getState().alterarQuantidade(item.id, 4)
    recalcularPrecoItemLocal(atualizado, 4, REGRAS, DEFAULT_PRICING_CONTEXT)

    atualizado = useDesktopCartStore.getState().itens[0]
    expect(atualizado.resultado?.tipoPreco).toBe('VAREJO')
    expect(atualizado.resultado?.precoUnitario).toBe(100)
    expect(atualizado.resultado?.precoOriginal).toBe(100)
    expect(useDesktopCartStore.getState().totalLiquido).toBe(400)
  })
})
