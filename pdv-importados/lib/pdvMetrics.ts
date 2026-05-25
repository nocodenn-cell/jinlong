"use client"

/**
 * Métricas operacionais locais do PDV.
 *
 * Coleta tempos reais das operações críticas durante uso normal.
 * Armazena no sessionStorage (limpo ao fechar o browser).
 * Não envia dados para nenhum servidor — apenas diagnóstico local.
 *
 * Acessar em dev: window.__pdvMetrics
 * Limpar: window.__pdvMetrics?.clear()
 */

export type MetricaOp =
  | 'busca_produto'
  | 'adicionar_item'
  | 'finalizar_venda'
  | 'abrir_caixa'
  | 'fechar_caixa'
  | 'validar_gerente'
  | 'registrar_movimentacao'
  | 'novo_cupom'
  | 'carregar_pdv'

export type MetricaResultado = 'ok' | 'erro' | 'timeout'

export type MetricaEntry = {
  op: MetricaOp
  ms: number
  resultado: MetricaResultado
  ts: number // timestamp de início (epoch ms)
}

const STORAGE_KEY = 'pdv:metrics'
const MAX_ENTRIES = 200

// ── leitura / escrita ────────────────────────────────────────────────────────

function readEntries(): MetricaEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as MetricaEntry[]
  } catch {
    return []
  }
}

function writeEntries(entries: MetricaEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // sessionStorage cheio ou indisponível — silencioso
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Registra uma métrica manualmente.
 */
export function recordMetric(op: MetricaOp, ms: number, resultado: MetricaResultado): void {
  const entries = readEntries()
  entries.push({ op, ms, resultado, ts: Date.now() - ms })
  writeEntries(entries)
}

/**
 * Wrapper que mede o tempo de uma operação assíncrona e registra automaticamente.
 *
 * @example
 * const result = await measureOp('finalizar_venda', () => finalizarVendaCaixa(payload))
 */
export async function measureOp<T>(
  op: MetricaOp,
  fn: () => Promise<T>,
  isOk?: (result: T) => boolean,
): Promise<T> {
  const start = performance.now()
  let resultado: MetricaResultado = 'ok'
  try {
    const result = await fn()
    if (isOk && !isOk(result)) resultado = 'erro'
    return result
  } catch (err) {
    resultado =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.message.toLowerCase().includes('timeout'))
        ? 'timeout'
        : 'erro'
    throw err
  } finally {
    const ms = Math.round(performance.now() - start)
    recordMetric(op, ms, resultado)
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[pdvMetrics] ${op}: ${ms}ms (${resultado})`)
    }
  }
}

// ── resumo ───────────────────────────────────────────────────────────────────

export type MetricaSummary = {
  op: MetricaOp
  count: number
  mediana: number
  p95: number
  erros: number
  timeouts: number
}

export function getSummary(): MetricaSummary[] {
  const entries = readEntries()
  const byOp = new Map<MetricaOp, MetricaEntry[]>()

  for (const e of entries) {
    if (!byOp.has(e.op)) byOp.set(e.op, [])
    byOp.get(e.op)!.push(e)
  }

  const result: MetricaSummary[] = []
  for (const [op, ops] of byOp) {
    const ms = ops.map((e) => e.ms).sort((a, b) => a - b)
    const mid = Math.floor(ms.length / 2)
    result.push({
      op,
      count: ops.length,
      mediana: ms[mid] ?? 0,
      p95: ms[Math.floor(ms.length * 0.95)] ?? ms[ms.length - 1] ?? 0,
      erros: ops.filter((e) => e.resultado === 'erro').length,
      timeouts: ops.filter((e) => e.resultado === 'timeout').length,
    })
  }

  return result.sort((a, b) => b.count - a.count)
}

export function clearMetrics(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY)
  }
}

export function getAllEntries(): MetricaEntry[] {
  return readEntries()
}

// ── expõe no window para debug em dev ───────────────────────────────────────

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as typeof window & { __pdvMetrics?: unknown }).__pdvMetrics = {
    summary: getSummary,
    all: getAllEntries,
    clear: clearMetrics,
    record: recordMetric,
  }
}
