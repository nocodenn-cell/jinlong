import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrinho } from '@core/cart/types'
import type { RegraPreco, ResultadoPreco } from '@core/pricing/types'
import { pricingService } from '@core/pricing/PricingService'
import { defaultPdvConfig } from '../config/pdvConfig'

export interface ItemCarrinhoComPreco extends ItemCarrinho {
  resultado: ResultadoPreco
}

interface CartState {
  itens: ItemCarrinhoComPreco[]
  regras: RegraPreco[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number
  // Desconto especial de gerente (percentual sobre o total já com atacado)
  descontoGerentePercentual: number
  descontoGerenteValor: number
  /** Token emitido pela Edge (`op=validar_gerente`); necessário se o backend exigir auth estrita. */
  descontoGerenteToken: string | null

  // Config dinâmica (carregada via cache local)
  maxDescontoGerentePercentual: number

  setRegras: (regras: RegraPreco[]) => void
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

function calcularTotaisBase(itens: ItemCarrinhoComPreco[]) {
  const totalBruto = itens.reduce(
    (acc, item) => acc + item.resultado.precoOriginal * item.quantidade,
    0
  )
  const totalLiquidoBase = itens.reduce(
    (acc, item) => acc + item.resultado.precoUnitario * item.quantidade,
    0
  )
  return {
    totalBruto,
    totalLiquidoBase,
    totalItens: itens.length,
    totalUnidades: itens.reduce((acc, item) => acc + item.quantidade, 0),
  }
}

export function calcularTotaisComGerente(
  itens: ItemCarrinhoComPreco[],
  descontoGerentePercentual: number
) {
  const base = calcularTotaisBase(itens)
  const descontoGerenteValor =
    descontoGerentePercentual > 0
      ? (base.totalLiquidoBase * descontoGerentePercentual) / 100
      : 0
  const totalLiquido = base.totalLiquidoBase - descontoGerenteValor
  const totalDesconto = base.totalBruto - totalLiquido

  return {
    totalBruto: Math.round(base.totalBruto * 100) / 100,
    totalDesconto: Math.round(totalDesconto * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    totalItens: base.totalItens,
    totalUnidades: base.totalUnidades,
    descontoGerenteValor: Math.round(descontoGerenteValor * 100) / 100,
  }
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
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

      setRegras: (regras) => {
        set({ regras })
        const { itens, descontoGerentePercentual } = get()
        if (itens.length > 0) {
          const itensRecalc = pricingService.recalcularCarrinho(itens, regras)
          set({
            itens: itensRecalc,
            ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
          })
        }
      },

      adicionarItem: (novoItem) => {
        const { itens, regras, descontoGerentePercentual } = get()
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

        const itensRecalc = pricingService.recalcularCarrinho(novosItens, regras)
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
        const { itens, regras, descontoGerentePercentual } = get()
        const novos = itens.map((i) =>
          i.id === itemId ? { ...i, quantidade } : i
        )
        const itensRecalc = pricingService.recalcularCarrinho(novos, regras)
        set({
          itens: itensRecalc,
          ...calcularTotaisComGerente(itensRecalc, descontoGerentePercentual),
        })
      },

      removerItem: (itemId) => {
        const { itens, regras, descontoGerentePercentual } = get()
        const filtrados = itens.filter((i) => i.id !== itemId)
        const itensRecalc = pricingService.recalcularCarrinho(filtrados, regras)
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

