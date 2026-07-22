import { getCaixaSalesRuntimeConfig } from '@/lib/config/caixaSalesRuntimeConfig'
import type { DiagnosticoCheck } from '@/lib/caixa/diagnosticoPreProducaoTypes'

const BOOL_TRUE = new Set(['true', '1', 'yes', 'on'])
const BOOL_FALSE = new Set(['false', '0', 'no', 'off'])

function parseBoolFlag(raw: string | undefined): boolean | null {
  const n = (raw ?? '').trim().toLowerCase()
  if (!n) return null
  if (BOOL_TRUE.has(n)) return true
  if (BOOL_FALSE.has(n)) return false
  return null
}

function pushCheck(
  checks: DiagnosticoCheck[],
  check: DiagnosticoCheck,
): void {
  checks.push(check)
}

export function avaliarFlagsAmbienteCaixa(): DiagnosticoCheck[] {
  const checks: DiagnosticoCheck[] = []
  const runtime = getCaixaSalesRuntimeConfig()

  pushCheck(checks, {
    id: 'flag_supabase_url',
    categoria: 'flags',
    titulo: 'NEXT_PUBLIC_SUPABASE_URL',
    status: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ? 'ok' : 'falha',
    detalhe: 'URL do projeto Supabase (app não conecta sem ela).',
  })

  pushCheck(checks, {
    id: 'flag_supabase_anon',
    categoria: 'flags',
    titulo: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    status: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ? 'ok' : 'falha',
    detalhe: 'Chave anon/public do Supabase.',
  })

  pushCheck(checks, {
    id: 'flag_strict_manager',
    categoria: 'flags',
    titulo: 'STRICT_MANAGER_DISCOUNT_AUTH',
    status: runtime.hasInvalidFlags ? 'falha' : 'ok',
    detalhe: runtime.hasInvalidFlags
      ? `Valor inválido (${runtime.invalidFlags.join(', ')}). Bloqueia finalização.`
      : `Ativo=${runtime.strictManagerDiscountAuth} (fonte: ${runtime.source.STRICT_MANAGER_DISCOUNT_AUTH}).`,
  })

  const unified = parseBoolFlag(process.env.USE_UNIFIED_SALES_FLOW)
  pushCheck(checks, {
    id: 'flag_unified_sales',
    categoria: 'flags',
    titulo: 'USE_UNIFIED_SALES_FLOW',
    status: unified === null && process.env.USE_UNIFIED_SALES_FLOW?.trim()
      ? 'falha'
      : unified === false
        ? 'aviso'
        : 'ok',
    detalhe:
      unified === false
        ? 'false desativa proteção idempotente documentada — use true em produção.'
        : 'Fluxo unificado de vendas (recomendado true).',
  })

  const fiscalRaw = process.env.AUTO_ENQUEUE_FISCAL_ON_SALE?.trim()
  const fiscalParsed = parseBoolFlag(fiscalRaw)
  const fiscalOn = fiscalParsed === true
  const fiscalWorkerOk =
    Boolean(process.env.FISCAL_WORKER_ENDPOINT?.trim()) &&
    Boolean(process.env.FISCAL_WORKER_KEY?.trim())

  pushCheck(checks, {
    id: 'flag_fiscal_enqueue',
    categoria: 'flags',
    titulo: 'AUTO_ENQUEUE_FISCAL_ON_SALE',
    status:
      fiscalParsed === null && fiscalRaw
        ? 'falha'
        : fiscalOn && !fiscalWorkerOk
          ? 'aviso'
          : 'ok',
    detalhe: fiscalOn
      ? fiscalWorkerOk
        ? 'Fiscal auto-enfileirado com worker configurado.'
        : 'true sem FISCAL_WORKER_* — fiscal pode falhar silenciosamente (não bloqueia venda).'
      : 'Desligado — adequado para piloto sem NF-e.',
  })

  return checks
}
