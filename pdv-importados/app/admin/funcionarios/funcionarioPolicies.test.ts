import { describe, expect, it } from 'vitest'
import {
  podeAtribuirPerfil,
  podeDesativarAlvo,
  podeEditarAlvo,
  perfisAtribuiveisPorAtor,
} from './funcionarioPolicies'

describe('funcionarioPolicies', () => {
  it('GERENTE só atribui OPERADOR', () => {
    expect(perfisAtribuiveisPorAtor('GERENTE')).toEqual(['OPERADOR'])
    expect(podeAtribuirPerfil('GERENTE', 'OPERADOR')).toBe(true)
    expect(podeAtribuirPerfil('GERENTE', 'GERENTE')).toBe(false)
  })

  it('DONO atribui OPERADOR e GERENTE, nunca ADMIN', () => {
    expect(perfisAtribuiveisPorAtor('DONO')).toEqual(['OPERADOR', 'GERENTE'])
    expect(podeAtribuirPerfil('DONO', 'ADMIN')).toBe(false)
  })

  it('GERENTE não edita GERENTE/DONO', () => {
    const gerente = { id: 'g1', perfil: 'GERENTE' }
    expect(podeEditarAlvo(gerente, { id: 'o1', perfil: 'OPERADOR' })).toBe(true)
    expect(podeEditarAlvo(gerente, { id: 'g2', perfil: 'GERENTE' })).toBe(false)
    expect(podeEditarAlvo(gerente, { id: 'd1', perfil: 'DONO' })).toBe(false)
  })

  it('DONO não edita DONO pela UI', () => {
    const dono = { id: 'd1', perfil: 'DONO' }
    expect(podeEditarAlvo(dono, dono)).toBe(false)
    expect(podeEditarAlvo(dono, { id: 'g1', perfil: 'GERENTE' })).toBe(true)
  })

  it('não desativa a si mesmo', () => {
    const dono = { id: 'd1', perfil: 'DONO' }
    expect(podeDesativarAlvo(dono, dono)).toBe(false)
    expect(podeDesativarAlvo(dono, { id: 'o1', perfil: 'OPERADOR' })).toBe(true)
  })
})

describe('banDurationParaAtivo (revogação de sessão ao inativar)', () => {
  it('inativar bloqueia no Auth; reativar desbloqueia', async () => {
    const { banDurationParaAtivo } = await import('./funcionarioPolicies')
    expect(banDurationParaAtivo(false)).toBe('876000h')
    expect(banDurationParaAtivo(true)).toBe('none')
  })
})
