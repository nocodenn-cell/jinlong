import { describe, it, expect } from 'vitest'
import { getMessages } from './getMessages'

describe('getMessages', () => {
  it('retorna pt por padrão', () => {
    const m = getMessages('pt')
    expect(m.dashboard.titulo).toBe('Painel de controle')
  })

  it('retorna mensagens zh', () => {
    const m = getMessages('zh')
    expect(m.dashboard.titulo).toBe('控制面板')
  })

  it('inclui chaves do painel estoque (paridade i18n)', () => {
    expect(getMessages('pt').estoque.titulo).toBe('Estoque')
    expect(getMessages('zh').estoque.titulo).toBe('库存')
  })

  it('paridade gerente.dashboard_inicio (pt/zh)', () => {
    expect(getMessages('pt').gerente.dashboard_inicio.sparkline_titulo).toContain('hora')
    expect(getMessages('zh').gerente.dashboard_inicio.sparkline_titulo.length).toBeGreaterThan(0)
  })
})

