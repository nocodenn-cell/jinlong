import { describe, expect, it } from 'vitest'
import {
  agruparAgenda, computeDashboard, DEFAULT_STAGES, emailLink, localToIso, mensagemCrm, parseActivity, parseConvert, parseLeadUpdate,
  parseMember, parseNewLead, parseProposal, parseProposalStatus, parseStage, possiveisDuplicados, semAcompanhamento, whatsappLink,
  type ActivityWithLead, type DashLead, type Member,
} from './crm'
import { DEMO_ACTIVITIES, DEMO_LEADS, DEMO_MEMBERS, DEMO_PROPOSALS } from './demoData'

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x)
  return f
}
const ID = '00000000-0000-4000-8000-000000000001'
const ID2 = '00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-20T15:00:00Z')
const iso = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

describe('indicadores do painel (coorte de leads reais recebidos)', () => {
  const leads: DashLead[] = [
    { id: 'a', status: 'novo', product: 'jinlong', origem: 'site', created_at: iso(-5), utm_campaign: 'feira' },
    { id: 'b', status: 'qualificacao', product: 'jinlong', origem: 'site', created_at: iso(-50), primeiro_atendimento_em: iso(-48), owner_id: 'u1' },
    { id: 'c', status: 'proposta', product: 'jinlong', origem: 'indicacao', created_at: iso(-100), primeiro_atendimento_em: iso(-96), owner_id: 'u1' },
    { id: 'd', status: 'contratado', product: 'venddi', origem: 'indicacao', created_at: iso(-200), primeiro_atendimento_em: iso(-200), owner_id: 'u2' },
    { id: 'e', status: 'perdido', product: 'jinlong', origem: 'site', created_at: iso(-300), primeiro_atendimento_em: iso(-294), motivo_perda: 'Caro', utm_campaign: 'feira' },
  ]
  const acts = [
    { lead_id: 'c', tipo: 'demonstracao' as const, agendada_para: iso(24), concluida_em: null, cancelada_em: null },
    { lead_id: 'b', tipo: 'demonstracao' as const, agendada_para: iso(24), concluida_em: iso(0), cancelada_em: null },
    { lead_id: 'zz', tipo: 'demonstracao' as const, agendada_para: iso(24), concluida_em: null, cancelada_em: null }, // fora da coorte
  ]
  const props = [
    { lead_id: 'c', status: 'enviada' as const, valor_mensal_centavos: 10000, enviada_em: iso(-10), versao: 1 },
    { lead_id: 'c', status: 'em_negociacao' as const, valor_mensal_centavos: 9000, enviada_em: iso(-5), versao: 2 },
    { lead_id: 'd', status: 'aceita' as const, valor_mensal_centavos: 20000, enviada_em: iso(-150), versao: 1 },
    { lead_id: 'b', status: 'rascunho' as const, valor_mensal_centavos: 5000, enviada_em: null, versao: 1 },
  ]
  const members: Member[] = [{ user_id: 'u1', nome: 'Ana', papel: 'vendedor', ativo: true, email: null }]
  const d = computeDashboard(leads, acts, props, DEFAULT_STAGES, members, NOW)

  it('contagens por etapa e taxa de conversão entre fechados', () => {
    expect(d).toMatchObject({ total: 5, novos: 1, qualificacao: 1, abertas: 2, convertidos: 1, perdidos: 1, taxaConversao: 50 })
  })
  it('demonstrações agendadas: só pendentes e só da coorte', () => expect(d.demosAgendadas).toBe(1))
  it('propostas enviadas: só as que foram de fato enviadas', () => expect(d.propostasEnviadas).toBe(3))
  it('receita potencial = última proposta aberta de cada lead em aberto (rascunho e aceita fora)', () => expect(d.receitaPotencialCentavos).toBe(9000))
  it('tempo médio de 1º atendimento em horas e quantos seguem sem atendimento', () => {
    expect(d.tempoPrimeiroAtendimentoH).toBe(3) // (2 + 4 + 0 + 6) / 4
    expect(d.semAtendimento).toBe(1)
  })
  it('conversão por origem, campanha e responsável; motivos de perda', () => {
    expect(d.porOrigem.find((o) => o.chave === 'indicacao')).toMatchObject({ total: 2, convertidos: 1, abertos: 1, taxa: 100 })
    expect(d.porOrigem.find((o) => o.chave === 'site')).toMatchObject({ total: 3, perdidos: 1, taxa: 0 })
    expect(d.porCampanha.find((o) => o.chave === 'feira')).toMatchObject({ total: 2, rotulo: 'feira' })
    expect(d.porCampanha.find((o) => o.chave === '')?.rotulo).toBe('Sem campanha (UTM)')
    expect(d.porResponsavel.find((o) => o.chave === 'u1')?.rotulo).toBe('Ana')
    expect(d.porResponsavel.find((o) => o.chave === '')?.rotulo).toBe('Sem responsável')
    expect(d.motivosPerda).toEqual([{ motivo: 'Caro', n: 1 }])
  })
  it('sem dados → zeros, sem divisão por zero', () => {
    expect(computeDashboard([], [], [], DEFAULT_STAGES, [], NOW)).toMatchObject({ total: 0, taxaConversao: null, tempoPrimeiroAtendimentoH: null, receitaPotencialCentavos: 0 })
  })
  it('dados fictícios montam o painel sem erro', () => {
    expect(computeDashboard(DEMO_LEADS, DEMO_ACTIVITIES, DEMO_PROPOSALS, DEFAULT_STAGES, DEMO_MEMBERS).total).toBe(DEMO_LEADS.length)
  })
})

describe('alertas e agenda', () => {
  it('sem acompanhamento: aberto, sem atividade pendente e parado há mais de 3 dias', () => {
    const leads: DashLead[] = [
      { id: 'a', status: 'contatado', product: 'jinlong', origem: 'site', created_at: iso(-24 * 10), ultimo_contato_em: iso(-24 * 5) },
      { id: 'b', status: 'contatado', product: 'jinlong', origem: 'site', created_at: iso(-24 * 10), ultimo_contato_em: iso(-24 * 1) },
      { id: 'c', status: 'novo', product: 'jinlong', origem: 'site', created_at: iso(-24 * 9) },
      { id: 'd', status: 'perdido', product: 'jinlong', origem: 'site', created_at: iso(-24 * 30) },
      { id: 'e', status: 'demonstracao', product: 'jinlong', origem: 'site', created_at: iso(-24 * 30) },
    ]
    const r = semAcompanhamento(leads, [{ lead_id: 'e' }], DEFAULT_STAGES, NOW)
    expect(r.map((l) => [l.id, l.diasParado])).toEqual([['c', 9], ['a', 5]])
  })
  it('agenda: atrasadas, hoje (fuso de São Paulo) e próximos 7 dias', () => {
    const a = (id: string, h: number): ActivityWithLead => ({ id, lead_id: 'l', tipo: 'ligacao', titulo: 't', agendada_para: iso(h), responsavel_id: null, concluida_em: null, cancelada_em: null, resultado: null, created_at: iso(-1), lead: null })
    // NOW = 12:00 em SP; -14h = ontem 22:00 SP; +8h = hoje 20:00 SP; +24h = amanhã; +24*9 = fora
    const g = agruparAgenda([a('futuro', 24), a('ontem', -14), a('hoje', 8), a('longe', 24 * 9), a('cedo', -2)], NOW)
    expect(g.atrasadas.map((x) => x.id)).toEqual(['ontem'])
    expect(g.hoje.map((x) => x.id)).toEqual(['cedo', 'hoje'])
    expect(g.proximas.map((x) => x.id)).toEqual(['futuro'])
  })
})

describe('formulários do CRM', () => {
  const base = { leadId: ID, name: 'Fulano', store: 'Loja X', contact: '11 99999-0000' }
  it('edição do lead: normaliza e valida', () => {
    const r = parseLeadUpdate(fd({ ...base, email: ' A@B.COM ', uf: 'sp', funcionarios: '12', unidades: '', phone: '(11) 99999-0000' }))
    expect(r).toMatchObject({ ok: true, value: { dados: { email: 'a@b.com', uf: 'SP', funcionarios: 12, unidades: null, city: null } } })
    expect(parseLeadUpdate(fd({ ...base, uf: 'São' })).ok).toBe(false)
    expect(parseLeadUpdate(fd({ ...base, email: 'x@' })).ok).toBe(false)
    expect(parseLeadUpdate(fd({ ...base, funcionarios: '1e3' })).ok).toBe(false)
    expect(parseLeadUpdate(fd({ ...base, name: '<script>' })).ok).toBe(false)
    expect(parseLeadUpdate(fd({ ...base, segment: 'drop' })).ok).toBe(false)
  })
  it('novo lead: só origens manuais; e-mail como canal exige e-mail', () => {
    const ok = parseNewLead(fd({ ...base, product: 'jinlong', channel: 'whatsapp', origem: 'indicacao' }))
    expect(ok).toMatchObject({ ok: true, value: { origem: 'indicacao', forcar: false } })
    expect(parseNewLead(fd({ ...base, product: 'jinlong', channel: 'whatsapp', origem: 'site' })).ok).toBe(false)
    expect(parseNewLead(fd({ ...base, product: 'jinlong', channel: 'email', origem: 'outro' })).ok).toBe(false)
    expect(parseNewLead(fd({ ...base, product: 'erp', channel: 'whatsapp', origem: 'outro' })).ok).toBe(false)
  })
  it('atividade: data/hora local de São Paulo e janela de 1 ano', () => {
    expect(localToIso('2026-11-21', '10:00')).toBe('2026-11-21T13:00:00.000Z')
    expect(parseActivity(fd({ leadId: ID, tipo: 'demonstracao', titulo: 'Demo', data: '2026-11-21', hora: '10:00' }), NOW)).toMatchObject({ ok: true, value: { quando: '2026-11-21T13:00:00.000Z', responsavel: null } })
    expect(parseActivity(fd({ leadId: ID, tipo: 'festa', titulo: 'Demo', data: '2026-11-21', hora: '10:00' }), NOW).ok).toBe(false)
    expect(parseActivity(fd({ leadId: ID, tipo: 'ligacao', titulo: 'Demo', data: '2028-11-21', hora: '10:00' }), NOW).ok).toBe(false)
  })
  it('proposta: plano/adicional só do catálogo; sem plano exige valor; validade até 180 dias', () => {
    const P = ['BASICO'], A = ['FISCAL']
    expect(parseProposal(fd({ leadId: ID, plano: 'BASICO', addons: ['FISCAL'], qtd_lojas: '1', qtd_caixas: '2', valor: '', validade: '2026-12-01' }), P, A, NOW))
      .toMatchObject({ ok: true, value: { plano: 'BASICO', addons: ['FISCAL'], valorCentavos: null, qtdCaixas: 2 } })
    expect(parseProposal(fd({ leadId: ID, plano: '', valor: '1.234,50', validade: '2026-12-01' }), P, A, NOW)).toMatchObject({ ok: true, value: { valorCentavos: 123450 } })
    expect(parseProposal(fd({ leadId: ID, plano: 'INVENTADO', validade: '2026-12-01' }), P, A, NOW).ok).toBe(false)
    expect(parseProposal(fd({ leadId: ID, plano: '', validade: '2026-12-01' }), P, A, NOW).ok).toBe(false)
    expect(parseProposal(fd({ leadId: ID, plano: '', addons: ['FISCAL'], valor: '10', validade: '2026-12-01' }), P, A, NOW).ok).toBe(false)
    expect(parseProposal(fd({ leadId: ID, plano: 'BASICO', validade: '2027-12-01' }), P, A, NOW).ok).toBe(false)
    expect(parseProposal(fd({ leadId: ID, plano: 'BASICO', qtd_lojas: '3', qtd_caixas: '2', validade: '2026-12-01' }), P, A, NOW).ok).toBe(false)
  })
  it('proposta: "aceita" só pela conversão', () => {
    expect(parseProposalStatus(fd({ id: ID, leadId: ID2, status: 'aceita' })).ok).toBe(false)
    expect(parseProposalStatus(fd({ id: ID, leadId: ID2, status: 'enviada' })).ok).toBe(true)
  })
  it('conversão exige proposta, confirmação e registro do aceite', () => {
    expect(parseConvert(fd({ leadId: ID, propostaId: ID2, observacao: 'Aceite por e-mail', confirmo: 'on' })).ok).toBe(true)
    expect(parseConvert(fd({ leadId: ID, propostaId: ID2, observacao: 'Aceite por e-mail' })).ok).toBe(false)
    expect(parseConvert(fd({ leadId: ID, propostaId: '', observacao: 'Aceite por e-mail', confirmo: 'on' })).ok).toBe(false)
    expect(parseConvert(fd({ leadId: ID, propostaId: ID2, observacao: 'ok', confirmo: 'on' })).ok).toBe(false)
  })
  it('equipe e etapas', () => {
    expect(parseMember(fd({ email: 'X@Y.COM', papel: 'vendedor' }))).toMatchObject({ ok: true, value: { email: 'x@y.com', ativo: true } })
    expect(parseMember(fd({ email: 'x@y.com', papel: 'admin' })).ok).toBe(false)
    expect(parseStage(fd({ rotulo: 'Visita técnica', ordem: '45' }))).toMatchObject({ ok: true, value: { codigo: 'visita_tecnica', ativo: true } })
    expect(parseStage(fd({ codigo: 'novo', rotulo: 'Entrada', ordem: '10', ativo: '0' }))).toMatchObject({ ok: true, value: { ativo: false } })
  })
})

describe('contato e duplicidade', () => {
  it('link de WhatsApp/e-mail só com dado válido (abre na mão da pessoa; nada é enviado)', () => {
    expect(whatsappLink({ channel: 'whatsapp', contact: '(11) 99999-0000', phone: null })).toBe('https://wa.me/5511999990000')
    expect(whatsappLink({ channel: 'wechat', contact: 'abc', phone: null })).toBeNull()
    expect(emailLink({ channel: 'email', contact: 'a@b.com', email: null })).toBe('mailto:a@b.com')
    expect(emailLink({ channel: 'whatsapp', contact: '11', email: null })).toBeNull()
  })
  it('possíveis duplicados por contato numérico, e-mail ou loja', () => {
    const l = { id: '1', contact: '(11) 98888-0001', store: 'Loja Um', email: 'a@b.com' }
    const outros = [
      { id: '2', contact: '11988880001', store: 'Outra', email: null },
      { id: '3', contact: 'x', store: ' loja um ', email: null },
      { id: '4', contact: 'y', store: 'Z', email: 'A@B.com' },
      { id: '5', contact: '11 1', store: 'Nada', email: null },
    ]
    expect(possiveisDuplicados(l, outros).map((o) => o.id)).toEqual(['2', '3', '4'])
  })
  it('mensagens amigáveis para os códigos do banco', () => {
    expect(mensagemCrm('COMMERCIAL_MOTIVO_PERDA_OBRIGATORIO')).toMatch(/motivo da perda/)
    expect(mensagemCrm('XYZ', 'padrão')).toBe('padrão')
  })
})
