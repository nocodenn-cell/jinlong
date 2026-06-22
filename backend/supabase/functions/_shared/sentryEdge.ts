/**
 * Error Router de venda — Edge Functions (Deno / Supabase).
 *
 * Implementação via HTTP API (sem pacotes externos).
 * Deduplicação por trace_id + stage + erro.message (TTL 30 s por invocação).
 * Configuração: variável de ambiente SENTRY_DSN.
 *
 * Garantia: nunca lança — observabilidade não interrompe fluxo de venda.
 */

type SentryParsedDsn = {
  storeUrl: string
  publicKey: string
}

function parseDsn(dsn: string): SentryParsedDsn | null {
  // Formato: https://<publicKey>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/)
  if (!m) return null
  return {
    storeUrl: `https://${m[2]}/api/${m[3]}/store/`,
    publicKey: m[1],
  }
}

let _parsedDsn: SentryParsedDsn | null | undefined = undefined

function getSentryDsn(): SentryParsedDsn | null {
  if (_parsedDsn !== undefined) return _parsedDsn
  const raw = Deno.env.get("SENTRY_DSN") ?? ""
  _parsedDsn = raw ? parseDsn(raw) : null
  return _parsedDsn
}

export type SentryEdgeContext = {
  trace_id?: string
  venda_id?: string
  caixa_id?: string
  request_id?: string
  event_type?: string
  evento?: string
  rpc?: string
  stage?: 'rpc' | 'sync' | 'ui' | 'unknown'
  [key: string]: string | number | boolean | null | undefined
}

// Per-invocation dedup: Edge Functions are short-lived, 30 s TTL is sufficient
const _dedupeCache = new Map<string, number>()
const DEDUPE_TTL_MS = 30_000

function _shouldSkip(key: string): boolean {
  const now = Date.now()
  for (const [k, ts] of _dedupeCache) {
    if (now - ts > DEDUPE_TTL_MS) _dedupeCache.delete(k)
  }
  if (_dedupeCache.has(key)) return true
  _dedupeCache.set(key, now)
  return false
}

function _buildDedupeKey(err: Error, ctx: SentryEdgeContext): string {
  const traceId = ctx.trace_id ?? ctx.venda_id ?? ctx.request_id ?? "unknown"
  const stage = ctx.stage ?? "unknown"
  return `${traceId}:${stage}:${err.message}`
}

/**
 * Captura exceção na Edge Function com contexto de venda.
 * Roteamento de nível:
 *   ctx.level === 'EVENT' → não envia ao Sentry (apenas registra no console)
 *   default               → captureException via HTTP API
 */
export async function captureEdgeException(
  error: unknown,
  ctx: SentryEdgeContext & { level?: 'ERROR' | 'EVENT' | 'DEBUG' } = {},
): Promise<void> {
  // EVENT e DEBUG não vão ao Sentry
  if (ctx.level === 'EVENT' || ctx.level === 'DEBUG') return

  const dsn = getSentryDsn()
  if (!dsn) return

  const err = error instanceof Error ? error : new Error(String(error))
  const traceId = ctx.trace_id ?? ctx.venda_id ?? ctx.request_id ?? "unknown"

  const key = _buildDedupeKey(err, ctx)
  if (_shouldSkip(key)) return

  const stringTags: Record<string, string> = {
    plataforma: "edge",
    modulo: "pdv-sale",
    layer: "edge",
    stage: ctx.stage ?? "unknown",
  }
  for (const [k, v] of Object.entries(ctx)) {
    if (k === "level" || k === "stage") continue
    if (typeof v === "string" && v) stringTags[k] = v
  }

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    server_name: "supabase-edge",
    tags: stringTags,
    extra: { trace_id: traceId, ...ctx },
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split("\n")
                  .slice(1)
                  .filter((l) => l.trim())
                  .map((line) => ({ abs_path: line.trim() })),
              }
            : undefined,
        },
      ],
    },
  }

  try {
    await fetch(dsn.storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=edge-custom/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Nunca lança — observabilidade não deve quebrar o fluxo de venda
  }
}
