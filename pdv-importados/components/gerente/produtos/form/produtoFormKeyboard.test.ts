import { describe, it, expect } from 'vitest'
import { acaoTecladoProduto } from './produtoFormKeyboard'

const ev = (over: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({
  key: 'Enter',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
})

describe('acaoTecladoProduto', () => {
  it('Ctrl+Enter → publicar', () => {
    expect(acaoTecladoProduto(ev({ ctrlKey: true }), { editando: false })).toBe('publicar')
    expect(acaoTecladoProduto(ev({ ctrlKey: true }), { editando: true })).toBe('publicar')
  })

  it('Cmd+Enter (mac) → publicar', () => {
    expect(acaoTecladoProduto(ev({ metaKey: true }), { editando: false })).toBe('publicar')
  })

  it('Ctrl+Shift+Enter → salvar-continuar apenas na criação', () => {
    expect(acaoTecladoProduto(ev({ ctrlKey: true, shiftKey: true }), { editando: false })).toBe(
      'salvar-continuar',
    )
    expect(acaoTecladoProduto(ev({ ctrlKey: true, shiftKey: true }), { editando: true })).toBeNull()
  })

  it('sem modificador ou tecla diferente → null', () => {
    expect(acaoTecladoProduto(ev({}), { editando: false })).toBeNull()
    expect(acaoTecladoProduto(ev({ key: 'a', ctrlKey: true }), { editando: false })).toBeNull()
  })
})
