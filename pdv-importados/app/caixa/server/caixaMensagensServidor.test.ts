import { describe, expect, it } from 'vitest'
import { caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'

describe('caixaMsgServidor', () => {
  it('retorna PT para chaves operacionais do servidor', () => {
    expect(caixaMsgServidor('pt', 'err_srv_sessao_expirada')).toBe(
      'Sessão expirada. Faça login novamente.',
    )
    expect(caixaMsgServidor('pt', 'err_srv_cancelar_perfil')).toContain('GERENTE')
  })

  it('retorna ZH para as mesmas chaves (sem PT indevido)', () => {
    expect(caixaMsgServidor('zh', 'err_srv_sessao_expirada')).toBe('会话已过期，请重新登录。')
    expect(caixaMsgServidor('zh', 'err_srv_cancelar_perfil')).toContain('经理')
    expect(caixaMsgServidor('zh', 'err_srv_sessao_expirada')).not.toContain('Sessão')
  })

  it('interpola variáveis em busca ambígua (#355 autocomplete)', () => {
    const pt = caixaMsgServidor('pt', 'err_srv_busca_ambigua', { frag: 'coca' })
    const zh = caixaMsgServidor('zh', 'err_srv_busca_ambigua', { frag: 'coca' })
    expect(pt).toContain('coca')
    expect(zh).toContain('coca')
    expect(zh).not.toMatch(/Vários produtos/)
  })

  it('msg_codigo_lido respeita idioma no scan pipeline', () => {
    expect(caixaMsgServidor('pt', 'msg_codigo_lido', { codigo: '789' })).toBe('Código lido: 789')
    expect(caixaMsgServidor('zh', 'msg_codigo_lido', { codigo: '789' })).toBe('已读取编码：789')
  })
})
