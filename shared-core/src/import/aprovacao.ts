/**
 * Guarda pura de aprovação de um cálculo de landed cost.
 *
 * Esta função NÃO aprova nada. Ela apenas informa se um resultado do motor
 * satisfaz as condições técnicas mínimas para ser aprovado. A aprovação real
 * (quem aprovou, quando, com que permissão) é de camada de persistência e
 * autorização, que deve RECALCULAR esta verificação a partir dos dados
 * persistidos e nunca confiar em um flag guardado.
 */

import { ENGINE_VERSION } from './landedCost'
import type { LandedResult } from './types'

export type MotivoBloqueioAprovacao =
  | 'CALCULO_COM_ERRO'
  | 'STATUS_BLOQUEADO'
  | 'DIVERGENCIA_BLOQUEANTE'
  | 'CONSERVACAO_FALHOU'
  | 'VERSAO_MOTOR_DIFERENTE'

export interface ResultadoVerificacaoAprovacao {
  readonly aprovavel: boolean
  readonly motivos: readonly MotivoBloqueioAprovacao[]
}

/**
 * Um cálculo só é aprovável se: não tiver erro de entrada, estiver com status OK,
 * não tiver divergência bloqueante, passar na conservação e tiver sido produzido
 * pela versão atual do motor.
 */
export function verificarAprovacao(resultado: LandedResult): ResultadoVerificacaoAprovacao {
  if (!resultado.ok) return { aprovavel: false, motivos: ['CALCULO_COM_ERRO'] }

  const saida = resultado.value
  const motivos: MotivoBloqueioAprovacao[] = []
  if (saida.status !== 'OK') motivos.push('STATUS_BLOQUEADO')
  if (saida.divergencias.some((d) => d.severidade === 'BLOQUEANTE')) motivos.push('DIVERGENCIA_BLOQUEANTE')
  if (!saida.conservacao.ok) motivos.push('CONSERVACAO_FALHOU')
  if (saida.engine_version !== ENGINE_VERSION) motivos.push('VERSAO_MOTOR_DIFERENTE')

  return { aprovavel: motivos.length === 0, motivos }
}
