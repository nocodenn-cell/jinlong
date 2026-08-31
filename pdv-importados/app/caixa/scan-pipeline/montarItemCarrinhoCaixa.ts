import type { ItemCarrinho } from '../../../../shared-core/src/stores/unifiedCartStore'
import type { Mensagens } from '@/i18n/getMessages'
import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

/**
 * Monta o item de carrinho a partir de um produto já resolvido (preço
 * autoritativo já calculado) — SSOT único usado tanto pelo scan/Enter
 * (`webCaixaScanProcess.ts`) quanto pela seleção manual de um candidato numa
 * ambiguidade de busca (`CaixaPageClient.tsx`). Extraído para não duplicar a
 * forma do item (Onda 2 · Bloco 1) — ver Fase 2 da matriz, "fortalece SSoT".
 */
export function montarItemCarrinhoCaixa(
  produto: ProdutoCaixaDTO,
  precoCalculado: number,
  tipoPrecoCalculado: 'VAREJO' | 'ATACADO',
  quantidade: number = 1,
): ItemCarrinho {
  return {
    id: `${produto.id}-${Date.now()}`,
    produtoId: produto.id,
    nome: produto.nome,
    quantidade,
    precoUnitario: precoCalculado,
    precoOriginal: precoCalculado,
    resultado: {
      precoUnitario: precoCalculado,
      precoOriginal: precoCalculado,
      descontoUnitario: 0,
      tipoPreco: tipoPrecoCalculado,
    },
    metaPdv: {
      origem: produto.origem,
      tem_nf: produto.tem_nf,
      observacao: produto.observacao,
      estoque_atual: produto.quantidade_estoque,
      estoque_minimo: produto.estoque_minimo,
      categoriaId: produto.categoria_id,
      precoAtacado: produto.preco_atacado,
      precoVarejoReferencia: produto.preco_varejo,
    },
  }
}

/** Mesma regra de aviso de estoque usada no scan — extraída para reuso na seleção manual de candidato. */
export function avisoEstoqueCaixa(produto: ProdutoCaixaDTO, m: Mensagens): string | null {
  const q = produto.quantidade_estoque
  const min = produto.estoque_minimo
  if (q !== null && q < 1) {
    return `${m.caixa.item_adicionado} ${m.caixa.estoque_baixo}`
  }
  if (q !== null && min !== null && q <= min) {
    return `${m.caixa.item_adicionado} ${m.caixa.estoque_abaixo_minimo}`
  }
  return null
}
