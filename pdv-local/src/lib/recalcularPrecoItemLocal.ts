import type { ItemCarrinho } from '@core/stores/unifiedCartStore'
import { useDesktopCartStore } from '../stores/cartStore'
import {
  resolverPrecoCanonicoLocal,
  type PrecoCanonicoSnapshot,
} from './resolverPrecoCanonicoLocal'

/** Mesma hierarquia de `precoVarejoRef` em `sincronizarPrecoCalculadoRpc` (store unificada). */
function resolverPrecoBaseCanonicoItem(item: ItemCarrinho): number {
  const metaRef = item.metaPdv?.precoVarejoReferencia
  if (typeof metaRef === 'number' && Number.isFinite(metaRef)) return metaRef
  return item.precoOriginal ?? item.precoVariejo ?? item.precoUnitario ?? 0
}

function resolverPrecoAtacadoItem(item: ItemCarrinho): number | null {
  const meta = item.metaPdv as { precoAtacadoCatalogo?: number | null } | undefined
  const v = meta?.precoAtacadoCatalogo
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

/**
 * Recalcula preço automático via PRICE_RESOLUTION_CHAIN / calcularPrecoCanonico.
 * Não recalcula linhas MANUAL/PROMOCAO.
 */
export function recalcularPrecoItemLocal(
  item: ItemCarrinho,
  novaQuantidade: number,
  snap: PrecoCanonicoSnapshot,
): void {
  const tipoAtual = item.resultado?.tipoPreco
  if (tipoAtual === 'MANUAL' || tipoAtual === 'PROMOCAO') return
  if (!Number.isFinite(novaQuantidade) || novaQuantidade <= 0) return

  const precoVarejo = resolverPrecoBaseCanonicoItem(item)
  const resultado = resolverPrecoCanonicoLocal(
    {
      id: item.produtoId,
      ativo: true,
      preco_varejo: precoVarejo,
      preco_atacado: resolverPrecoAtacadoItem(item),
    },
    novaQuantidade,
    snap,
  )
  if (resultado.tipoPreco !== 'VAREJO' && resultado.tipoPreco !== 'ATACADO') return

  useDesktopCartStore.getState().sincronizarPrecoCalculadoRpc(item.id, {
    precoUnitario: resultado.precoUnitario,
    tipoPreco: resultado.tipoPreco,
    quantidadeMinima: resultado.quantidadeMinima,
  })
}
