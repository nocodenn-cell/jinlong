import { describe, expect, it } from 'vitest'
import { lerFuncionariosListaEstado, serializarFuncionariosListaEstado } from './funcionarioListaEstado'

describe('estado da lista de funcionários', () => {
  it('restaura busca, filtros e posição', () => {
    const bruto = serializarFuncionariosListaEstado({
      termo: 'ana',
      status: 'ativos',
      perfil: 'OPERADOR',
      scrollY: 240,
      adminAberto: true,
    })
    expect(lerFuncionariosListaEstado(bruto)).toEqual({
      termo: 'ana',
      status: 'ativos',
      perfil: 'OPERADOR',
      scrollY: 240,
      adminAberto: true,
    })
  })

  it('ignora JSON inválido', () => {
    expect(lerFuncionariosListaEstado('{')).toBeNull()
    expect(lerFuncionariosListaEstado(null)).toBeNull()
  })
})
