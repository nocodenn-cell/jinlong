/**
 * Sentry para Edge Functions (Deno) — implementação via HTTP API.
 *
 * Não usa nenhum package externo; envia eventos diretamente ao Sentry Store API.
 * Garante que erros de venda na camada Edge sejam visíveis no mesmo projeto Sentry
 * do web e do desktop, com os mesmos tags de trace_id e venda_id.
 *
 * Configuração: variável de ambiente SENTRY_DSN na Edge Function.
 * Se ausente, todas as funções são no-ops.
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
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Captura exceção na Edge Function com contexto de venda.
 *
 * Tags propagadas para o Sentry:
 *   - trace_id (= venda_id ou outbox_event.id)
 *   - venda_id
 *   - plataforma: 'edge'
 *   - modulo: 'pdv-sale'
 *   - evento: tipo do evento de negócio (ERRO_RPC_VENDA, ERRO_SYNC_OUTBOX…)
 */
export async function captureEdgeException(
  error: unknown,
  ctx: SentryEdgeContext = {},
): Promise<void> {
  const dsn = getSentryDsn()
  if (!dsn) return

  const err = error instanceof Error ? error : new Error(String(error))
  const traceId = ctx.trace_id ?? ctx.venda_id ?? ctx.request_id ?? "unknown"

  const stringTags: Record<string, string> = { plataforma: "edge", modulo: "pdv-sale" }
  for (const [k, v] of Object.entries(ctx)) {
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
