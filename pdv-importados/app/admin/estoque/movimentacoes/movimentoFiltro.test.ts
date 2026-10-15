import { describe, expect, it } from 'vitest'
import {
  fimDiaSaoPauloIso,
  inicioDiaSaoPauloIso,
  normalizarPeriodoMovimento,
  tipoMovimentoFiltro,
} from './movimentoFiltro'

describe('filtro de movimentações', () => {
  it('aceita dias válidos e troca o intervalo invertido', () => {
    expect(normalizarPeriodoMovimento('2026-10-12', '2026-10-01')).toEqual({
      de: '2026-10-01',
      ate: '2026-10-12',
    })
  })

  it('ignora datas impossíveis e tipo fora da lista', () => {
    expect(normalizarPeriodoMovimento('2026-02-31', 'abc')).toEqual({ de: null, ate: null })
    expect(tipoMovimentoFiltro('VENDA')).toBe('VENDA')
    expect(tipoMovimentoFiltro('DROP')).toBeNull()
  })

  it('cobre o dia civil de São Paulo em UTC', () => {
    expect(inicioDiaSaoPauloIso('2026-10-12')).toBe('2026-10-12T03:00:00.000Z')
    expect(fimDiaSaoPauloIso('2026-10-12')).toBe('2026-10-13T02:59:59.999Z')
  })
})
