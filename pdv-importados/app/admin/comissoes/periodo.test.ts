import { describe, expect, it } from 'vitest'
import { subtrairDiasCivis, ymdHojeNoFusoRelatorio } from '@/lib/relatorios/periodoRelatorio'
import { DE_30D, DE_7D, TODAY } from './page'

/**
 * T9 (auditoria 2026-09-27): "30 dias" em Comissões calculava
 * `isoDay(Date.now() - 30*DIA_MS)` — um dia CIVIL a mais do que os últimos 30
 * dias civis (que terminam hoje), e fatiado em UTC em vez do fuso da loja.
 * Resultado: Comissões (28/08→27/09) não batia com Relatórios (29/08→27/09)
 * para o mesmo preset "30 dias". Agora usa o mesmo `subtrairDiasCivis(hoje, 29)`
 * de `lib/relatorios/periodoRelatorio.ts`.
 */
describe('presets de período (Comissões) — T9', () => {
  it('TODAY é o dia civil de hoje no fuso do relatório, não o dia UTC', () => {
    expect(TODAY).toBe(ymdHojeNoFusoRelatorio())
  })

  it('DE_30D é exatamente 29 dias civis antes de hoje (janela de 30 dias, mesmo cálculo de Relatórios)', () => {
    expect(DE_30D).toBe(subtrairDiasCivis(TODAY, 29))
  })

  it('DE_7D é exatamente 6 dias civis antes de hoje (janela de 7 dias)', () => {
    expect(DE_7D).toBe(subtrairDiasCivis(TODAY, 6))
  })
})
