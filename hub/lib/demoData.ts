import type { Atividade, Plano, Trial, TrialLead } from './conversao'
import type { Customer, Lead, LeadEvent, LeadStatus, Product } from './model'

/** DADOS FICTÍCIOS — nomes, lojas e contatos inventados, só para demonstração do layout. */
const now = Date.now()
const ago = (d: number, h = 0) => new Date(now - d * 86_400_000 - h * 3_600_000).toISOString()
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const rows: Array<[string, string, string, 'whatsapp' | 'wechat', Product, LeadStatus, number]> = [
  ['Exemplo Wang (fictício)', 'Loja Fictícia Dragão', '11 90000-0001', 'whatsapp', 'jinlong', 'novo', 0],
  ['Exemplo Chen (fictício)', 'Bazar Exemplo Brás', 'exemplo_chen', 'wechat', 'jinlong', 'contatado', 1],
  ['Exemplo Silva (fictício)', 'Mercadinho Demo', '11 90000-0003', 'whatsapp', 'venddi', 'demonstracao', 2],
  ['Exemplo Li (fictício)', 'Atacado Teste 25 de Março', 'exemplo_li88', 'wechat', 'jinlong', 'proposta', 4],
  ['Exemplo Souza (fictício)', 'Papelaria Modelo', '21 90000-0005', 'whatsapp', 'venddi', 'contratado', 9],
  ['Exemplo Zhang (fictício)', 'Calçados Amostra', '11 90000-0006', 'whatsapp', 'jinlong', 'contratado', 12],
  ['Exemplo Lima (fictício)', 'Loja Simulada Centro', '31 90000-0007', 'whatsapp', 'venddi', 'perdido', 15],
  ['Exemplo Huang (fictício)', 'Bolsas Exemplo Bom Retiro', 'exemplo_huang', 'wechat', 'jinlong', 'novo', 0.3],
  ['Exemplo Costa (fictício)', 'Eletrônicos Demo', '11 90000-0009', 'whatsapp', 'jinlong', 'demonstracao', 6],
  ['Exemplo Liu (fictício)', 'Utilidades Fictícias', 'exemplo_liu', 'wechat', 'jinlong', 'contatado', 20],
]

export const DEMO_LEADS: Lead[] = rows.map(([name, store, contact, channel, product, status, d], i) => ({
  id: id(i + 1),
  protocol: `${product === 'jinlong' ? 'JL' : 'VD'}-261020-EXEMP${'ABCDEFGHJK'[i]}`,
  product,
  name,
  store,
  contact,
  channel,
  locale: channel === 'wechat' ? 'zh-CN' : 'pt-BR',
  status,
  origem: 'site',
  empresa_id: null,
  created_at: ago(d, i),
  updated_at: ago(d / 2, i),
}))

export const DEMO_EVENTS: LeadEvent[] = [
  { id: id(101), lead_id: id(4), kind: 'status', body: null, from_status: 'demonstracao', to_status: 'proposta', created_at: ago(1) },
  { id: id(102), lead_id: id(4), kind: 'nota', body: 'Exemplo fictício: quer preço de atacado por caixa e duas lojas.', from_status: null, to_status: null, created_at: ago(2) },
  { id: id(103), lead_id: id(4), kind: 'contato', body: 'Exemplo fictício: demonstração feita por vídeo, 30 min.', from_status: null, to_status: null, created_at: ago(3) },
  { id: id(104), lead_id: id(4), kind: 'status', body: null, from_status: 'novo', to_status: 'demonstracao', created_at: ago(3.5) },
]

export const DEMO_CUSTOMERS: Customer[] = [
  { id: id(201), lead_id: id(5), product: 'venddi', store_name: 'Papelaria Modelo', contact: '21 90000-0005', contracted_at: ago(7).slice(0, 10), plan: 'Exemplo fictício', monthly_value: null, subscription_status: 'ativo', notes: null },
  { id: id(202), lead_id: id(6), product: 'jinlong', store_name: 'Calçados Amostra', contact: '11 90000-0006', contracted_at: ago(10).slice(0, 10), plan: null, monthly_value: null, subscription_status: 'ativo', notes: null },
]

// ── Central de Conversão: testes grátis FICTÍCIOS ────────────────────────────
const ahead = (d: number) => new Date(now + d * 86_400_000).toISOString()
const tid = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const act = (vendas_total: number, vendas_7d: number, produtos_proprios: number, acessoDias: number | null): Atividade => ({
  ultimo_acesso: acessoDias === null ? null : ago(acessoDias), usuarios_ativos: 1, lojas_ativas: 1, produtos_proprios,
  caixas_abertos: vendas_total ? 2 : 0, vendas_total, vendas_7d, ultima_venda: vendas_total ? ago(vendas_7d ? 0.5 : 9) : null,
})
const lead = (n: number, name: string, contact: string, status: LeadStatus, interesse: TrialLead['interesse'], proximo: string | null): TrialLead => ({
  id: id(300 + n), protocol: `JL-261020-TESTE${'ABCDEF'[n]}`, status, interesse, proximo_contato: proximo, name, contact,
  channel: contact.includes('@') ? 'email' : 'whatsapp', email: `exemplo${n}@exemplo.test`, locale: n % 2 ? 'zh-CN' : 'pt-BR', created_at: ago(13 - n),
})
const trial = (n: number, nome: string, fimDias: number, status: string, l: TrialLead | null, a: Atividade, extra: Partial<Trial> = {}): Trial => ({
  empresa_id: tid(n), empresa_nome: nome, criado_em: ago(15 - fimDias), trial_fim: ahead(fimDias), status,
  motivo_status: status === 'SUSPENSA' ? 'TRIAL_EXPIRADO' : null, plano_codigo: 'ATACADO', addons: [], qtd_lojas: 1, qtd_caixas: 1,
  forma_pagamento: 'PIX', valor_mensal_centavos: null, tem_cobranca_asaas: false, lead: l, ultimo_contato_em: null,
  solicitou_contratacao_em: null, atividade: a, ...extra,
})

export const DEMO_TRIALS: Trial[] = [
  trial(1, 'Bazar Fictício Oriente', 2, 'TRIAL', lead(1, 'Exemplo Wu (fictício)', '11 90000-0101', 'proposta', 'alto', ago(0).slice(0, 10)),
    act(34, 12, 48, 0.2), { solicitou_contratacao_em: ago(0.3), ultimo_contato_em: ago(1) }),
  trial(2, 'Utilidades Demo Brás', 9, 'TRIAL', lead(2, 'Exemplo Zhou (fictício)', 'exemplo2@exemplo.test', 'contatado', 'medio', null), act(3, 3, 6, 1)),
  trial(3, 'Loja Exemplo Centro', 12, 'TRIAL', lead(3, 'Exemplo Rocha (fictício)', '11 90000-0103', 'novo', null, null), act(0, 0, 0, null)),
  trial(4, 'Presentes Simulados', -3, 'SUSPENSA', lead(4, 'Exemplo Gao (fictício)', '11 90000-0104', 'demonstracao', 'medio', null),
    act(8, 0, 15, 4), { ultimo_contato_em: ago(5) }),
  trial(5, 'Eletro Amostra 25', -10, 'ATIVA', lead(5, 'Exemplo Tang (fictício)', '11 90000-0105', 'contratado', 'alto', null),
    act(120, 40, 210, 0.1), { plano_codigo: 'REDE', valor_mensal_centavos: 24900, motivo_status: 'CONVERSAO_MANUAL' }),
]

export const DEMO_TRIAL_EVENTS: LeadEvent[] = [
  { id: id(401), lead_id: id(301), kind: 'solicitacao', body: 'Exemplo fictício: pedido de contratação pelo dono · plano REDE · quer 2 lojas', from_status: null, to_status: null, created_at: ago(0.3) },
  { id: id(402), lead_id: id(301), kind: 'contato', body: 'Exemplo fictício: ligação de 15 min, pediu proposta para 2 lojas.', from_status: null, to_status: null, created_at: ago(1) },
  { id: id(403), lead_id: id(301), kind: 'status', body: null, from_status: 'contatado', to_status: 'proposta', created_at: ago(1) },
]

export const DEMO_PLANOS: Plano[] = [
  { codigo: 'BASICO', nome: 'Básico', tipo: 'PLANO', preco_loja_centavos: 9900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: 1, preco_placeholder: true },
  { codigo: 'ATACADO', nome: 'Atacado', tipo: 'PLANO', preco_loja_centavos: 17900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: 1, preco_placeholder: true },
  { codigo: 'REDE', nome: 'Rede', tipo: 'PLANO', preco_loja_centavos: 24900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: null, preco_placeholder: true },
  { codigo: 'FISCAL', nome: 'Fiscal (NFC-e/NF-e)', tipo: 'ADDON', preco_loja_centavos: 5900, preco_caixa_adicional_centavos: 0, caixas_inclusos_por_loja: 0, max_lojas: null, preco_placeholder: true },
]
