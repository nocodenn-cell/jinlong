import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminChineseUiEnabled,
  adminLineBoth,
} from './adminChineseUiLabels'

const ENV_KEY = 'NEXT_PUBLIC_ADMIN_CHINESE_UI'

describe('adminChineseUiEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  it('retorna true quando a variável não está definida', () => {
    expect(adminChineseUiEnabled()).toBe(true)
  })

  it('retorna true para string vazia após trim (não é token de desligar)', () => {
    vi.stubEnv(ENV_KEY, '   ')
    expect(adminChineseUiEnabled()).toBe(true)
  })

  it('retorna true para valores que não desligam explicitamente', () => {
    vi.stubEnv(ENV_KEY, 'true')
    expect(adminChineseUiEnabled()).toBe(true)
    vi.stubEnv(ENV_KEY, '1')
    expect(adminChineseUiEnabled()).toBe(true)
    vi.stubEnv(ENV_KEY, 'yes')
    expect(adminChineseUiEnabled()).toBe(true)
  })

  it.each([
    ['false'],
    ['FALSE'],
    ['False'],
    ['0'],
    ['off'],
    ['OFF'],
    ['no'],
    ['NO'],
  ])('retorna false quando NEXT_PUBLIC_ADMIN_CHINESE_UI=%s', (value) => {
    vi.stubEnv(ENV_KEY, value)
    expect(adminChineseUiEnabled()).toBe(false)
  })

  it('ignora espaços ao redor do token', () => {
    vi.stubEnv(ENV_KEY, '  false  ')
    expect(adminChineseUiEnabled()).toBe(false)
  })
})

describe('adminLineBoth', () => {
  const line = { cn: '主控台', pt: 'Dashboard' }

  beforeEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  it('com UI chinesa ativa (env indefinida), concatena cn · pt', () => {
    expect(adminLineBoth(line)).toBe('主控台 · Dashboard')
  })

  it('com UI chinesa desligada, retorna só pt', () => {
    vi.stubEnv(ENV_KEY, 'false')
    expect(adminLineBoth(line)).toBe('Dashboard')
  })

  it('com UI chinesa desligada via 0, retorna só pt', () => {
    vi.stubEnv(ENV_KEY, '0')
    expect(adminLineBoth(line)).toBe('Dashboard')
  })
})
