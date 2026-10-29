import { describe, expect, it } from 'vitest'
import pt from '@/i18n/pt.json'
import zh from '@/i18n/zh.json'
import {
  EVIDENCIAS_EXIBIDAS,
  MOTIVO_MAX,
  bloqueiosDecisao,
  erroRevisaoDoBanco,
  evidenciasVisiveis,
  filtroValido,
  mapearLinha,
  validarDecisao,
} from './revisaoOffline'

const ID = '11111111-2222-4333-8444-555555555555'

describe('validarDecisao', () => {
  it('aceita decisão válida e apara a justificativa', () => {
    expect(validarDecisao({ id: ID, decisao: 'APROVAR', motivo: '  conferido  ' })).toEqual({
      ok: true,
      value: { id: ID, decisao: 'APROVAR', motivo: 'conferido' },
    })
  })
  it('justificativa obrigatória (vazia, só espaços, < 5)', () => {
    for (const motivo of [undefined, '', '    ', 'abcd', '  ab  ']) {
      expect(validarDecisao({ id: ID, decisao: 'REJEITAR', motivo })).toEqual({ ok: false, erro: 'motivo_obrigatorio' })
    }
  })
  it('justificativa longa demais', () => {
    expect(validarDecisao({ id: ID, decisao: 'REJEITAR', motivo: 'x'.repeat(MOTIVO_MAX + 1) })).toEqual({
      ok: false,
      erro: 'motivo_longo',
    })
  })
  it('id e decisão inválidos', () => {
    expect(validarDecisao({ id: 'x', decisao: 'APROVAR', motivo: 'conferido' }).ok).toBe(false)
    expect(validarDecisao({ id: ID, decisao: 'APAGAR', motivo: 'conferido' })).toEqual({ ok: false, erro: 'entrada_invalida' })
    expect(validarDecisao({ id: ID, decisao: 'aprovar', motivo: 'conferido' }).ok).toBe(false)
  })
})

describe('filtroValido', () => {
  it('só DECIDIDOS ou PENDENTE (padrão seguro)', () => {
    expect(filtroValido('DECIDIDOS')).toBe('DECIDIDOS')
    expect(filtroValido('TODOS')).toBe('PENDENTE')
    expect(filtroValido(undefined)).toBe('PENDENTE')
  })
})

describe('erroRevisaoDoBanco', () => {
  it('traduz códigos do banco e nunca vaza a mensagem crua', () => {
    expect(erroRevisaoDoBanco('REVISAO_AUTOAPROVACAO_PROIBIDA')).toBe('autoaprovacao')
    expect(erroRevisaoDoBanco('ERROR: REVISAO_JA_DECIDIDA: APROVADO')).toBe('ja_decidida')
    expect(erroRevisaoDoBanco('REVISAO_FORA_DE_ORDEM: 2')).toBe('fora_de_ordem')
    expect(erroRevisaoDoBanco('REVISAO_MOTIVO_OBRIGATORIO')).toBe('motivo_obrigatorio')
    expect(erroRevisaoDoBanco('REVISAO_MOTIVO_LONGO')).toBe('motivo_longo')
    expect(erroRevisaoDoBanco('REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO')).toBe('sem_permissao')
    expect(erroRevisaoDoBanco('REVISAO_EXIGE_USUARIO')).toBe('sem_permissao')
    expect(erroRevisaoDoBanco('relation "x" does not exist')).toBe('falha')
    expect(erroRevisaoDoBanco(undefined)).toBe('falha')
  })
})

describe('bloqueiosDecisao', () => {
  it('pendente comum: tudo liberado', () => {
    expect(bloqueiosDecisao({ status: 'PENDENTE', eMeuEvento: false, anterioresPendentes: 0 })).toEqual({
      aprovar: null,
      rejeitar: null,
    })
  })
  it('evento próprio: nem aprova nem rejeita', () => {
    expect(bloqueiosDecisao({ status: 'PENDENTE', eMeuEvento: true, anterioresPendentes: 0 })).toEqual({
      aprovar: 'meu_evento',
      rejeitar: 'meu_evento',
    })
  })
  it('fora de ordem: só aprovar bloqueia', () => {
    expect(bloqueiosDecisao({ status: 'PENDENTE', eMeuEvento: false, anterioresPendentes: 2 })).toEqual({
      aprovar: 'fora_de_ordem',
      rejeitar: null,
    })
  })
  it('decidido: nada', () => {
    for (const status of ['APROVADO', 'REJEITADO', 'RECONCILIADO_AUTO'] as const) {
      expect(bloqueiosDecisao({ status, eMeuEvento: false, anterioresPendentes: 0 })).toEqual({
        aprovar: 'decidido',
        rejeitar: 'decidido',
      })
    }
  })
})

describe('mapearLinha', () => {
  it('mapeia a linha do banco e normaliza valores desconhecidos para o lado seguro', () => {
    const it0 = mapearLinha({
      id: ID,
      seq: '7',
      event_id: 'ev-1',
      tipo: 'VENDA_REGISTRADA',
      origem: 'legado',
      loja_id: 'l1',
      loja_nome: 'Loja A',
      caixa_id: 'c1',
      operador_nome: 'Ana',
      operador_ativo: false,
      recebido_em: '2026-10-28T10:00:00Z',
      classificacao: 'XYZ',
      motivo: 'SEM_PROVA_DO_SERVIDOR_ANTERIOR_A_PERDA',
      evidencias: { recebimentos: 2 },
      resumo: { total_liquido: '120.5', itens: 3, forma_pagamento: 'PIX' },
      status: '???',
      anteriores_pendentes: 1,
      e_meu_evento: 'true',
    })
    expect(it0.seq).toBe(7)
    expect(it0.classificacao).toBe('NAO_COMPROVAVEL')
    expect(it0.status).toBe('PENDENTE')
    expect(it0.eMeuEvento).toBe(false)
    expect(it0.resumo).toMatchObject({ totalLiquido: 120.5, itens: 3, formaPagamento: 'PIX' })
    expect(it0.vendaId).toBeNull()
    expect(it0.operadorAtivo).toBe(false)
  })
})

describe('evidenciasVisiveis', () => {
  it('só chaves conhecidas, sem vazios', () => {
    expect(
      evidenciasVisiveis({ recebimentos: 2, payload_divergente: true, segredo: 'x', token_revogado_em: null, perdeu_acesso_em: '' }),
    ).toEqual([
      ['recebimentos', '2'],
      ['payload_divergente', 'true'],
    ])
  })
})

describe('i18n revisao_offline', () => {
  const ptNs = (pt as unknown as Record<string, Record<string, unknown>>).revisao_offline
  const zhNs = (zh as unknown as Record<string, Record<string, unknown>>).revisao_offline
  const chaves = (o: unknown, p = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => chaves(v, p ? `${p}.${k}` : k))
      : [p]
  it('pt e zh têm as mesmas chaves e nenhuma vazia', () => {
    expect(chaves(zhNs).sort()).toEqual(chaves(ptNs).sort())
    for (const ns of [ptNs, zhNs]) {
      for (const k of chaves(ns)) {
        const v = k.split('.').reduce<unknown>((a, s) => (a as Record<string, unknown>)[s], ns)
        expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true)
      }
    }
  })
  it('toda evidência exibida e todo erro têm rótulo', () => {
    for (const k of EVIDENCIAS_EXIBIDAS) expect((ptNs.evidencias as Record<string, string>)[k], k).toBeTruthy()
    for (const k of ['sessao', 'entrada_invalida', 'motivo_obrigatorio', 'motivo_longo', 'sem_permissao', 'ja_decidida', 'autoaprovacao', 'fora_de_ordem', 'falha'])
      expect((zhNs.erros as Record<string, string>)[k], k).toBeTruthy()
  })
})
