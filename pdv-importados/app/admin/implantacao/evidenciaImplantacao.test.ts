import { describe, expect, it } from 'vitest'
import { erroEvidenciaConcluido, montarTimeline } from './evidenciaImplantacao'

describe('erroEvidenciaConcluido', () => {
  it('permite PENDENTE sem evidência', () => {
    expect(erroEvidenciaConcluido('PENDENTE', null)).toBeNull()
  })

  it('bloqueia CONCLUIDO sem evidência', () => {
    expect(erroEvidenciaConcluido('CONCLUIDO', '')).toMatch(/Evidência obrigatória/)
    expect(erroEvidenciaConcluido('CONCLUIDO', 'ab')).toMatch(/Evidência obrigatória/)
  })

  it('aceita CONCLUIDO com evidência', () => {
    expect(erroEvidenciaConcluido('CONCLUIDO', 'Venda #8452 PIX')).toBeNull()
  })
})

describe('montarTimeline', () => {
  it('ordena concluídos do mais recente ao mais antigo', () => {
    const tl = montarTimeline([
      {
        key: 'a',
        status: 'CONCLUIDO',
        concluido_em: '2026-07-19T10:00:00.000Z',
        responsavel: 'João',
        observacoes: 'ok',
      },
      {
        key: 'b',
        status: 'CONCLUIDO',
        concluido_em: '2026-07-19T12:00:00.000Z',
        responsavel: 'Maria',
        observacoes: 'venda 1',
      },
      {
        key: 'c',
        status: 'PENDENTE',
        concluido_em: null,
        responsavel: null,
        observacoes: null,
      },
    ])
    expect(tl.map((e) => e.key)).toEqual(['b', 'a'])
  })
})
