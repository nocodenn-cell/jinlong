import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ItemCarrinho {
  id: string;
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  precoOriginal: number;
  nome: string;
  descricao?: string;
  sku?: string;
  imagem?: string;
  metaPdv?: Record<string, any>;
  variantes?: Record<string, any>;
  resultado: {
    precoUnitario: number;
    precoOriginal: number;
    descontoUnitario: number;
    tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO';
  };
}

export interface CarrinhoState {
  itens: ItemCarrinho[];
  cartOwnerUserId: string | null;
  totalBruto: number;
  totalDesconto: number;
  totalLiquido: number;
  totalItens: number;
  totalUnidades: number;
  regras: any[];
  adicionarItem: (item: ItemCarrinho) => void;
  removerItem: (id: string) => void;
  atualizarQuantidade: (id: string, quantidade: number) => void;
  limparCarrinho: () => void;
  setCartOwnerForSession: (userId: string | null) => void;
  setRegras: (regras: any[]) => void;
  alterarQuantidade: (id: string, quantidade: number) => void;
}

// Função auxiliar para recalcular totais
function recalcularTotais(itens: ItemCarrinho[]) {
  const totalBruto = itens.reduce(
    (acc, item) => acc + item.precoOriginal * item.quantidade,
    0
  );
  const totalLiquido = itens.reduce(
    (acc, item) => acc + item.precoUnitario * item.quantidade,
    0
  );
  const totalDesconto = totalBruto - totalLiquido;
  const totalItens = itens.length;
  const totalUnidades = itens.reduce((acc, item) => acc + item.quantidade, 0);

  return {
    totalBruto: Math.round(totalBruto * 100) / 100,
    totalDesconto: Math.round(totalDesconto * 100) / 100,
    totalLiquido: Math.round(totalLiquido * 100) / 100,
    totalItens,
    totalUnidades,
  };
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

      adicionarItem: (item) =>
        set((state) => {
          const existe = state.itens.find((i) => i.id === item.id);
          let novosItens;
          if (existe) {
            novosItens = state.itens.map((i) =>
              i.id === item.id
                ? { ...i, quantidade: i.quantidade + item.quantidade }
                : i
            );
          } else {
            novosItens = [...state.itens, item];
          }
          const totais = recalcularTotais(novosItens);
          return {
            itens: novosItens,
            ...totais,
          };
        }),

      removerItem: (id) =>
        set((state) => {
          const novosItens = state.itens.filter((i) => i.id !== id);
          const totais = recalcularTotais(novosItens);
          return {
            itens: novosItens,
            ...totais,
          };
        }),

      atualizarQuantidade: (id, quantidade) =>
        set((state) => {
          if (quantidade <= 0) {
            const novosItens = state.itens.filter((i) => i.id !== id);
            const totais = recalcularTotais(novosItens);
            return {
              itens: novosItens,
              ...totais,
            };
          }
          const novosItens = state.itens.map((i) =>
            i.id === id ? { ...i, quantidade } : i
          );
          const totais = recalcularTotais(novosItens);
          return {
            itens: novosItens,
            ...totais,
          };
        }),

      limparCarrinho: () =>
        set({
          itens: [],
          totalBruto: 0,
          totalDesconto: 0,
          totalLiquido: 0,
          totalItens: 0,
          totalUnidades: 0,
        }),

      setCartOwnerForSession: (userId) => set({ cartOwnerUserId: userId }),
      setRegras: (regras) => set({ regras }),
      alterarQuantidade: (id, quantidade) => set((state) => {
        const novosItens = state.itens.map((i) =>
          i.id === id ? { ...i, quantidade } : i
        );
        const totais = recalcularTotais(novosItens);
        return {
          itens: novosItens,
          ...totais,
        };
      }),
    }),
    {
      name: 'pdv-carrinho',
    }
  )
);

export function calcularTotais(itens: ItemCarrinho[]) {
  return recalcularTotais(itens);
}

export function calcularTotaisComGerente(
  itens: ItemCarrinho[],
  descontoPercentual: number
) {
  const { totalBruto, totalLiquido, totalItens, totalUnidades } =
    recalcularTotais(itens);
  const descontoValor = (totalBruto * descontoPercentual) / 100;
  return {
    totalBruto,
    totalLiquido: totalLiquido - descontoValor,
    totalItens,
    totalUnidades,
    descontoValor,
  };
}

export type ItemCarrinhoComPreco = ItemCarrinho;
