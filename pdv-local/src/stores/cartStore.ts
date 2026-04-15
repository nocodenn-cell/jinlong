import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrinho } from '@core/cart/types'
import type { PricingContext, RegraPreco, ResultadoPreco } from '@core/pricing/types'
import { DEFAULT_PRICING_CONTEXT } from '@core/pricing/types'
import { pricingService } from '@core/pricing/PricingService'
import { calcularTotaisComGerente } from '@core/cart/totals'
import { defaultPdvConfig } from '../config/pdvConfig'

export { calcularTotaisComGerente } from '@core/cart/totals'

export interface ItemCarrinhoComPreco extends ItemCarrinho {
  resultado: ResultadoPreco
}

interface CartState {
  itens: ItemCarrinhoComPreco[]
  regras: RegraPreco[]
  pricingCtx: PricingContext
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number
  descontoGerentePercentual: number
  descontoGerenteValor: number
  /** Token emitido pela Edge (`op=validar_gerente`); necessário se o backend exigir auth estrita. */
  descontoGerenteToken: string | null

  maxDescontoGerentePercentual: number

  setRegras: (regras: RegraPreco[], ctx?: PricingContext) => void
  adicionarItem: (item: ItemCarrinho) => void
  alterarQuantidade: (itemId: string, quantidade: number) => void
  removerItem: (itemId: string) => void
  limparCarrinho: () => void
  aplicarDescontoGerente: (
    percentual: number,
    token?: string | null,
    maxClamp?: number | null
  ) => void
  setMaxDescontoGerentePercentual: (max: number) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      itens: [],
      regras: [],
      pricingCtx: DEFAULT_PRICING_CONTEXT,
      totalBruto: 0,
      totalDesconto: 0,
      totalLiquido: 0,
      totalItens: 0,
      totalUnidades: 0,
      descontoGerentePercentual: 0,
      descontoGerenteValor: 0,
      descontoGerenteToken: null,
      maxDescontoGerentePercentual: defaultPdvConfig.maxDescontoGerentePercentual,

      setRegras: (regras, ctx) => {
        const pricingCtx = ctx ?? get().pricingCtx
        set({ regras, pricingCtx })
        const { itens, descontoGerentePercentual } = get()
        if (itens.length > 0) {
          const itensRecalc = pricingService.recalcularCarrinho(itens, regras, pricingCtx)
          set({
            itens: itensRecalc,
            ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
          })
        }
      },

      adicionarItem: (novoItem) => {
        const { itens, regras, pricingCtx, descontoGerentePercentual } = get()
        const existente = itens.find((i) => i.produtoId === novoItem.produtoId)
        let novosItens: ItemCarrinho[]

        if (existente) {
          novosItens = itens.map((i) =>
            i.produtoId === novoItem.produtoId
              ? { ...i, quantidade: i.quantidade + novoItem.quantidade }
              : i
          )
        } else {
          novosItens = [
            ...itens,
            {
              ...novoItem,
              resultado: {
                precoUnitario: novoItem.precoVariejo,
                precoOriginal: novoItem.precoVariejo,
                descontoUnitario: 0,
                tipoPreco: 'VAREJO',
              },
            } as ItemCarrinhoComPreco,
          ]
        }

        const itensRecalc = pricingService.recalcularCarrinho(
          novosItens,
          regras,
          pricingCtx,
        )
        set({
          itens: itensRecalc,
          ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
        })
      },

      alterarQuantidade: (itemId, quantidade) => {
        if (quantidade <= 0) {
          get().removerItem(itemId)
          return
        }
        const { itens, regras, pricingCtx, descontoGerentePercentual } = get()
        const novos = itens.map((i) =>
          i.id === itemId ? { ...i, quantidade } : i
        )
        const itensRecalc = pricingService.recalcularCarrinho(novos, regras, pricingCtx)
        set({
          itens: itensRecalc,
          ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
        })
      },

      removerItem: (itemId) => {
        const { itens, regras, pricingCtx, descontoGerentePercentual } = get()
        const filtrados = itens.filter((i) => i.id !== itemId)
        const itensRecalc = pricingService.recalcularCarrinho(filtrados, regras, pricingCtx)
        set({
          itens: itensRecalc,
          ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
        })
      },

      limparCarrinho: () =>
        set({
          itens: [],
          totalBruto: 0,
          totalDesconto: 0,
          totalLiquido: 0,
          totalItens: 0,
          totalUnidades: 0,
          descontoGerentePercentual: 0,
          descontoGerenteValor: 0,
          descontoGerenteToken: null,
        }),

      aplicarDescontoGerente: (percentual, token = null, maxClamp = null) => {
        const maxStore = get().maxDescontoGerentePercentual
        const max =
          maxClamp != null && Number.isFinite(maxClamp) && maxClamp > 0
            ? Math.min(maxStore, maxClamp)
            : maxStore
        const bounded = Math.max(0, Math.min(percentual, max))
        const { itens } = get()
        const totais = calcularTotaisComGerente(itens, bounded)
        set({
          ...totais,
          descontoGerentePercentual: bounded,
          descontoGerenteValor: totais.descontoGerenteValor,
          descontoGerenteToken: bounded > 0 ? token ?? null : null,
        })
      },

      setMaxDescontoGerentePercentual: (max) => {
        const bounded = Math.max(0, max)
        const percentualCorrigido = Math.min(get().descontoGerentePercentual, bounded)
        const totais = calcularTotaisComGerente(get().itens, percentualCorrigido)
        set({
          maxDescontoGerentePercentual: bounded,
          ...totais,
          descontoGerentePercentual: percentualCorrigido,
          descontoGerenteValor: totais.descontoGerenteValor,
          descontoGerenteToken: percentualCorrigido <= 0 ? null : get().descontoGerenteToken,
        })
      },
    }),
    {
      name: 'pdv-local-carrinho',
    }
  )
)

