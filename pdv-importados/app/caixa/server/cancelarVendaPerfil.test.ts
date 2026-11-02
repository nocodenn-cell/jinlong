import { describe, expect, it } from 'vitest'
import { perfilPodeCancelarVenda } from './cancelarVendaPerfil'

describe('perfilPodeCancelarVenda (BA-013)', () => {
  it('bloqueia OPERADOR e ausência', () => {
    expect(perfilPodeCancelarVenda('OPERADOR')).toBe(false)
    expect(perfilPodeCancelarVenda(null)).toBe(false)
    expect(perfilPodeCancelarVenda(undefined)).toBe(false)
  })

  it('permite GERENTE e DONO; ADMIN legado não', () => {
    expect(perfilPodeCancelarVenda('GERENTE')).toBe(true)
    expect(perfilPodeCancelarVenda('DONO')).toBe(true)
    expect(perfilPodeCancelarVenda('ADMIN')).toBe(false)
  })
})
