import { describe, expect, it, vi } from 'vitest'
import { createInMemoryDecisionRecordRepository } from './adapters/in-memory-decision-record-repository'
import { createSupabaseDecisionRecordRepository } from './adapters/supabase-decision-record-repository'
import { EMPTY_TIMED_OUTCOMES } from './models/decision-record'

describe('DecisionRecord (Fase 2)', () => {
  it('cria registro pós-Recommendation com motivo e expectedOutcome', async () => {
    const repo = createInMemoryDecisionRecordRepository()
    const saved = await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:REVIEW_MARGIN_DRIVERS:LOW_MARGIN',
      status: 'accepted',
      decisionReason: 'BUSINESS_POLICY',
      expectedOutcome: {
        metricCode: 'GrossMargin',
        value: 0.04,
        unit: 'ratio_delta',
        descriptionCode: 'intel.decision.expected.margin_lift',
      },
      reviewDate: '2026-08-18',
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const row = await repo.findById(saved.id)
    expect(row?.status).toBe('accepted')
    expect(row?.decisionReason).toBe('BUSINESS_POLICY')
    expect(row?.expectedOutcome?.value).toBe(0.04)
    expect(row?.outcomes).toEqual(EMPTY_TIMED_OUTCOMES)
    expect(row?.recommendationId).toContain('REVIEW_MARGIN_DRIVERS')
  })

  it('não é uma Recommendation — não exige evidences/ruleId/kpisUsed', async () => {
    const repo = createInMemoryDecisionRecordRepository()
    const saved = await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:x',
      status: 'rejected',
      decisionReason: 'OUT_OF_STOCK',
      notes: 'Sem estoque para agir',
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const row = await repo.findById(saved.id)
    expect(row).toBeDefined()
    expect(JSON.stringify(row)).not.toMatch(/evidences|ruleVersion|kpisUsed/)
  })

  it('atualiza actualOutcome e slot 30d sem lógica de negócio no repo', async () => {
    const repo = createInMemoryDecisionRecordRepository()
    const saved = await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:margin',
      status: 'executed',
      decisionReason: 'SEASONAL',
      expectedOutcome: {
        metricCode: 'GrossMargin',
        value: 0.04,
        unit: 'ratio_delta',
      },
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const updated = await repo.updateOutcomes(saved.id, {
      actualOutcome: {
        metricCode: 'GrossMargin',
        value: 0.036,
        unit: 'ratio_delta',
        measuredAt: '2026-08-18T12:00:00.000Z',
      },
      outcomes: {
        d30: {
          status: 'RECORDED',
          measuredAt: '2026-08-18T12:00:00.000Z',
          actual: {
            metricCode: 'GrossMargin',
            value: 0.036,
            unit: 'ratio_delta',
          },
        },
      },
      status: 'executed',
    })
    expect(updated.ok).toBe(true)

    const row = await repo.findById(saved.id)
    expect(row?.actualOutcome?.value).toBe(0.036)
    expect(row?.outcomes.d30.status).toBe('RECORDED')
    expect(row?.outcomes.d60.status).toBe('PENDING')
    expect(row?.outcomes.d90.status).toBe('PENDING')
  })

  it('lista por loja e por recommendationId', async () => {
    const repo = createInMemoryDecisionRecordRepository()
    await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:a',
      status: 'accepted',
      decisionReason: 'OTHER',
      decisionAt: '2026-07-19T10:00:00.000Z',
    })
    await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:a',
      status: 'deferred',
      decisionReason: 'HUMAN_OVERRIDE',
      decisionAt: '2026-07-19T11:00:00.000Z',
    })
    await repo.create({
      lojaId: 'loja-2',
      recommendationId: 'rec:b',
      status: 'rejected',
      decisionReason: 'OTHER',
    })

    const byRec = await repo.findByRecommendationId('rec:a')
    expect(byRec).toHaveLength(2)
    const byLoja = await repo.listByLoja('loja-1')
    expect(byLoja).toHaveLength(2)
    expect(byLoja.every((r) => r.lojaId === 'loja-1')).toBe(true)
  })

  it('adapter Supabase mapeia insert sem regras de negócio', async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({
          data: { id: '22222222-2222-2222-2222-222222222222' },
          error: null,
        }),
      }),
    })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    }
    const repo = createSupabaseDecisionRecordRepository(supabase as never)
    const result = await repo.create({
      lojaId: 'loja-1',
      recommendationId: 'rec:1',
      status: 'accepted',
      decisionReason: 'BUSINESS_POLICY',
      expectedOutcome: { metricCode: 'GrossMargin', value: 0.04 },
    })
    expect(result.ok).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('decision_records')
    const row = insert.mock.calls[0]?.[0]
    expect(row.status).toBe('accepted')
    expect(row.decision_reason).toBe('BUSINESS_POLICY')
    expect(row.expected_outcome.value).toBe(0.04)
  })
})
