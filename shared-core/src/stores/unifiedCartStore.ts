import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '../pricing/types'
import {
  DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL,
  aplicarDescontoGerenteSobreTotal,
  clampPercentualDesconto,
} from '../managerDiscount/policy'
import { roundMoney2 as roundMoney } from '../money/roundMoney'

export interface ItemCarrinho {
  id: string
  produtoId: string
  quantidade: number
  precoVariejo?: number
  precoUnitario?: number
  precoOriginal?: number
  /** Piso de preço: desconto manual não pode levar o precoUnitario abaixo deste valor. */
  precoMinimo?: number
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
  /** Última linha removida (não persistida) — buffer para desfazer (Ctrl+Z). */
  ultimoRemovido: { item: ItemCarrinho; index: number } | null
  adicionarItem: (item: ItemCarrinho) => void
  removerItem: (id: string) => void
  /** Repõe a última linha removida na posição original; no-op se buffer vazio. */
  restaurarUltimoRemovido: () => void
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

type CartDiscountSlice = Pick<
  CarrinhoState,
  'descontoGerentePercentual' | 'maxDescontoGerentePercentual'
>

type CartPersistedContext = Pick<CarrinhoState, 'regras' | 'pricingCtx'>

type ItensComTotais = Pick<
  CarrinhoState,
  | 'itens'
  | 'totalBruto'
  | 'totalDesconto'
  | 'totalLiquido'
  | 'totalItens'
  | 'totalUnidades'
  | 'descontoGerentePercentual'
  | 'descontoGerenteValor'
>

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

function commitItensComTotais(
  state: CartDiscountSlice,
  novosItens: ItemCarrinho[],
): ItensComTotais {
  const totais = aplicarDescontoSobreTotais(
    recalcularTotais(novosItens),
    state.descontoGerentePercentual,
    state.maxDescontoGerentePercentual,
  )
  return { itens: novosItens, ...totais }
}

function emptyCartFields(ctx: CartPersistedContext): Partial<CarrinhoState> {
  return {
    itens: [],
    cartOwnerUserId: null,
    totalBruto: 0,
    totalDesconto: 0,
    totalLiquido: 0,
    totalItens: 0,
    totalUnidades: 0,
    regras: ctx.regras,
    pricingCtx: ctx.pricingCtx,
    descontoGerentePercentual: 0,
    descontoGerenteValor: 0,
    descontoGerenteToken: null,
    ultimoRemovido: null,
  }
}

function updateItemQuantity(itens: ItemCarrinho[], id: string, quantidade: number): ItemCarrinho[] {
  if (quantidade <= 0) {
    return itens.filter((i) => i.id !== id)
  }
  return itens.map((i) => (i.id === id ? normalizarItemCarrinho({ ...i, quantidade }) : i))
}

function applyItemDiscount(item: ItemCarrinho, descontoValor: number): ItemCarrinho {
  const precoOriginal = item.precoOriginal ?? item.precoVariejo ?? item.precoUnitario ?? 0
  const floor = typeof item.precoMinimo === 'number' && item.precoMinimo > 0 ? item.precoMinimo : 0
  const precoComDesconto = Math.max(floor, roundMoney(precoOriginal - descontoValor))
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
}

function mergeItemByProdutoId(itens: ItemCarrinho[], item: ItemCarrinho): ItemCarrinho[] {
  const existe = itens.find((i) => i.produtoId === item.produtoId)
  if (!existe) {
    return [...itens, item]
  }
  return itens.map((i) =>
    i.produtoId === item.produtoId
      ? normalizarItemCarrinho({ ...i, quantidade: i.quantidade + item.quantidade })
      : i,
  )
}

function resolveMaxDescontoGerente(
  maxClamp: number | null | undefined,
  stateMax: number,
): number {
  if (typeof maxClamp === 'number' && Number.isFinite(maxClamp)) {
    return Math.max(0, maxClamp)
  }
  return stateMax
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
      ultimoRemovido: null,

      adicionarItem: (item) =>
        set((state) => {
          const itemNormalizado = normalizarItemCarrinho(item)
          const novosItens = mergeItemByProdutoId(state.itens, itemNormalizado)
          return commitItensComTotais(state, novosItens)
        }),

      removerItem: (id) =>
        set((state) => {
          const index = state.itens.findIndex((i) => i.id === id)
          if (index === -1) return {}
          const removido = state.itens[index]
          const novosItens = state.itens.filter((i) => i.id !== id)
          return { ...commitItensComTotais(state, novosItens), ultimoRemovido: { item: removido, index } }
        }),

      restaurarUltimoRemovido: () =>
        set((state) => {
          const buffer = state.ultimoRemovido
          if (!buffer) return {}
          // Já reposto (ex.: operador re-bipou o mesmo produto) → só limpa o buffer.
          if (state.itens.some((i) => i.id === buffer.item.id)) {
            return { ultimoRemovido: null }
          }
          const novosItens = [...state.itens]
          novosItens.splice(Math.min(buffer.index, novosItens.length), 0, buffer.item)
          return { ...commitItensComTotais(state, novosItens), ultimoRemovido: null }
        }),

      atualizarQuantidade: (id, quantidade) =>
        set((state) => commitItensComTotais(state, updateItemQuantity(state.itens, id, quantidade))),

      limparCarrinho: () => set((state) => emptyCartFields(state)),

      setCartOwnerForSession: (userId) =>
        set((state) => {
          if (userId === null) {
            return emptyCartFields(state)
          }

          if (state.cartOwnerUserId === null) {
            return { cartOwnerUserId: userId }
          }

          if (userId !== state.cartOwnerUserId) {
            return { ...emptyCartFields(state), cartOwnerUserId: userId }
          }

          return { cartOwnerUserId: userId }
        }),

      setRegras: (regras) => set({ regras }),

      aplicarDescontoManual: (id, descontoValor) =>
        set((state) => {
          const novosItens = state.itens.map((item) =>
            item.id === id ? applyItemDiscount(item, descontoValor) : item,
          )
          return commitItensComTotais(state, novosItens)
        }),

      aplicarDescontoGerente: (percentual, token = null, maxClamp = null) =>
        set((state) => {
          const maxPermitido = resolveMaxDescontoGerente(maxClamp, state.maxDescontoGerentePercentual)
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
        set((state) => commitItensComTotais(state, updateItemQuantity(state.itens, id, quantidade))),

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
          return commitItensComTotais(state, novosItens)
        }),
    }),
    {
      name: 'pdv-carrinho',
      // `regras`/`pricingCtx` são recarregadas no bootstrap a cada sessão; serializá-las
      // no localStorage a cada mutação (todo bip do caixa) é custo desnecessário no hot-path.
      // Persistimos só os dados do carrinho — itens/totais/dono/desconto — para rehidratar correto.
      partialize: (state) => ({
        itens: state.itens,
        cartOwnerUserId: state.cartOwnerUserId,
        totalBruto: state.totalBruto,
        totalDesconto: state.totalDesconto,
        totalLiquido: state.totalLiquido,
        totalItens: state.totalItens,
        totalUnidades: state.totalUnidades,
        descontoGerentePercentual: state.descontoGerentePercentual,
        descontoGerenteValor: state.descontoGerenteValor,
        descontoGerenteToken: state.descontoGerenteToken,
        maxDescontoGerentePercentual: state.maxDescontoGerentePercentual,
      }),
    },
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
