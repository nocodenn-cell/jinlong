import { describe, expect, it } from 'vitest'
import { motivoBloqueioEditar, motivoBloqueioToggle } from './funcionarioUi'

const L = {
  bloqueioDonoAdmin: 'dono-admin',
  bloqueioSemPermissao: 'sem-permissao',
  bloqueioSiMesmo: 'si-mesmo',
}

describe('funcionarioUi bloqueios', () => {
  it('explica bloqueio de DONO/ADMIN', () => {
    const dono = { id: 'd1', perfil: 'DONO' }
    expect(motivoBloqueioEditar(dono, { id: 'd2', perfil: 'DONO' }, L)).toBe('dono-admin')
    expect(motivoBloqueioEditar(dono, { id: 'a1', perfil: 'ADMIN' }, L)).toBe('dono-admin')
  })

  it('explica falta de permissão entre gerentes', () => {
    const gerente = { id: 'g1', perfil: 'GERENTE' }
    expect(motivoBloqueioEditar(gerente, { id: 'g2', perfil: 'GERENTE' }, L)).toBe('sem-permissao')
  })

  it('permite editar operador e bloqueia auto-desativação', () => {
    const dono = { id: 'd1', perfil: 'DONO' }
    expect(motivoBloqueioEditar(dono, { id: 'o1', perfil: 'OPERADOR' }, L)).toBeNull()
    expect(motivoBloqueioToggle(dono, dono, L)).toBe('si-mesmo')
    expect(motivoBloqueioToggle(dono, { id: 'o1', perfil: 'OPERADOR' }, L)).toBeNull()
  })
})
