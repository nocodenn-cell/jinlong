/**
 * Pipeline de leitura (bip / scanner) — contratos compartilhados entre web e desktop.
 *
 * PR 1.5: vocabulário operacional (tipos + API do controller). Runner e adapter: PRs 2A/2B.
 * Ver docs/CONTRATO_PIPELINE_BIP.md.
 *
 * @module @fastproduct/shared-core/pdv
 */

/** Origem da leitura para métricas e correlação. */
export type ScanIngressSource =
  | 'scanner'
  | 'manual_input'
  | 'form_submit'
  | 'other'

/**
 * Lifecycle **operacional / UX humano** — não misturar com `ScanStage` (detalhe do motor).
 */
export type ScanState =
  | 'queued'
  | 'processing'
  /** Linha/carrinho atualizado mas preço/regras ainda reconciliam (conforme ADR). */
  | 'pending_resolution'
  | 'acknowledged'
  | 'failed'
  | 'cancelled'

/**
 * Estágio **técnico** do motor (subdivisão dentro de `processing` / `pending_resolution`).
 * Não é sinónimo de `ScanState`.
 */
export type ScanStage =
  | 'ingress'
  | 'product_lookup_started'
  | 'product_resolved'
  | 'pricing_started'
  | 'pricing_resolved'
  | 'ui_ack'
  | 'ui_cart_updated'
  | 'focus_restored'
  | 'failed'

/** Metadados opcionais ligados a uma leitura enfileirada. */
export type ScanEventMeta = {
  /** Onde a leitura entrou no sistema. */
  source?: ScanIngressSource
  /** Id de correlação de **fluxo/trace** (ex.: OpenTelemetry, request único). */
  correlationId?: string
  /**
   * Sessão operacional do cupom (novo cupom ⇒ novo id). Obrigatório no caixa web para
   * isolamento de domínio, auditoria e telemetria; omitido em testes unitários do motor.
   *
   * **Nota:** hoje o caixa web pode preencher `correlationId` com o mesmo valor que
   * `cupomSessionId` por pragmatismo; isso **não** é contrato permanente — no futuro
   * `correlationId` deve identificar o trace do evento, não o contexto do cupom.
   */
  cupomSessionId?: string
}

/**
 * Unidade de **ingresso** (antes da fila com `sequenceNumber`).
 * Identidade: `id` (UUID). Ordem lógica oficial: `sequenceNumber` em `QueuedScan`, atribuído no `enqueue`.
 */
export type ScanEvent = {
  id: string
  codigo: string
  /** Instante em que o código foi capturado (detector, input, formulário). */
  receivedAt: number
  meta?: ScanEventMeta
}

/**
 * Marcos temporais serializáveis (testes, telemetria, suporte).
 * `receivedAt` também existe em `event.receivedAt`; `enqueuedAt` é quando o item foi aceite na fila.
 */
export type ScanLifecycleTimestamps = {
  /** Aceite na fila (após backpressure/dedupe). */
  enqueuedAt?: number
  processingStartedAt?: number
  processingFinishedAt?: number
  acknowledgedAt?: number
  failedAt?: number
  cancelledAt?: number
}

/**
 * Entidade **da fila** — preferir esta referência no motor e no `subscribe`; não enfileirar só `ScanEvent` cru.
 */
export type QueuedScan = {
  /** Ordem lógica oficial por terminal (monotónico no `enqueue`). Não é orden global multi-caixa. */
  sequenceNumber: number
  event: ScanEvent
  state: ScanState
  stage?: ScanStage
  timestamps: ScanLifecycleTimestamps
  /** Tentativas de processamento (retry explícito no PRs futuros). */
  attempts: number
}

/** Política quando a fila está cheia ou sob pressão (semântica documentada; implementação por fases). */
export type BackpressureStrategy = 'reject_new' | 'drop_oldest' | 'drop_newest'

export type ScanPipelineFlushReason = 'shutdown' | 'test' | 'manual' | 'new_cupom'

/**
 * Semântica explícita de `flush` (evita ambiguidade drain vs discard).
 * Implementação no PR 2A+.
 */
export type ScanPipelineFlushOptions = {
  /** Se true: itens ainda não processados não são executados; política exacta no runner. */
  discardPending?: boolean
  reason?: ScanPipelineFlushReason
}

/** Classificação simples de falha para UX e telemetria. */
export type ScanFailureReason =
  | 'network'
  | 'not_found'
  | 'ambiguous'
  | 'validation'
  | 'queue_full'
  | 'aborted'
  /** Scan enfileirado para outro `cupomSessionId` (cupom mudou; async tardio). */
  | 'stale_cupom'
  | 'unknown'

/**
 * Eventos mínimos para telemetria centrada no operador (PR 3+).
 * Nomes estáveis para agregação p50/p95/p99.
 */
export type HumanTelemetryScanEvent =
  | 'scan_received'
  | 'scan_processing_started'
  | 'scan_processing_finished'
  | 'scan_latency_total'
  /** término → `receivedAt` (alias estável para agregadores p50/p95/p99). */
  | 'scan_total_duration_ms'
  /** `processingStartedAt` − `enqueuedAt` / ingresso na fila. */
  | 'queue_wait_duration_ms'
  /** `processingFinishedAt` − início do handler (tempo útil do adapter). */
  | 'processing_duration_ms'
  /** Idade do scan ao iniciar o handler (`now` − `receivedAt`). */
  | 'current_scan_age_ms'
  /** Novo pico de profundidade da fila de espera (não inclui o item em processamento). */
  | 'queue_depth_peak'
  /** Flush por novo cupom: leituras descartadas + cancelamento cooperativo do atual. */
  | 'scans_cancelled_on_new_cupom'
  /** Handler cooperativo abortado (flush/shutdown) antes de concluir com sucesso. */
  | 'scan_processing_aborted'
  | 'scan_queue_depth'
  | 'scan_failed'
  | 'scan_dropped'
  | 'scan_duplicate_detected'
  | 'buscar_produto_duration_ms'
  | 'pricing_rpc_duration_ms'
  /** `receivedAt` → feedback visual perceptível (toast/banner de sucesso ou aviso pós‑add). */
  | 'scan_to_visual_ack_ms'
  | 'subtotal_render_duration_ms'
  | 'focus_restore_duration_ms'
  | 'double_finalize_attempt'

/**
 * Revisão do contrato de `HumanTelemetryPayload` (incrementar em mudanças de formato;
 * agregadores e replay devem filtrar por este valor).
 */
export const HUMAN_TELEMETRY_SCHEMA_VERSION = 1

export type HumanTelemetryPayload = {
  schemaVersion: number
  scanId: string
  /** Narrativa temporal humana / suporte; obrigatório quando emitido a partir de `QueuedScan`. */
  sequenceNumber?: number
  event: HumanTelemetryScanEvent
  /** Instante do relógio (preferir hi-res onde existir). */
  at: number
  durationMs?: number
  queueDepth?: number
  reason?: ScanFailureReason
  ctx?: Record<string, string | number | boolean | null>
}

/** Entrada de emissores: `schemaVersion` é opcional e normaliza para `HUMAN_TELEMETRY_SCHEMA_VERSION`. */
export type HumanTelemetryPayloadInput = Omit<HumanTelemetryPayload, 'schemaVersion'> & {
  schemaVersion?: number
}

export function normalizeHumanTelemetryPayload(
  input: HumanTelemetryPayloadInput,
): HumanTelemetryPayload {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? HUMAN_TELEMETRY_SCHEMA_VERSION,
  }
}

export type ScanPipelineConfig = {
  maxQueueDepth: number
  dedupeWindowMs?: number
  /**
   * Comportamento sob overload. PR 2A: apenas `reject_new` obrigatório; outros documentados.
   */
  backpressureStrategy?: BackpressureStrategy
  /**
   * Se false (padrão): em `pause()`, `enqueue` falha com `pipeline_paused`.
   * Se true: enche fila mas o consumer não avança até `resume()`.
   */
  enqueueWhilePaused?: boolean
}

export type ScanPipelineSink = {
  /** Persistência/amostragem (p95/p99) fica fora do motor; implementações: HTTP, fila, observabilidade. */
  emitTelemetry: (payload: HumanTelemetryPayloadInput) => void
}

export type ScanProcessResult =
  | { ok: true }
  | { ok: false; reason: ScanFailureReason; message?: string }

export type ScanProcessContext = {
  /** Snapshot imutável preferido; o handler usa `scan.event`, `scan.sequenceNumber`, etc. */
  scan: Readonly<QueuedScan>
  signal?: AbortSignal
}

/** Adapter de domínio: uma leitura de cada vez (o runner garante serialização). */
export type ScanPipelineHandler = (ctx: ScanProcessContext) => Promise<ScanProcessResult>

export type EnqueueScanResult =
  | { ok: true; scanId: string; sequenceNumber: number; positionInQueue: number }
  | {
      ok: false
      reason:
        | 'queue_full'
        | 'duplicate_suppressed'
        | 'pipeline_paused'
        | 'pipeline_shutdown'
        | 'invalid_code'
      message?: string
    }

/** Vista observável para UI, DevTools e overlay de degradação. */
export type ScanPipelineSnapshot = Readonly<{
  queueDepth: number
  isProcessing: boolean
  isPaused: boolean
  currentScan: Readonly<QueuedScan> | null
}>

export type ScanPipelineListener = (snapshot: ScanPipelineSnapshot) => void

const DEFAULT_MAX_QUEUE = 50

export function defaultScanPipelineConfig(
  partial?: Partial<ScanPipelineConfig>,
): ScanPipelineConfig {
  return {
    maxQueueDepth: partial?.maxQueueDepth ?? DEFAULT_MAX_QUEUE,
    dedupeWindowMs: partial?.dedupeWindowMs ?? 0,
    backpressureStrategy: partial?.backpressureStrategy ?? 'reject_new',
    enqueueWhilePaused: partial?.enqueueWhilePaused ?? false,
  }
}

function createScanId(now: number): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return `scan-${now}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Constrói um evento de ingresso (ainde sem `sequenceNumber`; atribuído ao enfileirar).
 */
export function createScanEvent(codigo: string, meta?: ScanEventMeta, now = Date.now()): ScanEvent {
  const trimmed = codigo.trim()
  return {
    id: createScanId(now),
    codigo: trimmed,
    receivedAt: now,
    meta,
  }
}

export function createNoopScanPipelineSink(): ScanPipelineSink {
  return {
    emitTelemetry: () => {},
  }
}

/**
 * Runtime observável (scheduler + fila). Implementação: PR 2A.
 *
 * `subscribe`: fonte única para métricas em tempo real sem callbacks espalhados.
 * `flush`: semântica em `ScanPipelineFlushOptions`; nunca assumir “só drain” sem ler o contrato.
 */
export interface ScanPipelineController {
  readonly config: ScanPipelineConfig

  enqueue(codigo: string, meta?: ScanEventMeta): EnqueueScanResult

  pause(): void
  resume(): void

  /**
   * Encerra o runner; opções de descarte em `flush` antes ou durante shutdown conforme PR 2A.
   */
  shutdown(): void
  flush(options?: ScanPipelineFlushOptions): void

  isProcessing(): boolean
  getQueueDepth(): number
  getCurrentScan(): Readonly<QueuedScan> | null

  /** Snapshot síncrono para quem não quer subscription. */
  getSnapshot(): ScanPipelineSnapshot

  /** Retorna função `unsubscribe`. */
  subscribe(listener: ScanPipelineListener): () => void
}
