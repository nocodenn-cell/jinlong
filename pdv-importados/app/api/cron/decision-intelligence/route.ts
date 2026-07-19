/**
 * Trigger do Decision Intelligence Orchestrator.
 *
 * GET  — Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST — execução manual (mesmo segredo; body opcional { storeIds?: string[] })
 *
 * Coordena: Engine Loop → Snapshot → Persist → Read Model projection.
 * Sem regras de negócio nesta rota.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  authorizeOrchestratorRequest,
  createSupabaseDecisionRecordRepository,
  createSupabaseDecisionSnapshotRepository,
  createWaveAProviders,
  listActiveStoreIds,
  runDecisionIntelligenceOrchestrator,
} from '@/lib/decision-intelligence'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type ManualBody = {
  storeIds?: string[]
}

async function handle(
  request: Request,
  trigger: 'manual' | 'scheduled',
  storeIds?: readonly string[],
) {
  if (!authorizeOrchestratorRequest(request.headers)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let supabase
  try {
    supabase = createAdminClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: 'admin_client', message },
      { status: 503 },
    )
  }

  const result = await runDecisionIntelligenceOrchestrator({
    trigger,
    storeIds,
    listStoreIds: storeIds ? undefined : () => listActiveStoreIds(supabase),
    snapshots: createSupabaseDecisionSnapshotRepository(supabase),
    decisions: createSupabaseDecisionRecordRepository(supabase),
    providersFactory: () => createWaveAProviders(supabase),
    persistRetries: 1,
  })

  return NextResponse.json(
    {
      ok: result.ok,
      metrics: {
        runId: result.metrics.runId,
        trigger: result.metrics.trigger,
        startedAt: result.metrics.startedAt,
        finishedAt: result.metrics.finishedAt,
        durationMs: result.metrics.durationMs,
        coreVersion: result.metrics.coreVersion,
        schemaVersion: result.metrics.schemaVersion,
        ruleVersion: result.metrics.ruleVersion,
        storesAttempted: result.metrics.storesAttempted,
        snapshotsCreated: result.metrics.snapshotsCreated,
        snapshotsReused: result.metrics.snapshotsReused,
        failuresTotal: result.metrics.failuresTotal,
        failuresByStage: result.metrics.failuresByStage,
        totals: result.metrics.totals,
        storeResults: result.metrics.storeResults.map((r) => ({
          storeId: r.storeId,
          outcome: r.outcome,
          stage: r.stage,
          snapshotId: r.snapshotId,
          contentFingerprint: r.contentFingerprint,
          ruleVersion: r.ruleVersion,
          snapshotVersion: r.snapshotVersion,
          durationMs: r.durationMs,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          observability: r.observability,
        })),
      },
    },
    { status: result.ok ? 200 : 207 },
  )
}

export async function GET(request: Request) {
  return handle(request, 'scheduled')
}

export async function POST(request: Request) {
  let storeIds: string[] | undefined
  try {
    const body = (await request.json()) as ManualBody
    if (Array.isArray(body.storeIds) && body.storeIds.length > 0) {
      storeIds = body.storeIds.filter((id) => typeof id === 'string' && id.trim())
    }
  } catch {
    // body opcional
  }
  return handle(request, 'manual', storeIds)
}
