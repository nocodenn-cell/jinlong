/**
 * Ingestão de telemetria do pipeline de bip (caixa): POST síncrono com sessão Supabase.
 * Fase inicial: volume baixo/medio. Se crescer: fila, fire-and-forget, edge ou batch writer.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeHumanTelemetryPayload,
  type HumanTelemetryPayload,
  type HumanTelemetryPayloadInput,
} from '../../../../../shared-core/src/pdv/scan-pipeline'

const MAX_EVENTS = 40

function isTelemetryEventInput(x: unknown): x is HumanTelemetryPayloadInput {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.scanId !== 'string' || typeof o.event !== 'string' || typeof o.at !== 'number') {
    return false
  }
  if (o.sequenceNumber !== undefined && typeof o.sequenceNumber !== 'number') return false
  if (
    o.schemaVersion !== undefined &&
    (typeof o.schemaVersion !== 'number' || !Number.isFinite(o.schemaVersion))
  ) {
    return false
  }
  return true
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (body === null || typeof body !== 'object' || !('events' in body)) {
    return NextResponse.json({ ok: false, error: 'missing_events' }, { status: 400 })
  }

  const raw = (body as { events: unknown }).events
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) {
    return NextResponse.json({ ok: false, error: 'events_length' }, { status: 400 })
  }

  const events: HumanTelemetryPayload[] = raw
    .filter(isTelemetryEventInput)
    .map((e) => normalizeHumanTelemetryPayload(e))

  if (events.length === 0) {
    return NextResponse.json({ ok: false, error: 'no_valid_events' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const rows = events.map((e) => {
    const cupomSid =
      typeof e.ctx?.cupomSessionId === 'string' && e.ctx.cupomSessionId !== ''
        ? e.ctx.cupomSessionId
        : null
    const flowCorr =
      typeof e.ctx?.correlationId === 'string' && e.ctx.correlationId !== ''
        ? e.ctx.correlationId
        : null
    return {
      user_id: user.id,
      cupom_session_id: cupomSid,
      correlation_id: flowCorr,
      scan_id: e.scanId,
      sequence_number: e.sequenceNumber ?? null,
      event_name: e.event,
      schema_version: e.schemaVersion,
      payload: e as unknown as Record<string, unknown>,
    }
  })

  const { error } = await supabase.from('caixa_scan_telemetry_events').insert(rows)

  if (error) {
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: rows.length })
}
