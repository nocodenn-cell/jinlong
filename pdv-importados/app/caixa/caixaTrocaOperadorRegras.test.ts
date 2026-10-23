import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  minutosBloqueio,
  motivoTrocaBloqueada,
  parseTrocaContexto,
  erroTroca,
  responsavelDiferente,
} from '@/app/caixa/caixaTrocaOperadorRegras'

const PIN = { ativo: false, minutos: 3 }

describe('troca de operador — regras puras', () => {
  it('contexto vazio/inválido vira estado neutro (PDV igual ao de hoje)', () => {
    const c = parseTrocaContexto(null, PIN)
    expect(c).toEqual({ operando: null, bloqueado: null, proprioEmUso: null, liberados: [], pin: PIN })
    expect(parseTrocaContexto({ liberados: [{ caixa_id: null }] }, PIN).liberados).toEqual([])
  })

  it('lê operando, bloqueado, turno próprio em uso e liberados do RPC', () => {
    const c = parseTrocaContexto(
      {
        operando: { caixa_id: 'c1', responsavel_id: 'ana', responsavel_nome: 'Ana' },
        bloqueado: { caixa_id: 'c1', bloqueado_em: '2026-10-23T10:00:00Z' },
        proprio_em_uso: { caixa_id: 'c2', operador_nome: 'Bruno', liberado: false, bloqueado: true },
        liberados: [{ caixa_id: 'c3', responsavel_nome: 'Carla', data_abertura: '2026-10-23T08:02:00Z' }],
      },
      { ativo: true, minutos: 5 },
    )
    expect(c.operando).toEqual({ caixaId: 'c1', responsavelId: 'ana', responsavelNome: 'Ana' })
    expect(c.bloqueado).toEqual({ caixaId: 'c1' })
    expect(c.proprioEmUso).toEqual({ caixaId: 'c2', operadorNome: 'Bruno', liberado: false, bloqueado: true })
    expect(c.liberados).toEqual([{ caixaId: 'c3', responsavelNome: 'Carla', dataAbertura: '2026-10-23T08:02:00Z' }])
  })

  it('"Turno de" só aparece quando o responsável não é quem opera', () => {
    const c = parseTrocaContexto({ operando: { caixa_id: 'c1', responsavel_id: 'ana', responsavel_nome: 'Ana' } }, PIN)
    expect(responsavelDiferente(c, 'ana')).toBeNull()
    expect(responsavelDiferente(c, 'bruno')).toBe('Ana')
    expect(responsavelDiferente(null, 'bruno')).toBeNull()
  })

  it('pré-condições: carrinho cheio, venda finalizando ou caixa processando bloqueiam a troca', () => {
    expect(motivoTrocaBloqueada({ itensNoCarrinho: 0, finalizando: false, processandoCaixa: false })).toBeNull()
    expect(motivoTrocaBloqueada({ itensNoCarrinho: 2, finalizando: false, processandoCaixa: false })).toBe('carrinho')
    expect(motivoTrocaBloqueada({ itensNoCarrinho: 2, finalizando: true, processandoCaixa: false })).toBe('finalizando')
    expect(motivoTrocaBloqueada({ itensNoCarrinho: 0, finalizando: false, processandoCaixa: true })).toBe('processando')
  })

  it('minutos de bloqueio fora de 1..60 caem no padrão de 3', () => {
    expect(minutosBloqueio(5)).toBe(5)
    expect(minutosBloqueio(0)).toBe(3)
    expect(minutosBloqueio(61)).toBe(3)
    expect(minutosBloqueio('x')).toBe(3)
  })

  it('códigos do banco viram erros tipados (desconhecido = indisponível)', () => {
    expect(erroTroca('ERROR: TROCA_CAIXA_EM_USO')).toBe('em_uso')
    expect(erroTroca('TROCA_OPERADOR_COM_OUTRO_CAIXA')).toBe('outro_caixa')
    expect(erroTroca('TROCA_NAO_E_OPERADOR_ATIVO')).toBe('nao_operador')
    expect(erroTroca('TROCA_CAIXA_FECHADO')).toBe('caixa_fechado')
    expect(erroTroca('function does not exist')).toBe('indisponivel')
  })

  it('mensagens da troca existem em PT e 中文, sem placeholder de chave simples', () => {
    const chaves = Object.keys(getMessages('pt').caixa).filter((k) => /^(troca_|bloqueio_|topbar_turno_de)/.test(k))
    expect(chaves.length).toBeGreaterThan(20)
    for (const idioma of ['pt', 'zh'] as const) {
      const c = getMessages(idioma).caixa as Record<string, string>
      for (const k of chaves) {
        expect(typeof c[k], `${idioma}.${k}`).toBe('string')
        expect(c[k], `${idioma}.${k}`).not.toMatch(/(^|[^{])\{\w+\}(?!\})/)
      }
    }
    expect(getMessages('zh').login.troca_operador).toBeTruthy()
  })
})
