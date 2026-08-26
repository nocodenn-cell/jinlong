import { describe, expect, it } from 'vitest'
import {
  mergeOpcoesFiltrosPreservandoLocal,
  mergeOpcoesPorId,
} from './mergeOpcoesFiltros'

describe('mergeOpcoesPorId', () => {
  it('preserva id local ausente no servidor e não duplica', () => {
    const server = [{ id: 'a', nome: 'A' }]
    const local = [
      { id: 'a', nome: 'A-old' },
      { id: 'b', nome: 'B-local' },
    ]
    expect(mergeOpcoesPorId(server, local)).toEqual([
      { id: 'a', nome: 'A' },
      { id: 'b', nome: 'B-local' },
    ])
  })

  it('quando servidor já tem o id local, não duplica', () => {
    const server = [
      { id: 'a', nome: 'A' },
      { id: 'b', nome: 'B-server' },
    ]
    const local = [
      { id: 'a', nome: 'A' },
      { id: 'b', nome: 'B-local' },
    ]
    expect(mergeOpcoesPorId(server, local)).toEqual(server)
  })
})

describe('mergeOpcoesFiltrosPreservandoLocal', () => {
  it('aplica merge em categorias, marcas e fornecedores', () => {
    const merged = mergeOpcoesFiltrosPreservandoLocal(
      {
        categorias: [{ id: 'c-local', nome: 'Nova' }],
        marcas: [{ id: 'm1', nome: 'M' }],
        fornecedores: [{ id: 'f-local', nome: 'Forn' }],
      },
      {
        categorias: [{ id: 'c1', nome: 'Existente' }],
        marcas: [{ id: 'm1', nome: 'M-server' }],
        fornecedores: [],
      },
    )
    expect(merged.categorias.map((c) => c.id)).toEqual(['c1', 'c-local'])
    expect(merged.marcas).toEqual([{ id: 'm1', nome: 'M-server' }])
    expect(merged.fornecedores.map((f) => f.id)).toEqual(['f-local'])
  })
})
