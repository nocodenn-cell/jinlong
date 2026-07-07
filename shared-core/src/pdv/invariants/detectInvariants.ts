import { LIMITE_DIVERGENCIA_FECHAMENTO, moneyApproxEqual, roundMoney2 } from './money'
import type { PdvStateSnapshot, PdvViolation } from './types'

const VALID_CAIXA_STATUS = new Set(['ABERTO', 'FECHADO'])
const VENDA_FINAL_STATUS = new Set(['CONCLUIDA', 'CANCELADA'])

export function detectInvariants(snapshot: PdvStateSnapshot): PdvViolation[] {
  const violations: PdvViolation[] = []
  const { caixa, vendas, valorSistemaCalculado } = snapshot

  if (!VALID_CAIXA_STATUS.has(caixa.status)) {
    violations.push({
      code: 'CAIXA_INCONSISTENT',
      message: `Status de caixa inválido: ${caixa.status}`,
      severity: 'error',
      layer: 'invariant',
    })
  }

  if (!caixa.operador_id) {
    violations.push({
      code: 'CAIXA_INCONSISTENT',
      message: 'Caixa sem operador vinculado.',
      severity: 'error',
      layer: 'invariant',
    })
  }

  if (caixa.status === 'FECHADO') {
    if (!caixa.data_fechamento) {
      violations.push({
        code: 'FECHAMENTO_INVALIDO',
        message: 'Caixa FECHADO sem data_fechamento.',
        severity: 'error',
        layer: 'invariant',
      })
    }

    if (caixa.valor_fechamento == null) {
      violations.push({
        code: 'FECHAMENTO_INVALIDO',
        message: 'Caixa FECHADO sem valor_fechamento.',
        severity: 'error',
        layer: 'invariant',
      })
    }

    const diferenca =
      caixa.fechamento_diferenca != null
        ? caixa.fechamento_diferenca
        : caixa.valor_fechamento != null
          ? roundDiff(caixa.valor_fechamento, valorSistemaCalculado)
          : null

    if (
      caixa.valor_fechamento != null &&
      !moneyApproxEqual(caixa.valor_fechamento, valorSistemaCalculado) &&
      diferenca != null &&
      Math.abs(diferenca) > LIMITE_DIVERGENCIA_FECHAMENTO
    ) {
      const obs = (caixa.fechamento_observacao ?? '').trim()
      if (obs.length < 5) {
        violations.push({
          code: 'FECHAMENTO_INVALIDO',
          message: `Divergência acima de R$ ${LIMITE_DIVERGENCIA_FECHAMENTO} sem observação válida.`,
          severity: 'error',
          layer: 'invariant',
        })
      }
    }

    if (
      caixa.valor_fechamento != null &&
      caixa.fechamento_diferenca != null &&
      !moneyApproxEqual(
        caixa.fechamento_diferenca,
        caixa.valor_fechamento - valorSistemaCalculado,
      )
    ) {
      violations.push({
        code: 'FECHAMENTO_INVALIDO',
        message: 'fechamento_diferenca não reconcilia com valor_fechamento e saldo sistema.',
        severity: 'error',
        layer: 'invariant',
      })
    }

    const pendentes = vendas.filter((v) => !VENDA_FINAL_STATUS.has(v.status))
    if (pendentes.length > 0) {
      violations.push({
        code: 'FECHAMENTO_INVALIDO',
        message: `Caixa FECHADO com ${pendentes.length} venda(s) não finalizada(s).`,
        severity: 'error',
        layer: 'invariant',
      })
    }
  }

  return violations
}

function roundDiff(valorFechamento: number, valorSistema: number): number {
  return roundMoney2(valorFechamento - valorSistema)
}
