import { describe, expect, it } from 'vitest'
import {
  inicioDoDiaCivilEmUtc,
  subtrairDiasCivis,
  ymdHojeNoFusoRelatorio,
} from '@/lib/relatorios/periodoRelatorio'
import { periodoInicio } from './page'

/**
 * T9 (auditoria 2026-09-27): o preset "mes" da tela Vendas é rotulado "30
 * dias" (`m.admin.dashboard.period30d`), mas calculava o início do MÊS CIVIL
 * atual — "30 dias" virava "mês atual". Este teste falha com a implementação
 * antiga (`d.setDate(1)`) e passa com a nova (últimos 30 dias civis, mesmo
 * cálculo que Relatórios usa).
 */
describe('periodoInicio (Vendas) — T9', () => {
  it('"mes" é uma janela de 30 dias civis, igual ao rótulo — não o mês civil atual', () => {
    const hoje = ymdHojeNoFusoRelatorio()
    const esperado = inicioDoDiaCivilEmUtc(subtrairDiasCivis(hoje, 29)).toISOString()
    expect(periodoInicio('mes')).toBe(esperado)
  })

  it('"hoje" é a meia-noite civil no fuso da loja, não a meia-noite do servidor', () => {
    const hoje = ymdHojeNoFusoRelatorio()
    expect(periodoInicio('hoje')).toBe(inicioDoDiaCivilEmUtc(hoje).toISOString())
  })

  it('"tudo" não tem limite inferior', () => {
    expect(periodoInicio('tudo')).toBeNull()
  })
})
