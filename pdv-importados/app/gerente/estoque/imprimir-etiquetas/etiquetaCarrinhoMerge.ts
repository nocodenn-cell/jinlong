import type { ItemCarrinho } from '@/lib/etiqueta/types'

/** Produto mínimo aceito pelo carrinho de etiquetas. */
export type ProdutoParaEtiqueta = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
}

const QTD_MIN = 1
const QTD_MAX = 500

/** Normaliza quantidade de etiquetas para inteiro entre 1 e 500. */
export function normalizarQuantidadeEtiqueta(qtd: number | undefined): number {
  if (!Number.isFinite(qtd)) return QTD_MIN
  return Math.min(QTD_MAX, Math.max(QTD_MIN, Math.floor(qtd as number)))
}

export function toCarrinhoItem(
  produto: ProdutoParaEtiqueta,
  quantidade = QTD_MIN,
): ItemCarrinho {
  return {
    produtoId: produto.id,
    nome: produto.nome,
    codigoBarras: produto.codigo_barras || '',
    precoVarejo: produto.preco_varejo,
    quantidade: normalizarQuantidadeEtiqueta(quantidade),
  }
}

/**
 * Mescla produtos no carrinho. Já presente: soma `incremento` (padrão 1).
 * Novo: entra com `incremento`. Função pura — não muta a lista recebida.
 */
export function mesclarProdutosNoCarrinho(
  carrinho: readonly ItemCarrinho[],
  produtos: readonly ProdutoParaEtiqueta[],
  incremento = QTD_MIN,
): ItemCarrinho[] {
  const delta = normalizarQuantidadeEtiqueta(incremento)
  const next = [...carrinho]
  for (const produto of produtos) {
    const idx = next.findIndex((item) => item.produtoId === produto.id)
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        quantidade: normalizarQuantidadeEtiqueta(next[idx].quantidade + delta),
      }
    } else {
      next.push(toCarrinhoItem(produto, delta))
    }
  }
  return next
}
