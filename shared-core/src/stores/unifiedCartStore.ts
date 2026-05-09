import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '../pricing/types'
import {
  DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL,
  aplicarDescontoGerenteSobreTotal,
  clampPercentualDesconto,
} from '../managerDiscount/policy'

export interface ItemCarrinho {
  id: string
  produtoId: string
  quantidade: number
  precoVariejo?: number
  precoUnitario?: number
  precoOriginal?: number
  nome: string
  descricao?: string
  sku?: string
  imagem?: string
  metaPdv?: Record<string, unknown>
  variantes?: Record<string, unknown>
  resultado?: {
    precoUnitario: number
    precoOriginal: number
    descontoUnitario: number
    tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
  }
}

export interface CarrinhoState {
  itens: ItemCarrinho[]
  cartOwnerUserId: string | null
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  totalUnidades: number
  regras: unknown[]
  pricingCtx: PricingContext
  descontoGerentePercentual: number
  descontoGerenteValor: number
  descontoGerenteToken: string | null
  maxDescontoGerentePercentual: number
  adicionarItem: (item: ItemCarrinho) => void
  removerItem: (id: string) => void
  atualizarQuantidade: (id: string, quantidade: number) => void
  limparCarrinho: () => void
  setCartOwnerForSession: (userId: string | null) => void
  setRegras: (regras: unknown[]) => void
  alterarQuantidade: (id: string, quantidade: number) => void
  /** Atualiza preço unitário / tipo após RPC `calcular_preco_produto` (ignora linhas MANUAL / PROMOCAO). */
  sincronizarPrecoCalculadoRpc: (
    id: string,
    patch: { precoUnitario: number; tipoPreco: 'VAREJO' | 'ATACADO' },
  ) => void
  aplicarDescontoManual: (id: string, descontoValor: number, motivo?: string) => void
  aplicarDescontoGerente: (percentual: number, token?: string | null, maxClamp?: number | null) => void
  setMaxDescontoGerentePercentual: (valor: number) => void
}

function roundMoney(valor: number) {
  return Math.round(valor * 100) / 100
}

function normalizarItemCarrinho(item: ItemCarrinho): ItemCarrinho {
  const precoBase = item.precoVariejo ?? item.precoOriginal ?? item.precoUnitario ?? 0
  const resultadoPrecoUnitario = item.resultado?.precoUnitario ?? item.precoUnitario ?? precoBase
  const resultadoPrecoOriginal = item.resultado?.precoOriginal ?? item.precoOriginal ?? precoBase
  const descontoUnitario = item.resultado?.descontoUnitario ?? roundMoney(resultadoPrecoOriginal - resultadoPrecoUnitario)
  const tipoPreco = item.resultado?.tipoPreco ?? 'VAREJO'

  return {
    ...item,
    precoVariejo: item.precoVariejo ?? precoBase,
    precoUnitario: resultadoPrecoUnitario,
    precoOriginal: resultadoPrecoOriginal,
    resultado: {
      precoUnitario: resultadoPrecoUnitario,
      precoOriginal: resultadoPrecoOriginal,
      descontoUnitario,
      tipoPreco,
    },
  }
}

function recalcularTotais(itens: ItemCarrinho[]) {
  const totalBruto = itens.reduce((acc, item) => acc + (item.precoOriginal ?? 0) * item.quantidade, 0)
  const totalLiquido = itens.reduce((acc, item) => acc + (item.precoUnitario ?? 0) * item.quantidade, 0)
  const totalDesconto = totalBruto - totalLiquido
  const totalItens = itens.length
  const totalUnidades = itens.reduce((acc, item) => acc + item.quantidade, 0)

  return {
    totalBruto: roundMoney(totalBruto),
    totalDesconto: roundMoney(totalDesconto),
    totalLiquido: roundMoney(totalLiquido),
    totalItens,
    totalUnidades,
  }
}

function aplicarDescontoSobreTotais(
  totaisBase: ReturnType<typeof recalcularTotais>,
  descontoPercentual: number,
  maxDescontoGerentePercentual: number,
) {
  const { percentualClamped, descontoValor, totalLiquidoComDesconto } =
    aplicarDescontoGerenteSobreTotal({
      totalLiquido: totaisBase.totalLiquido,
      percentual: descontoPercentual,
      maxPermitido: maxDescontoGerentePercentual,
    })

  return {
    ...totaisBase,
    totalLiquido: totalLiquidoComDesconto,
    totalDesconto: roundMoney(totaisBase.totalBruto - totalLiquidoComDesconto),
    descontoGerentePercentual: percentualClamped,
    descontoGerenteValor: descontoValor,
  }
}

export const useCartStore = create<CarrinhoState>()(
  persist(
    (set) => ({
      itens: [],
      cartOwnerUserId: null,
      totalBruto: 0,
      totalDesconto: 0,
      totalLiquido: 0,
      totalItens: 0,
      totalUnidades: 0,
      regras: [],
      pricingCtx: DEFAULT_PRICING_CONTEXT,
      descontoGerentePercentual: 0,
      descontoGerenteValor: 0,
      descontoGerenteToken: null,
      maxDescontoGerentePercentual: DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL,

      adicionarItem: (item) =>
        set((state) => {
          const itemNormalizado = normalizarItemCarrinho(item)
          const existe = state.itens.find((i) => i.produtoId === itemNormalizado.produtoId)
          const novosItens = existe
            ? state.itens.map((i) =>
                i.produtoId === itemNormalizado.produtoId
                  ? normalizarItemCarrinho({ ...i, quantidade: i.quantidade + itemNormalizado.quantidade })
                  : i,
              )
            : [...state.itens, itemNormalizado]

          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),

      removerItem: (id) =>
        set((state) => {
          const novosItens = state.itens.filter((i) => i.id !== id)
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),

      atualizarQuantidade: (id, quantidade) =>
        set((state) => {
          if (quantidade <= 0) {
            const novosItens = state.itens.filter((i) => i.id !== id)
            const totais = aplicarDescontoSobreTotais(
              recalcularTotais(novosItens),
              state.descontoGerentePercentual,
              state.maxDescontoGerentePercentual,
            )
            return { itens: novosItens, ...totais }
          }
          const novosItens = state.itens.map((i) =>
            i.id === id ? normalizarItemCarrinho({ ...i, quantidade }) : i,
          )
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),

      limparCarrinho: () =>
        set((state) => ({
          itens: [],
          cartOwnerUserId: null,
          totalBruto: 0,
          totalDesconto: 0,
          totalLiquido: 0,
          totalItens: 0,
          totalUnidades: 0,
          regras: state.regras,
          pricingCtx: state.pricingCtx,
          descontoGerentePercentual: 0,
          descontoGerenteValor: 0,
          descontoGerenteToken: null,
        })),

      setCartOwnerForSession: (userId) =>
        set((state) => {
          if (userId === null) {
            return {
              itens: [],
              cartOwnerUserId: null,
              totalBruto: 0,
              totalDesconto: 0,
              totalLiquido: 0,
              totalItens: 0,
              totalUnidades: 0,
              regras: state.regras,
              pricingCtx: state.pricingCtx,
              descontoGerentePercentual: 0,
              descontoGerenteValor: 0,
              descontoGerenteToken: null,
            }
          }

          if (state.cartOwnerUserId === null) {
            return { cartOwnerUserId: userId }
          }

          if (userId !== state.cartOwnerUserId) {
            return {
              itens: [],
              cartOwnerUserId: userId,
              totalBruto: 0,
              totalDesconto: 0,
              totalLiquido: 0,
              totalItens: 0,
              totalUnidades: 0,
              regras: state.regras,
              pricingCtx: state.pricingCtx,
              descontoGerentePercentual: 0,
              descontoGerenteValor: 0,
              descontoGerenteToken: null,
            }
          }

          return { cartOwnerUserId: userId }
        }),

      setRegras: (regras) => set({ regras }),
      aplicarDescontoManual: (id, descontoValor) =>
        set((state) => {
          const novosItens = state.itens.map((item) => {
            if (item.id !== id) return item
            const precoOriginal = item.precoOriginal ?? item.precoVariejo ?? item.precoUnitario ?? 0
            const precoComDesconto = Math.max(0, roundMoney(precoOriginal - descontoValor))
            return normalizarItemCarrinho({
              ...item,
              precoOriginal,
              precoUnitario: precoComDesconto,
              resultado: {
                precoOriginal,
                precoUnitario: precoComDesconto,
                descontoUnitario: roundMoney(precoOriginal - precoComDesconto),
                tipoPreco: 'MANUAL',
              },
            })
          })
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),
      aplicarDescontoGerente: (percentual, token = null, maxClamp = null) =>
        set((state) => {
          const maxPermitido =
            typeof maxClamp === 'number' && Number.isFinite(maxClamp)
              ? Math.max(0, maxClamp)
              : state.maxDescontoGerentePercentual
          const percentualClamped = clampPercentualDesconto(percentual, maxPermitido)
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(state.itens),
            percentualClamped,
            maxPermitido,
          )
          const descontoAtivo = totais.descontoGerentePercentual > 0
          return {
            ...totais,
            descontoGerenteToken: descontoAtivo ? token : null,
            maxDescontoGerentePercentual: maxPermitido,
          }
        }),
      setMaxDescontoGerentePercentual: (valor) =>
        set((state) => {
          const maxPermitido = Math.max(0, Number.isFinite(valor) ? valor : state.maxDescontoGerentePercentual)
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(state.itens),
            state.descontoGerentePercentual,
            maxPermitido,
          )
          const descontoAtivo = totais.descontoGerentePercentual > 0
          return {
            ...totais,
            maxDescontoGerentePercentual: maxPermitido,
            descontoGerenteToken: descontoAtivo ? state.descontoGerenteToken : null,
          }
        }),

      alterarQuantidade: (id, quantidade) =>
        set((state) => {
          const novosItens =
            quantidade <= 0
              ? state.itens.filter((i) => i.id !== id)
              : state.itens.map((i) => (i.id === id ? normalizarItemCarrinho({ ...i, quantidade }) : i))
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),

      sincronizarPrecoCalculadoRpc: (itemId, patch) =>
        set((state) => {
          const item = state.itens.find((i) => i.id === itemId)
          if (!item) return state
          const tp = item.resultado?.tipoPreco
          if (tp === 'MANUAL' || tp === 'PROMOCAO') return state

          const metaRef = item.metaPdv?.precoVarejoReferencia
          const precoVarejoRef =
            typeof metaRef === 'number' && Number.isFinite(metaRef)
              ? metaRef
              : (item.precoOriginal ??
                item.precoVariejo ??
                item.resultado?.precoOriginal ??
                patch.precoUnitario)

          const precoOriginal = patch.tipoPreco === 'ATACADO' ? precoVarejoRef : patch.precoUnitario
          const precoUnit = patch.precoUnitario

          const novosItens = state.itens.map((i) =>
            i.id === itemId
              ? normalizarItemCarrinho({
                  ...i,
                  metaPdv: { ...(i.metaPdv ?? {}), precoVarejoReferencia: precoVarejoRef },
                  precoUnitario: precoUnit,
                  precoOriginal,
                  resultado: {
                    precoOriginal,
                    precoUnitario: precoUnit,
                    descontoUnitario: roundMoney(precoOriginal - precoUnit),
                    tipoPreco: patch.tipoPreco,
                  },
                })
              : i,
          )
          const totais = aplicarDescontoSobreTotais(
            recalcularTotais(novosItens),
            state.descontoGerentePercentual,
            state.maxDescontoGerentePercentual,
          )
          return { itens: novosItens, ...totais }
        }),
    }),
    { name: 'pdv-carrinho' },
  ),
)

export function calcularTotais(itens: ItemCarrinho[]) {
  return recalcularTotais(itens)
}

export function calcularTotaisComGerente(itens: ItemCarrinho[], descontoPercentual: number) {
  const { totalBruto, totalLiquido, totalItens, totalUnidades } = recalcularTotais(itens)
  const { descontoValor, totalLiquidoComDesconto } = aplicarDescontoGerenteSobreTotal({
    totalLiquido,
    percentual: descontoPercentual,
    maxPermitido: descontoPercentual > 0 ? descontoPercentual : 0,
  })
  return {
    totalBruto,
    totalLiquido: totalLiquidoComDesconto,
    totalDesconto: roundMoney(totalBruto - totalLiquidoComDesconto),
    descontoGerenteValor: descontoValor,
    totalItens,
    totalUnidades,
  }
}

export type ItemCarrinhoComPreco = ItemCarrinho
