import { describe, expect, it } from 'vitest'
import { readFormDataString } from './readFormDataString'

describe('readFormDataString', () => {
  it('lê string de campo texto', () => {
    const fd = new FormData()
    fd.set('nome', '  Loja  ')
    expect(readFormDataString(fd, 'nome')).toBe('  Loja  ')
  })

  it('usa fallback quando ausente', () => {
    const fd = new FormData()
    expect(readFormDataString(fd, 'nome', 'vazio')).toBe('vazio')
  })
})
