import type {
  AplicarDescontoGerenteInput,
  AplicarDescontoGerenteResult,
  ValidarPercentualPermitidoResult,
} from './types'

/**
 * Teto padrão (em %) de desconto que um gerente pode autorizar.
 * Mantido alinhado com o fallback da Edge Function `validar-gerente`
 * e da coluna `pdv_config.max_desconto_gerente_percentual` quando ausente.
 *
 * Fonte autoritativa em produção: `pdv_config.max_desconto_gerente_percentual`.
 * Esta constante é apenas defesa em profundidade no cliente offline.
 */
export const DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL = 20

/**
 * Teto padrão (em %) de desconto manual que o operador aplica em UM item, sem
 * autorização de gerente.
 *
 * Fonte autoritativa: `pdv_config.max_desconto_manual_item_percentual`, aplicada
 * pelo trigger `trg_fn_itens_venda_limite_desconto` (migration 122) e entregue ao
 * caixa web por `pdv_config_para_caixa_web()` (migration 313).
 *
 * Esta constante NÃO é o limite: é só o fallback para quando a configuração não
 * pôde ser lida (PDV offline, `pdv_config` sem linha). O valor espelha o default
 * da coluna — 122:26 `DEFAULT 15.00`.
 */
export const DEFAULT_MAX_DESCONTO_MANUAL_ITEM_PERCENTUAL = 15

function roundMoney(valor: number): number {
  return Math.round(valor * 100) / 100
}

function sanitizarNumero(valor: number, fallback: number): number {
  return Number.isFinite(valor) ? valor : fallback
}

/**
 * Garante que o percentual aplicado nunca exceda o teto autorizado e
 * nunca seja negativo. Retorna 0 se o teto for inválido.
 */
export function clampPercentualDesconto(percentual: number, maxPermitido: number): number {
  const tetoSeguro = sanitizarNumero(maxPermitido, 0)
  if (tetoSeguro <= 0) return 0
  const pctSeguro = sanitizarNumero(percentual, 0)
  if (pctSeguro <= 0) return 0
  return Math.min(pctSeguro, tetoSeguro)
}

/**
 * Calcula o valor (R$) do desconto sobre o total líquido a partir de um
 * percentual já validado. Não aplica clamp — chame `clampPercentualDesconto`
 * antes se houver dúvida sobre a entrada.
 */
export function calcularDescontoGerenteValor(totalLiquido: number, percentualClamped: number): number {
  const totalSeguro = sanitizarNumero(totalLiquido, 0)
  const pctSeguro = sanitizarNumero(percentualClamped, 0)
  if (totalSeguro <= 0 || pctSeguro <= 0) return 0
  return roundMoney((totalSeguro * pctSeguro) / 100)
}

/**
 * Avalia se um percentual solicitado é aceitável dado o teto autorizado.
 * Útil para mostrar mensagens explícitas de UI antes de tentar aplicar.
 */
export function validarPercentualPermitido(
  percentual: number,
  maxPermitido: number,
): ValidarPercentualPermitidoResult {
  const tetoSeguro = sanitizarNumero(maxPermitido, NaN)
  if (!Number.isFinite(tetoSeguro) || tetoSeguro < 0) {
    return { ok: false, motivo: 'TETO_NEGATIVO' }
  }
  const pctSeguro = sanitizarNumero(percentual, NaN)
  if (!Number.isFinite(pctSeguro) || pctSeguro < 0) {
    return { ok: false, motivo: 'PERCENTUAL_NEGATIVO' }
  }
  if (pctSeguro > tetoSeguro) {
    return { ok: false, motivo: 'PERCENTUAL_ACIMA_DO_LIMITE' }
  }
  return { ok: true }
}

/**
 * Pipeline canônico: clamp + cálculo de valor + total líquido final.
 * Usar nos consumidores para garantir o mesmo arredondamento web/local.
 */
export function aplicarDescontoGerenteSobreTotal(
  input: AplicarDescontoGerenteInput,
): AplicarDescontoGerenteResult {
  const percentualClamped = clampPercentualDesconto(input.percentual, input.maxPermitido)
  const totalSeguro = sanitizarNumero(input.totalLiquido, 0)
  const descontoValor = calcularDescontoGerenteValor(totalSeguro, percentualClamped)
  const totalLiquidoComDesconto = roundMoney(totalSeguro - descontoValor)
  return {
    percentualClamped,
    descontoValor,
    totalLiquidoComDesconto,
  }
}
