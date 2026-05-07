import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ItemCarrinho {
  id: string
  produtoId: string
  quantidade: number
  precoUnitario: number
  precoOriginal: number
  nome: string
  descricao?: string
  sku?: string
  imagem?: string
  metaPdv?: Record<string, any>
  variantes?: Record<string, any>
  resultado: {
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
  aplicarDescontoGerente: (percentual: number, token?: string | null, maxClamp?: number | null) => void
  setMaxDescontoGerentePercentual: (valor: number) => void
}

function recalcularTotais(itens: ItemCarrinho[]) {
  const totalBruto = itens.reduce((acc, item) => acc + item.precoOriginal * item.quantidade, 0)
  const totalLiquido = itens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0)
  const totalDesconto = totalBruto - totalLiquido
  const totalItens = itens.length
  const totalUnidades = itens.reduce((acc, item) => acc + item.quantidade, 0)

  return {
    totalBruto: Math.round(totalBruto * 100) / 100,
    totalDesconto: Math.round(totalDesconto * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    totalItens,
    totalUnidades,
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
      descontoGerentePercentual: 0,
      descontoGerenteValor: 0,
      descontoGerenteToken: null,
      maxDescontoGerentePercentual: 20,

      adicionarItem: (item) =>
        set((state) => {
          const existe = state.itens.find((i) => i.id === item.id)
          const novosItens = existe
            ? state.itens.map((i) => (i.id === item.id ? { ...i, quantidade: i.quantidade + item.quantidade } : i))
            : [...state.itens, item]

          return { itens: novosItens, ...recalcularTotais(novosItens) }
        }),

      removerItem: (id) =>
        set((state) => {
          const novosItens = state.itens.filter((i) => i.id !== id)
          return { itens: novosItens, ...recalcularTotais(novosItens) }
        }),

      atualizarQuantidade: (id, quantidade) =>
        set((state) => {
          if (quantidade <= 0) {
            const novosItens = state.itens.filter((i) => i.id !== id)
            return { itens: novosItens, ...recalcularTotais(novosItens) }
          }
          const novosItens = state.itens.map((i) => (i.id === id ? { ...i, quantidade } : i))
          return { itens: novosItens, ...recalcularTotais(novosItens) }
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
        })),

      setCartOwnerForSession: (userId) =>
        set((state) => {
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
            }
          }
          return { cartOwnerUserId: userId }
        }),

      setRegras: (regras) => set({ regras }),
      aplicarDescontoGerente: () => undefined,
      setMaxDescontoGerentePercentual: () => undefined,

      alterarQuantidade: (id, quantidade) =>
        set((state) => {
          const novosItens = state.itens.map((i) => (i.id === id ? { ...i, quantidade } : i))
          return { itens: novosItens, ...recalcularTotais(novosItens) }
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
  const descontoGerenteValor = (totalLiquido * descontoPercentual) / 100
  return {
    totalBruto,
    totalLiquido: totalLiquido - descontoGerenteValor,
    totalDesconto: totalBruto - (totalLiquido - descontoGerenteValor),
    descontoGerenteValor,
    totalItens,
    totalUnidades,
  }
}

export type ItemCarrinhoComPreco = ItemCarrinho
