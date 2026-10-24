import { describe, expect, it } from 'vitest'
import { DEMO_PLANOS, DEMO_TRIALS } from './demoData'
import {
  convertivel, fase, listarTrials, mensagemConversao, parseConversao, parseFollowup, parseReais, parseTrialFilters,
  prioridade, trialStats, valorTabela, type Trial,
} from './conversao'

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x)
  return f
}
const NOW = new Date('2026-10-23T15:00:00Z')
const EMP = 'e0000000-0000-4000-8000-000000000001'
const LEAD = '00000000-0000-4000-8000-000000000301'
const day = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

const base: Trial = {
  empresa_id: EMP, empresa_nome: 'Loja', criado_em: day(-5), trial_fim: day(10), status: 'TRIAL', motivo_status: null,
  plano_codigo: 'ATACADO', addons: [], qtd_lojas: 1, qtd_caixas: 1, forma_pagamento: 'PIX', valor_mensal_centavos: null,
  tem_cobranca_asaas: false, lead: null, ultimo_contato_em: null, solicitou_contratacao_em: null,
  atividade: { ultimo_acesso: null, usuarios_ativos: 1, lojas_ativas: 1, produtos_proprios: 0, caixas_abertos: 0, vendas_total: 0, vendas_7d: 0, ultima_venda: null },
}
const lead = (o: Partial<NonNullable<Trial['lead']>> = {}): NonNullable<Trial['lead']> => ({
  id: LEAD, protocol: 'JL-261023-ABCDEF', status: 'novo', interesse: null, proximo_contato: null, name: 'X', contact: 'x@y.z',
  channel: 'email', email: 'x@y.z', locale: 'pt-BR', created_at: day(-5), ...o,
})

describe('fase do teste', () => {
  it('em teste, expira em até 3 dias, expirado (inclusive antes do job diário), cliente e encerrado', () => {
    expect(fase(base, NOW)).toBe('em_teste')
    expect(fase({ ...base, trial_fim: day(2) }, NOW)).toBe('expira_logo')
    expect(fase({ ...base, trial_fim: day(-0.5) }, NOW)).toBe('expirado')
    expect(fase({ ...base, status: 'SUSPENSA', motivo_status: 'TRIAL_EXPIRADO', trial_fim: day(-4) }, NOW)).toBe('expirado')
    expect(fase({ ...base, status: 'ATIVA' }, NOW)).toBe('cliente')
    expect(fase({ ...base, status: 'CANCELADA' }, NOW)).toBe('encerrado')
  })
  it('só converte teste ativo/expirado e sem assinatura no Asaas (mesma regra do banco)', () => {
    expect(convertivel(base)).toBe(true)
    expect(convertivel({ ...base, status: 'SUSPENSA', motivo_status: 'TRIAL_EXPIRADO' })).toBe(true)
    expect(convertivel({ ...base, status: 'SUSPENSA', motivo_status: 'INADIMPLENCIA' })).toBe(false)
    expect(convertivel({ ...base, tem_cobranca_asaas: true })).toBe(false)
    expect(convertivel({ ...base, status: 'ATIVA' })).toBe(false)
  })
})

describe('prioridade', () => {
  it('pedido de contratação + uso real + prazo curto ⇒ alta, com os motivos explicados', () => {
    const s = prioridade({ ...base, trial_fim: day(2), solicitou_contratacao_em: day(-0.1),
      atividade: { ...base.atividade, vendas_7d: 4, vendas_total: 4, produtos_proprios: 12, ultimo_acesso: day(-1) } }, NOW)
    expect(s.nivel).toBe('alta')
    expect(s.motivos).toEqual(expect.arrayContaining(['Pediu para contratar', '4 venda(s) nos últimos 7 dias', 'Teste termina em 2 dia(s)']))
  })
  it('sem uso e sem sinais ⇒ baixa (com dica de boas-vindas)', () => {
    const s = prioridade(base, NOW)
    expect(s.nivel).toBe('baixa')
    expect(s.motivos).toContain('Ainda sem uso: vale um contato de boas-vindas')
  })
  it('interesse e retorno agendado pesam; cliente/perdido saem da fila', () => {
    expect(prioridade({ ...base, lead: lead({ interesse: 'alto', proximo_contato: '2026-10-23' }) }, NOW).nivel).toBe('media')
    expect(prioridade({ ...base, lead: lead({ interesse: 'baixo' }) }, NOW).pontos).toBeLessThan(0)
    expect(prioridade({ ...base, status: 'ATIVA' }, NOW).nivel).toBeNull()
    expect(prioridade({ ...base, lead: lead({ status: 'perdido' }) }, NOW).nivel).toBeNull()
  })
})

describe('lista e indicadores', () => {
  it('ordena por oportunidade (abertos primeiro) e filtra por fase, prioridade e busca', () => {
    const rows = listarTrials(DEMO_TRIALS, parseTrialFilters({}))
    expect(rows[0]?.empresa_nome).toBe('Bazar Fictício Oriente')
    expect(rows.at(-1)?.fase).toBe('cliente')
    expect(listarTrials(DEMO_TRIALS, parseTrialFilters({ fase: 'cliente' })).map((t) => t.empresa_nome)).toEqual(['Eletro Amostra 25'])
    expect(listarTrials(DEMO_TRIALS, parseTrialFilters({ q: 'exemplo2@' }))).toHaveLength(1)
    expect(parseTrialFilters({ fase: 'hack', prioridade: 'x' })).toEqual({ q: '', fase: null, prioridade: null })
  })
  it('conta testes ativos, pedidos e conversão dos encerrados', () => {
    const s = trialStats(DEMO_TRIALS)
    expect(s).toMatchObject({ emTeste: 3, pedidos: 1, clientes: 1 })
    expect(s.conversao).toBe(50)
  })
})

describe('valor e formulário de conversão', () => {
  it('valor de tabela igual ao do banco (REDE 2 lojas, 3 caixas, + Fiscal = R$ 655,00)', () => {
    expect(valorTabela(DEMO_PLANOS, 'REDE', ['FISCAL'], 2, 3)).toBe(65500)
    expect(valorTabela(DEMO_PLANOS, 'BASICO', [], 2, 2)).toBeNull()
  })
  it('parseReais aceita formatos brasileiros e recusa lixo', () => {
    expect(parseReais('')).toBeNull()
    expect(parseReais('R$ 1.234,56')).toBe(123456)
    expect(parseReais('150')).toBe(15000)
    expect(parseReais('abc')).toBe('invalido')
    expect(parseReais('-5')).toBe('invalido')
  })
  const ok = { empresaId: EMP, plano: 'REDE', addons: 'FISCAL', qtdLojas: '2', qtdCaixas: '3', forma: 'PIX', valor: '', observacao: 'Aprovado em reunião', confirmo: 'sim' }
  it('exige confirmação de aprovação e justificativa', () => {
    expect(parseConversao(fd(ok), DEMO_PLANOS)).toEqual({ ok: true, value: { empresaId: EMP, plano: 'REDE', addons: ['FISCAL'], qtdLojas: 2, qtdCaixas: 3, forma: 'PIX', valorCentavos: null, observacao: 'Aprovado em reunião' } })
    expect(parseConversao(fd({ ...ok, confirmo: '' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, observacao: 'ok' }), DEMO_PLANOS)).toMatchObject({ ok: false })
  })
  it('respeita as regras de plano antes de chamar o banco', () => {
    expect(parseConversao(fd({ ...ok, plano: 'BASICO' }), DEMO_PLANOS)).toMatchObject({ ok: false, error: expect.stringContaining('até 1 loja') })
    expect(parseConversao(fd({ ...ok, plano: 'FISCAL' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, addons: 'XPTO' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, qtdCaixas: '1' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, forma: 'BITCOIN' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, empresaId: 'x' }), DEMO_PLANOS)).toMatchObject({ ok: false })
    expect(parseConversao(fd({ ...ok, valor: '150,00' }), DEMO_PLANOS)).toMatchObject({ ok: true, value: { valorCentavos: 15000 } })
  })
  it('acompanhamento: interesse da lista e data válida', () => {
    expect(parseFollowup(fd({ empresaId: EMP, leadId: LEAD, interesse: 'alto', proximo_contato: '2026-10-30' }), NOW))
      .toEqual({ ok: true, value: { empresaId: EMP, leadId: LEAD, interesse: 'alto', proximo_contato: '2026-10-30' } })
    expect(parseFollowup(fd({ empresaId: EMP, leadId: LEAD, interesse: '', proximo_contato: '' }), NOW)).toMatchObject({ ok: true, value: { interesse: null, proximo_contato: null } })
    expect(parseFollowup(fd({ empresaId: EMP, leadId: LEAD, interesse: 'muito' }), NOW)).toMatchObject({ ok: false })
    expect(parseFollowup(fd({ empresaId: EMP, leadId: LEAD, proximo_contato: '30/10/2026' }), NOW)).toMatchObject({ ok: false })
  })
  it('traduz códigos do banco e nunca vaza erro técnico', () => {
    expect(mensagemConversao('COMMERCIAL_JA_CLIENTE')).toContain('já é cliente')
    expect(mensagemConversao('relation x does not exist')).toContain('Nada foi alterado')
    expect(mensagemConversao(undefined)).toContain('Nada foi alterado')
  })
})
