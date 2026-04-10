import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminChineseUiEnabled,
  adminHeading,
  adminLineBoth,
  adminNavLabels,
  adminUi,
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

  it('usa separador " · " (não barra), alinhado ao layout', () => {
    expect(adminLineBoth({ cn: '销售', pt: 'Vendas' })).toBe('销售 · Vendas')
  })
})

describe('adminHeading', () => {
  const line = { cn: '生意看板', pt: 'Dashboard comercial' }

  beforeEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  it('com UI chinesa ativa, título CN e subtítulo PT', () => {
    expect(adminHeading(line)).toEqual({
      title: '生意看板',
      subtitle: 'Dashboard comercial',
    })
  })

  it('com UI chinesa desligada, só título PT', () => {
    vi.stubEnv(ENV_KEY, 'false')
    expect(adminHeading(line)).toEqual({ title: 'Dashboard comercial' })
  })
})

describe('adminNavLabels', () => {
  const line = { cn: '主控台', pt: 'Dashboard' }

  beforeEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env[ENV_KEY]
  })

  it('com UI chinesa ativa, primária CN e secundária PT', () => {
    expect(adminNavLabels(line)).toEqual({
      primary: '主控台',
      secondary: 'Dashboard',
    })
  })

  it('com UI chinesa desligada, só PT e secondary vazio', () => {
    vi.stubEnv(ENV_KEY, 'no')
    expect(adminNavLabels(line)).toEqual({ primary: 'Dashboard', secondary: '' })
  })
})

describe('adminUi.nav e adminUi.navHints', () => {
  it('cada chave de nav possui hint de tooltip (evita link sem title)', () => {
    const navKeys = Object.keys(adminUi.nav) as (keyof typeof adminUi.nav)[]
    for (const key of navKeys) {
      expect(adminUi.navHints[key]).toBeDefined()
      expect(adminUi.navHints[key].length).toBeGreaterThan(0)
    }
    expect(Object.keys(adminUi.navHints).length).toBe(navKeys.length)
  })
})
