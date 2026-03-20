// src/stores/carrinhoStore.ts
// Estado do carrinho do PDV — Zustand
// Sempre recalcular todos os itens ao mudar quantidade

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { pricingService } from '@/core/pricing/PricingService'
import type { ItemCarrinho } from '@/core/cart/types'
import type { RegraPreco, ResultadoPreco } from '@/core/pricing/types'

export interface ItemCarrinhoComPreco extends ItemCarrinho {
  resultado: ResultadoPreco
}

interface CarrinhoState {
  itens: ItemCarrinhoComPreco[]
  regras: RegraPreco[]

  // Totais calculados
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number

  // Ações
  setRegras: (regras: RegraPreco[]) => void
  adicionarItem: (item: ItemCarrinho) => void
  removerItem: (itemId: string) => void
  alterarQuantidade: (itemId: string, quantidade: number) => void
  aplicarDescontoManual: (itemId: string, desconto: number, motivo: string) => void
  limparCarrinho: () => void
}

function calcularTotais(itens: ItemCarrinhoComPreco[]) {
  const totalBruto = itens.reduce(
    (acc, item) => acc + item.resultado.precoOriginal * item.quantidade,
    0
  )
  const totalLiquido = itens.reduce(
    (acc, item) => acc + item.resultado.precoUnitario * item.quantidade,
    0
  )
  const totalDesconto = totalBruto - totalLiquido

  return {
    totalBruto: Math.round(totalBruto * 100) / 100,
    totalDesconto: Math.round(totalDesconto * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    totalItens: itens.length,
    totalUnidades: itens.reduce((acc, item) => acc + item.quantidade, 0),
  }
}

export const useCarrinhoStore = create<CarrinhoState>()(
  persist(
    (set, get) => ({
      itens: [],
      regras: [],
      totalBruto: 0,
      totalDesconto: 0,
      totalLiquido: 0,
      totalItens: 0,
      totalUnidades: 0,

      setRegras: (regras) => {
        set({ regras })
        // Recalcular preços com as novas regras
        const { itens } = get()
        if (itens.length > 0) {
          const itensRecalculados = pricingService.recalcularCarrinho(itens, regras)
          set({ itens: itensRecalculados, ...calcularTotais(itensRecalculados) })
        }
      },

      adicionarItem: (novoItem) => {
        const { itens, regras } = get()

        // Verifica se já existe item do mesmo produto
        const itemExistente = itens.find((i) => i.produtoId === novoItem.produtoId)

        let novosItens: ItemCarrinho[]

        if (itemExistente) {
          // Incrementa quantidade do item existente
          novosItens = itens.map((i) =>
            i.produtoId === novoItem.produtoId
              ? { ...i, quantidade: i.quantidade + novoItem.quantidade }
              : i
          )
        } else {
          novosItens = [
            ...itens,
            { ...novoItem, resultado: { precoUnitario: novoItem.precoVariejo, precoOriginal: novoItem.precoVariejo, descontoUnitario: 0, tipoPreco: 'VAREJO' as const } },
          ]
        }

        // CRÍTICO: recalcular TODOS os itens (pode cruzar faixa de atacado)
        const itensRecalculados = pricingService.recalcularCarrinho(novosItens, regras)
        set({ itens: itensRecalculados, ...calcularTotais(itensRecalculados) })
      },

      removerItem: (itemId) => {
        const { itens, regras } = get()
        const novoItens = itens.filter((i) => i.id !== itemId)
        const itensRecalculados = pricingService.recalcularCarrinho(novoItens, regras)
        set({ itens: itensRecalculados, ...calcularTotais(itensRecalculados) })
      },

      alterarQuantidade: (itemId, quantidade) => {
        if (quantidade <= 0) {
          get().removerItem(itemId)
          return
        }

        const { itens, regras } = get()
        const novoItens = itens.map((i) =>
          i.id === itemId ? { ...i, quantidade } : i
        )

        // CRÍTICO: recalcular TODOS (não só o item alterado)
        const itensRecalculados = pricingService.recalcularCarrinho(novoItens, regras)
        set({ itens: itensRecalculados, ...calcularTotais(itensRecalculados) })
      },

      aplicarDescontoManual: (itemId, desconto, _motivo) => {
        const { itens } = get()
        const novosItens = itens.map((i): ItemCarrinhoComPreco => {
          if (i.id !== itemId) return i
          const precoFinal = Math.max(0, i.precoVariejo - desconto)
          return {
            ...i,
            resultado: {
              precoUnitario: Math.round(precoFinal * 100) / 100,
              precoOriginal: i.precoVariejo,
              descontoUnitario: desconto,
              tipoPreco: 'MANUAL',
            },
          }
        })
        set({ itens: novosItens, ...calcularTotais(novosItens) })
      },

      limparCarrinho: () =>
        set({
          itens: [],
          totalBruto: 0,
          totalDesconto: 0,
          totalLiquido: 0,
          totalItens: 0,
          totalUnidades: 0,
        }),
    }),
    {
      name: 'pdv-carrinho',
      // Não persistir regras de preço (sempre buscar fresh do servidor)
      partialize: (state) => ({
        itens: state.itens,
      }),
    }
  )
)
