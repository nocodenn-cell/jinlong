import { describe, expect, it } from 'vitest'
import { derivarPeriodoDespesas, calcularDre } from './dreLogic'

// ─────────────────────────────────────────────────────────────
// F10-A — Período de despesas alinhado ao período das receitas
// ─────────────────────────────────────────────────────────────
describe('derivarPeriodoDespesas — F10-A: alinhamento de período', () => {
  it('F10-A: sem filtros na URL usa dados.periodo (não Date.now())', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-05-26',
      periodoAte: '2026-06-24',
      tz: 'UTC',
    })

    // Deve ancorar em datas civis, não em timestamp flutuante
    expect(despesasDe).toBe('2026-05-26T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-24T23:59:59.999Z')
  })

  it('F10-A: com filtros na URL usa as datas fornecidas, não dados.periodo', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: '2026-06-01',
      spAte: '2026-06-15',
      periodoDe: '2026-05-26', // seria ignorado
      periodoAte: '2026-06-24', // seria ignorado
      tz: 'UTC',
    })

    expect(despesasDe.startsWith('2026-06-01')).toBe(true)
    expect(despesasAte.startsWith('2026-06-15')).toBe(true)
  })

  it('F10-A: com spDe sem spAte usa spDe + periodoAte como fim', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: '2026-06-10',
      spAte: undefined,
      periodoDe: '2026-05-26',
      periodoAte: '2026-06-24',
      tz: 'UTC',
    })

    expect(despesasDe.startsWith('2026-06-10')).toBe(true)
    expect(despesasAte).toBe('2026-06-24T23:59:59.999Z')
  })

  it('F10-A: período derivado cobre o mesmo mês que as receitas (dia civil coincide)', () => {
    const periodoDe = '2026-05-26'
    const { despesasDe } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe,
      periodoAte: '2026-06-24',
      tz: 'UTC',
    })
    const date = new Date(despesasDe)
    expect(date.toISOString().slice(0, 10)).toBe(periodoDe)
  })

  it('período "hoje": 1 dia — despesasDe == despesasAte (mesmo dia, UTC)', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-06-24',
      periodoAte: '2026-06-24',
      tz: 'UTC',
    })
    expect(despesasDe).toBe('2026-06-24T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-24T23:59:59.999Z')
  })

  it('período "7 dias": início 7 dias antes, fim hoje (UTC)', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-06-17',
      periodoAte: '2026-06-24',
      tz: 'UTC',
    })
    expect(despesasDe).toBe('2026-06-17T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-24T23:59:59.999Z')
  })

  it('período "mês atual": início no dia 1, fim no último dia (UTC)', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-06-01',
      periodoAte: '2026-06-30',
      tz: 'UTC',
    })
    expect(despesasDe).toBe('2026-06-01T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-30T23:59:59.999Z')
  })

  it('período "30 dias": ancoras não sofrem drift de Date.now() (UTC)', () => {
    const periodoDe = '2026-05-25'
    const periodoAte = '2026-06-23'
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe,
      periodoAte,
      tz: 'UTC',
    })
    expect(despesasDe).toBe('2026-05-25T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-23T23:59:59.999Z')
    const diff = new Date(despesasAte).getTime() - new Date(despesasDe).getTime()
    expect(Math.round(diff / 86_400_000)).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────
// F10-B — Limites UTC corretos por fuso (BRT e outros)
// ─────────────────────────────────────────────────────────────
describe('derivarPeriodoDespesas — F10-B: limites UTC por fuso', () => {
  // BRT = UTC-3: civil midnight = 03:00 UTC; civil 23:59:59 = next day 02:59:59 UTC
  it('BRT (UTC-3): despesasDe = dia civil T03:00:00Z (não T00:00:00Z)', () => {
    const { despesasDe } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-01-01',
      periodoAte: '2026-01-31',
      tz: 'America/Sao_Paulo',
    })
    expect(despesasDe).toBe('2026-01-01T03:00:00.000Z')
  })

  it('BRT (UTC-3): despesasAte = próximo dia T02:59:59.999Z (não mesmo dia T23:59:59Z)', () => {
    const { despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-01-01',
      periodoAte: '2026-01-31',
      tz: 'America/Sao_Paulo',
    })
    // Fim de 2026-01-31 em BRT = 2026-02-01T02:59:59.999Z
    expect(despesasAte).toBe('2026-02-01T02:59:59.999Z')
  })

  it('BRT: período de 1 dia cobre exatamente 24h (T03:00Z até próximo T02:59:59.999Z)', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-06-24',
      periodoAte: '2026-06-24',
      tz: 'America/Sao_Paulo',
    })
    expect(despesasDe).toBe('2026-06-24T03:00:00.000Z')
    expect(despesasAte).toBe('2026-06-25T02:59:59.999Z')
    const ms = new Date(despesasAte).getTime() - new Date(despesasDe).getTime() + 1
    expect(ms).toBe(86_400_000) // exatamente 24h
  })

  it('BRT: período 30 dias cobre exatamente 30 dias × 86400000ms', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-05-25',
      periodoAte: '2026-06-23',
      tz: 'America/Sao_Paulo',
    })
    const ms = new Date(despesasAte).getTime() - new Date(despesasDe).getTime() + 1
    expect(ms).toBe(30 * 86_400_000)
  })

  it('BRT: com filtros na URL também aplica offset correto', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: '2026-06-01',
      spAte: '2026-06-15',
      periodoDe: '2026-05-01',
      periodoAte: '2026-05-31',
      tz: 'America/Sao_Paulo',
    })
    expect(despesasDe).toBe('2026-06-01T03:00:00.000Z')
    expect(despesasAte).toBe('2026-06-16T02:59:59.999Z')
  })

  it('UTC: limites idênticos a YYYY-MM-DDT00:00:00Z e T23:59:59.999Z', () => {
    const { despesasDe, despesasAte } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-06-01',
      periodoAte: '2026-06-30',
      tz: 'UTC',
    })
    expect(despesasDe).toBe('2026-06-01T00:00:00.000Z')
    expect(despesasAte).toBe('2026-06-30T23:59:59.999Z')
  })

  it('UTC+9 (Asia/Tokyo): despesasDe = dia anterior T15:00:00Z', () => {
    // Midnight JST = 15:00 UTC previous day
    const { despesasDe } = derivarPeriodoDespesas({
      spDe: undefined,
      spAte: undefined,
      periodoDe: '2026-01-01',
      periodoAte: '2026-01-31',
      tz: 'Asia/Tokyo',
    })
    expect(despesasDe).toBe('2025-12-31T15:00:00.000Z')
  })
})

// ─────────────────────────────────────────────────────────────
// F9 — DRE: custo estimado ausente; sem mistura de bases
// ─────────────────────────────────────────────────────────────
describe('calcularDre', () => {
  it('F9: custoEstimado NÃO existe no retorno (campo removido)', () => {
    const dre = calcularDre({
      receitaLiquida: 90,
      totalDescontos: 10,
      margemBruta: 40,
      despesasPagas: 15,
    })

    // A chave custoEstimado não deve existir — era matematicamente errada
    expect('custoEstimado' in dre).toBe(false)
  })

  it('F9: receita bruta = líquida + descontos (sempre correto)', () => {
    const dre = calcularDre({
      receitaLiquida: 900,
      totalDescontos: 100,
      margemBruta: 300,
      despesasPagas: 50,
    })

    expect(dre.receitaBruta).toBe(1000)
    expect(dre.receitaLiquida).toBe(900)
    expect(dre.totalDescontos).toBe(100)
  })

  it('F9: desconto de gerente — resultado não é inflado pela diferença de base', () => {
    // Cenário auditado: produto R$100, custo R$60, 1 unidade, gerente 10%
    //   v.total_liquido    = R$90   (com desconto de gerente)
    //   margem_bruta (064) = R$40   (sem desconto de gerente em iv.preco_unitario)
    //   OLD: custoEstimado = R$90 - R$40 = R$50 (errado — deveria ser R$60)
    //   NEW: custoEstimado não existe; não misturamos as bases

    const receitaLiquida = 90   // v.total_liquido após 10% gerente
    const margemBruta = 40      // RPC 064: (100 - 60), calculado sobre iv.preco_unitario

    const dre = calcularDre({
      receitaLiquida,
      totalDescontos: 10,
      margemBruta,
      despesasPagas: 0,
    })

    // Antes do fix: custoEstimado = 90 - 40 = 50 (errado; real = 60)
    // Após o fix: nenhum custoEstimado calculado
    expect('custoEstimado' in dre).toBe(false)

    // resultadoEstimado usa margemBruta diretamente (limitação F9-B documentada)
    expect(dre.resultadoEstimado).toBe(40)
  })

  it('F9: resultadoEstimado é null quando margemBruta é null (custo não confiável)', () => {
    const dre = calcularDre({
      receitaLiquida: 500,
      totalDescontos: 50,
      margemBruta: null,
      despesasPagas: 100,
    })

    expect(dre.resultadoEstimado).toBeNull()
  })

  it('F9: resultadoEstimado é null quando despesasPagas é null (query falhou)', () => {
    const dre = calcularDre({
      receitaLiquida: 500,
      totalDescontos: 50,
      margemBruta: 200,
      despesasPagas: null,
    })

    expect(dre.resultadoEstimado).toBeNull()
  })

  it('F9: resultado negativo quando despesas excedem margem', () => {
    const dre = calcularDre({
      receitaLiquida: 1000,
      totalDescontos: 0,
      margemBruta: 200,
      despesasPagas: 350,
    })

    expect(dre.resultadoEstimado).toBe(-150)
  })

  // ── Cenários com desconto de gerente em múltiplos percentuais (item 1.4) ──

  it('desconto 0%: sem gerente, receita bruta == soma_iv_preco_unitario (sem distorção)', () => {
    // Produto R$100, custo R$60, 1 unidade, sem desconto
    const dre = calcularDre({
      receitaLiquida: 100,
      totalDescontos: 0,
      margemBruta: 40,  // RPC 064: 100 - 60
      despesasPagas: 0,
    })
    expect(dre.receitaBruta).toBe(100)
    expect(dre.resultadoEstimado).toBe(40)
    // Nenhuma distorção quando não há desconto
    expect(dre.receitaBruta - dre.receitaLiquida).toBe(0)
  })

  it('desconto 5% gerente: margemBruta (RPC 064) sobreestimada em R$5', () => {
    // Produto R$100, custo R$60, 1 unidade, 5% desconto gerente
    // total_liquido = R$95, iv.preco_unitario = R$100, margem_064 = R$40
    // margem_real = R$95 - R$60 = R$35 (sobreestimada em R$5)
    const dre = calcularDre({
      receitaLiquida: 95,
      totalDescontos: 5,
      margemBruta: 40,   // RPC 064 usa iv.preco_unitario R$100
      despesasPagas: 0,
    })
    expect(dre.receitaBruta).toBe(100)
    expect(dre.receitaLiquida).toBe(95)
    // resultadoEstimado = margemBruta (F9-B: limitação documentada, sobreestimado em R$5)
    expect(dre.resultadoEstimado).toBe(40)
    // O valor sobreestimado é exatamente o desconto
    expect(dre.resultadoEstimado! - (dre.receitaLiquida - 60)).toBe(5)
  })

  it('desconto 10% gerente: margemBruta sobreestimada em R$12.50 (caso real do banco)', () => {
    // Dados reais: total_bruto=125, total_desconto=12.50, total_liquido=112.50
    // custo_real=52, margem_rpc064=73, margem_real=60.50
    const dre = calcularDre({
      receitaLiquida: 112.50,
      totalDescontos: 12.50,
      margemBruta: 73,   // RPC 064: 125 - 52
      despesasPagas: 0,
    })
    expect(dre.receitaBruta).toBe(125)
    expect(dre.resultadoEstimado).toBe(73)
    // Sobreestimação = desconto de gerente
    expect(dre.resultadoEstimado! - (dre.receitaLiquida - 52)).toBeCloseTo(12.50, 2)
  })

  it('desconto 20% gerente: margemBruta sobreestimada em R$20', () => {
    // Produto R$100, custo R$60, 1 unidade, 20% desconto gerente
    // total_liquido = R$80, iv.preco_unitario = R$100, margem_064 = R$40
    // margem_real = R$80 - R$60 = R$20
    const dre = calcularDre({
      receitaLiquida: 80,
      totalDescontos: 20,
      margemBruta: 40,   // RPC 064 usa iv.preco_unitario
      despesasPagas: 0,
    })
    expect(dre.receitaBruta).toBe(100)
    expect(dre.resultadoEstimado).toBe(40)
    // Sobreestimação de R$20 = exatamente o desconto aplicado
    expect(dre.resultadoEstimado! - (dre.receitaLiquida - 60)).toBe(20)
  })
})
