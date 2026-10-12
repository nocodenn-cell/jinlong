import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'

/** Mesma tolerância de `recalcularItensNoServidor` (não é regra comercial nova). */
export const EPS_PRECO_CLIENTE = 0.02

export type TipoPrecoCliente = 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'

export type CodigoDivergenciaPreco =
  | 'preco_acima_referencia'
  | 'tipo_preco_mudou'
  | 'preco_diverge_cadastro'
  | 'preco_ref_varejo_inconsistente'
  | 'preco_ref_atacado_inconsistente'

/** MANUAL/PROMOCAO: o unitário não pode ultrapassar a referência enviada. */
export function divergenciaPrecoDiscricionario(
  precoOriginal: number,
  precoUnitario: number,
): 'preco_acima_referencia' | null {
  const original = roundMoney2(precoOriginal)
  const unitario = roundMoney2(precoUnitario)
  if (unitario > original + EPS_PRECO_CLIENTE) return 'preco_acima_referencia'
  return null
}

/**
 * VAREJO/ATACADO: o cliente não é autoridade. O tipo e o unitário têm de bater
 * com a RPC; o original tem de ser o varejo do cadastro.
 */
export function divergenciaPrecoAutomatico(input: {
  tipoPreco: TipoPrecoCliente
  precoOriginal: number
  precoUnitario: number
  varejoCadastro: number
  esperadoPreco: number
  esperadoTipo: 'VAREJO' | 'ATACADO'
}): CodigoDivergenciaPreco | null {
  if (input.esperadoTipo !== input.tipoPreco) return 'tipo_preco_mudou'
  if (Math.abs(input.esperadoPreco - roundMoney2(input.precoUnitario)) > EPS_PRECO_CLIENTE) {
    return 'preco_diverge_cadastro'
  }
  const varejo = roundMoney2(input.varejoCadastro)
  const original = roundMoney2(input.precoOriginal)
  if (Math.abs(varejo - original) <= EPS_PRECO_CLIENTE) return null
  if (input.tipoPreco === 'VAREJO') return 'preco_ref_varejo_inconsistente'
  if (input.tipoPreco === 'ATACADO') return 'preco_ref_atacado_inconsistente'
  return 'preco_diverge_cadastro'
}
