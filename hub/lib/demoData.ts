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
