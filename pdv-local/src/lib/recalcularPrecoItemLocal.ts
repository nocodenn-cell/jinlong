import type { ItemCarrinho } from '@core/stores/unifiedCartStore'
import type { PricingContext, RegraPreco } from '@core/pricing/types'
import { pricingService } from '@shared/pricing/PricingService'
import { useDesktopCartStore } from '../stores/cartStore'

/**
 * Recalcula localmente o preço de um item do carrinho após alteração de
 * quantidade — mesmo `PricingService`/regras já usados ao adicionar o item
 * (offline-first, sem chamada de rede).
 *
 * Não recalcula linhas MANUAL/PROMOCAO (preço já é uma decisão manual/override).
 */
export function recalcularPrecoItemLocal(
  item: ItemCarrinho,
  novaQuantidade: number,
  regras: RegraPreco[],
  pricingCtx: PricingContext,
): void {
  const tipoAtual = item.resultado?.tipoPreco
  if (tipoAtual === 'MANUAL' || tipoAtual === 'PROMOCAO') return
  if (!Number.isFinite(novaQuantidade) || novaQuantidade <= 0) return

  const resultado = pricingService.calcularPrecoItem(
    { ...item, quantidade: novaQuantidade },
    regras,
    pricingCtx,
  )
  if (resultado.tipoPreco !== 'VAREJO' && resultado.tipoPreco !== 'ATACADO') return

  useDesktopCartStore.getState().sincronizarPrecoCalculadoRpc(item.id, {
    precoUnitario: resultado.precoUnitario,
    tipoPreco: resultado.tipoPreco,
  })
}
