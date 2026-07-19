import { describe, expect, it } from 'vitest'
import { createInMemoryDecisionRecordRepository } from './adapters/in-memory-decision-record-repository'
import { createInMemoryGovernedMemoryRepository } from './adapters/in-memory-governed-memory-repository'
import { recordGovernedMemoryFromDecision } from './governed-feedback'
import { buildDecisionIntelligenceReadModel } from './read-model/build-read-model'
import { EMPTY_TIMED_OUTCOMES } from './models/decision-record'

describe('Governed Feedback (Onda 4)', () => {
  it('registra outcome humano na Memory governada sem alterar regras', async () => {
    const decisions = createInMemoryDecisionRecordRepository()
    const memory = createInMemoryGovernedMemoryRepository()

    const created = await decisions.create({
      lojaId: 'loja-gov-1',
      recommendationId: 'rec:REVIEW_MARGIN:LOW_MARGIN',
      status: 'accepted',
      decisionReason: 'BUSINESS_POLICY',
      actorId: 'actor-1',
      expectedOutcome: {
        metricCode: 'GrossMargin',
        value: 0.28,
        unit: 'ratio',
      },
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const record = await decisions.findById(created.id)
    expect(record).toBeTruthy()

    const mem = await recordGovernedMemoryFromDecision(
      memory,
      record!,
      'DECISION_RECORDED',
    )
    expect(mem.ok).toBe(true)

    await decisions.updateOutcomes(created.id, {
      actualOutcome: {
        metricCode: 'GrossMargin',
        value: 0.27,
        unit: 'ratio',
        measuredAt: '2026-07-19T22:00:00.000Z',
      },
      outcomes: {
        ...EMPTY_TIMED_OUTCOMES,
        d30: {
          status: 'RECORDED',
          measuredAt: '2026-07-19T22:00:00.000Z',
          actual: {
            metricCode: 'GrossMargin',
            value: 0.27,
            unit: 'ratio',
          },
        },
      },
    })
    const updated = await decisions.findById(created.id)
    const outcomeMem = await recordGovernedMemoryFromDecision(
      memory,
      updated!,
      'OUTCOME_RECORDED',
    )
    expect(outcomeMem.ok).toBe(true)

    const entries = await memory.listByLoja('loja-gov-1')
    expect(entries).toHaveLength(2)
    expect(entries[0]?.noteCodes.join(' ')).toMatch(/intel\.governed/)
    expect(entries.every((e) => e.decisionId === created.id)).toBe(true)

    const rm = buildDecisionIntelligenceReadModel({
      snapshot: null,
      records: [updated!],
      governedMemory: entries,
    })
    expect(rm.governedMemory.entryCount).toBe(2)
    expect(rm.governedMemory.items[0]?.eventKind).toBeTruthy()
  })

  it('não contém sinais de aprendizado automático / IA', async () => {
    const memory = createInMemoryGovernedMemoryRepository()
    const result = await memory.append({
      lojaId: 'loja-gov-2',
      decisionId: 'd1',
      recommendationId: 'rec:1',
      eventKind: 'DECISION_RECORDED',
      decisionStatus: 'rejected',
      decisionReason: 'HUMAN_OVERRIDE',
      noteCodes: ['intel.governed.decision.rejected'],
    })
    expect(result.ok).toBe(true)
    const blob = JSON.stringify(memory._all())
    expect(blob).not.toMatch(/llm|embedding|train|auto.?tune|reinforcement/i)
  })
})
