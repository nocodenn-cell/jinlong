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

  it('retorna mensagens zh-HK (繁體)', () => {
    const m = getMessages('zh-HK')
    expect(m.dashboard.titulo).toBe('今日數據總覽')
    expect(m.dashboard.total_vendido).toBe('總營業額')
    expect(m.comum.carregando).toBe('載入中...')
  })
})

