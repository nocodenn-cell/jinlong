import { describe, expect, it } from 'vitest'
import { normalizePerfilUsuario } from './normalizePerfilUsuario'

describe('normalizePerfilUsuario', () => {
  it('returns valid profiles as-is (uppercase)', () => {
    expect(normalizePerfilUsuario('OPERADOR')).toBe('OPERADOR')
    expect(normalizePerfilUsuario('GERENTE')).toBe('GERENTE')
    expect(normalizePerfilUsuario('DONO')).toBe('DONO')
    expect(normalizePerfilUsuario('ADMIN')).toBe('ADMIN')
  })

  it('normalizes lowercase to uppercase', () => {
    expect(normalizePerfilUsuario('gerente')).toBe('GERENTE')
  })

  it('trims whitespace', () => {
    expect(normalizePerfilUsuario('  DONO  ')).toBe('DONO')
  })

  it('returns OPERADOR for null', () => {
    expect(normalizePerfilUsuario(null)).toBe('OPERADOR')
  })

  it('returns OPERADOR for undefined', () => {
    expect(normalizePerfilUsuario(undefined)).toBe('OPERADOR')
  })

  it('returns OPERADOR for unknown value', () => {
    expect(normalizePerfilUsuario('SUPERADMIN')).toBe('OPERADOR')
  })

  it('returns OPERADOR for empty string', () => {
    expect(normalizePerfilUsuario('')).toBe('OPERADOR')
  })
})
