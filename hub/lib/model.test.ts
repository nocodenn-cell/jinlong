import { describe, expect, it } from 'vitest'
import { DEMO_LEADS } from './demoData'
import { computeStats, filterLeads, leadsQuery, parseCustomerUpdate, parseFilters, parseNote, parseStatusChange, sanitizeSearch } from './model'

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
const ID = '00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-20T12:00:00Z')

describe('filtros', () => {
  it('ignora valores fora da lista e usa 30d por padrão', () => {
    expect(parseFilters({ status: 'hack', product: 'erp', period: 'x', q: '  loja ' })).toEqual({ q: 'loja', status: null, product: null, period: '30d' })
    expect(parseFilters({ status: 'proposta', product: 'venddi', period: 'all' })).toMatchObject({ status: 'proposta', product: 'venddi', period: 'all' })
  })
  it('monta a query do PostgREST com status, produto, período e busca sanitizada', () => {
    const q = new URLSearchParams(leadsQuery({ q: 'a,b)*(', status: 'novo', product: 'jinlong', period: '7d' }, NOW))
    expect(q.get('status')).toBe('eq.novo')
    expect(q.get('product')).toBe('eq.jinlong')
    expect(q.get('created_at')).toBe('gte.2026-10-13T12:00:00.000Z')
    expect(q.get('or')).toBe('(name.ilike.*a b*,store.ilike.*a b*,contact.ilike.*a b*,protocol.ilike.*a b*)')
    expect(new URLSearchParams(leadsQuery({ q: '', status: null, product: null, period: 'all' })).has('created_at')).toBe(false)
  })
  it('sanitizeSearch remove separadores do PostgREST', () => {
    expect(sanitizeSearch('x),status.eq.(y')).toBe('x status eq y')
  })
  it('filtro em memória equivale ao do servidor', () => {
    const r = filterLeads(DEMO_LEADS, { q: 'dragão', status: null, product: 'jinlong', period: 'all' })
    expect(r.map((l) => l.store)).toEqual(['Loja Fictícia Dragão'])
    expect(filterLeads(DEMO_LEADS, { q: '', status: 'contratado', product: null, period: 'all' })).toHaveLength(2)
  })
})

describe('estatísticas', () => {
  it('conta por status/produto e conversão entre fechados', () => {
    const s = computeStats(DEMO_LEADS)
    expect(s.total).toBe(10)
    expect(s.byStatus.contratado).toBe(2)
    expect(s.byProduct.venddi).toBe(3)
    expect(s.conversion).toBe(67)
  })
})

describe('validação das ações', () => {
  it('nota/contato', () => {
    expect(parseNote(fd({ leadId: ID, kind: 'contato', body: ' Liguei ' }))).toEqual({ ok: true, value: { leadId: ID, kind: 'contato', body: 'Liguei' } })
    expect(parseNote(fd({ leadId: 'x', kind: 'nota', body: 'ok ok' })).ok).toBe(false)
    expect(parseNote(fd({ leadId: ID, kind: 'status', body: 'ok ok' })).ok).toBe(false)
    expect(parseNote(fd({ leadId: ID, kind: 'nota', body: 'x'.repeat(2001) })).ok).toBe(false)
  })
  it('status só da lista', () => {
    expect(parseStatusChange(fd({ leadId: ID, status: 'demonstracao' })).ok).toBe(true)
    expect(parseStatusChange(fd({ leadId: ID, status: 'ganho' })).ok).toBe(false)
  })
  it('cliente: valor com vírgula, vazio vira null, negativo recusado', () => {
    expect(parseCustomerUpdate(fd({ id: ID, plan: '', monthly_value: '199,90', subscription_status: 'ativo' }))).toEqual({ ok: true, value: { id: ID, plan: null, monthly_value: 199.9, subscription_status: 'ativo' } })
    expect(parseCustomerUpdate(fd({ id: ID, plan: 'x', monthly_value: '', subscription_status: 'pausado' }))).toMatchObject({ ok: true, value: { monthly_value: null } })
    expect(parseCustomerUpdate(fd({ id: ID, monthly_value: '-1', subscription_status: 'ativo' })).ok).toBe(false)
    expect(parseCustomerUpdate(fd({ id: ID, subscription_status: 'trial' })).ok).toBe(false)
  })
})

describe('dados fictícios', () => {
  it('todos claramente rotulados como fictícios', () => {
    for (const l of DEMO_LEADS) expect(l.name).toMatch(/fictício/)
  })
})
