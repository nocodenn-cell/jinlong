import { moneyApproxEqual, roundMoney2 } from './money'
import type { PdvItemVendaRow, PdvStateSnapshot, PdvViolation } from './types'

export function detectModeViolations(snapshot: PdvStateSnapshot): PdvViolation[] {
  const violations: PdvViolation[] = []
  const { caixa, vendas, itensPorVenda } = snapshot

  for (const venda of vendas) {
    if (venda.caixa_id !== caixa.id) {
      violations.push({
        code: 'VENDA_CAIXA_DIVERGENTE',
        message: `Venda ${venda.id} não pertence ao caixa ${caixa.id}.`,
        severity: 'warning',
        layer: 'mode',
      })
    }

    if (!venda.caixa_id) {
      violations.push({
        code: 'VENDA_ORFA',
        message: `Venda ${venda.id} sem caixa_id.`,
        severity: 'warning',
        layer: 'mode',
      })
    }

    const itens = itensPorVenda[venda.id] ?? []
    const somaItens = roundMoney2(
      itens.reduce((sum, item) => sum + itemLineTotal(item), 0),
    )

    if (itens.length > 0 && !moneyApproxEqual(somaItens, venda.total_liquido)) {
      violations.push({
        code: 'VENDA_TOTAL_DIVERGENTE',
        message: `Venda ${venda.id}: total_liquido (${venda.total_liquido}) ≠ soma itens (${somaItens}).`,
        severity: 'warning',
        layer: 'mode',
      })
    }
  }

  if (
    caixa.status === 'FECHADO' &&
    caixa.valor_fechamento != null &&
    !moneyApproxEqual(caixa.valor_fechamento, snapshot.valorSistemaCalculado) &&
    (caixa.fechamento_diferenca == null ||
      !moneyApproxEqual(
        caixa.fechamento_diferenca,
        caixa.valor_fechamento - snapshot.valorSistemaCalculado,
      ))
  ) {
    violations.push({
      code: 'FECHAMENTO_RECONCILIACAO',
      message: 'Fechamento não reconcilia valor contado com saldo sistema.',
      severity: 'warning',
      layer: 'mode',
    })
  }

  return violations
}

function itemLineTotal(item: PdvItemVendaRow): number {
  const unit = item.preco_unitario - (item.desconto_unitario ?? 0)
  return item.quantidade * unit
}
