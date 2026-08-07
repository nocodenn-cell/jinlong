import { describe, expect, it } from 'vitest'
import { getPeriodRange, type DashboardPeriod } from './dashboardUtils'

/**
 * Guarda contra "link falso" no drill-down dos KPIs.
 *
 * O dashboard e a tela de vendas calculam janelas de período de formas
 * diferentes. Um KPI só pode virar link quando o destino reproduz EXATAMENTE o
 * mesmo intervalo — senão o operador clica em um número e aterrissa em outro.
 *
 * Este teste replica a regra de `/admin/vendas` (`periodoInicio`) para provar
 * onde há equivalência e onde não há. Se alguém unificar as duas fontes de
 * período no futuro, este teste falha e obriga a revisitar o mapeamento — que é
 * o comportamento desejado.
 */

const DIA_MS = 86_400_000
const AGORA = new Date('2026-08-07T15:30:00')

/** Cópia da regra de `app/admin/vendas/page.tsx` — só para comparação. */
function vendasPeriodoInicio(periodo: string, now: Date): Date | null {
  if (periodo === 'hoje') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS)
  if (periodo === 'mes') {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return null
}

function inicioDashboard(period: DashboardPeriod): Date {
  return getPeriodRange(period, AGORA).start
}

describe('drill-down de KPI — equivalência de período', () => {
  it('TODAY e "hoje" começam no mesmo instante (link é honesto)', () => {
    expect(inicioDashboard('TODAY').getTime()).toBe(
      vendasPeriodoInicio('hoje', AGORA)!.getTime(),
    )
  })

  it('7D e "7d" NÃO são o mesmo intervalo — por isso não há link', () => {
    const dash = inicioDashboard('7D').getTime()
    const vendas = vendasPeriodoInicio('7d', AGORA)!.getTime()
    expect(dash).not.toBe(vendas)
    // Dashboard alinha em meia-noite; vendas usa janela móvel de 168h.
    expect(Math.abs(dash - vendas)).toBeGreaterThan(60 * 60 * 1000)
  })

  it('30D e "mes" NÃO são o mesmo intervalo — por isso não há link', () => {
    const dash = inicioDashboard('30D').getTime()
    const vendas = vendasPeriodoInicio('mes', AGORA)!.getTime()
    expect(dash).not.toBe(vendas)
  })

  it('a tela de vendas não oferece nenhuma opção de "últimos 30 dias"', () => {
    const opcoesVendas = ['tudo', 'hoje', 'ontem', '7d', 'mes']
    const alvo = inicioDashboard('30D').getTime()
    const casaAlguma = opcoesVendas.some(
      (p) => vendasPeriodoInicio(p, AGORA)?.getTime() === alvo,
    )
    expect(casaAlguma).toBe(false)
  })
})
