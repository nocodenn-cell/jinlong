import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { formatLinhaAtividade, interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import type { DashboardAtividadeRecente } from '@/lib/gerente/dashboardResumoTypes'

describe('formatDashboardAtividade', () => {
  it('interpolateTemplate substitui chaves', () => {
    expect(interpolateTemplate('a {{x}} b', { x: '1' })).toBe('a 1 b')
  })

  it('formata VENDA e CAIXA a partir do payload (pt-BR)', () => {
    const m = getMessages('pt')
    const di = m.gerente.dashboard_inicio
    const v: DashboardAtividadeRecente = {
      data_hora: '',
      tipo: 'VENDA',
      payload: { total_liquido: 10 },
    }
    expect(formatLinhaAtividade(di, 'pt-BR', v)).toContain('10')
    const c: DashboardAtividadeRecente = {
      data_hora: '',
      tipo: 'CAIXA',
      payload: { tipo_movimento: 'sangria', valor: 5, motivo: 'troco' },
    }
    expect(formatLinhaAtividade(di, 'pt-BR', c)).toContain('Sangria')
    expect(formatLinhaAtividade(di, 'pt-BR', c)).toContain('troco')
  })

  it('mantém descricao legada quando não há payload', () => {
    const m = getMessages('zh')
    const di = m.gerente.dashboard_inicio
    const a: DashboardAtividadeRecente = {
      data_hora: '',
      tipo: 'VENDA',
      descricao: 'legado',
    }
    expect(formatLinhaAtividade(di, 'zh-CN', a)).toBe('legado')
  })
})
