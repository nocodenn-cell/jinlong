const DEFAULT_META_DIA = 2000
const META_CONFIG_ENV = 'GERENTE_DASHBOARD_META_DIA_JSON'

type MetaConfig = {
  default?: number
  lojas?: Record<string, number>
  gerentes?: Record<string, number>
}

function normalizeMeta(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function parseMetaConfig(raw: string | undefined): MetaConfig {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as MetaConfig
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch (e) {
    console.warn('[dashboardMetaConfig] failed to parse META_DIA_JSON:', e instanceof Error ? e.message : e)
    return {}
  }
}

export function resolveGerenteDashboardMetaDia(params: {
  lojaId?: string | null
  gerenteId?: string | null
  fallback?: number
}): number {
  const fallback = normalizeMeta(params.fallback) ?? DEFAULT_META_DIA
  const config = parseMetaConfig(process.env[META_CONFIG_ENV])

  const gerenteId = params.gerenteId?.trim()
  if (gerenteId && config.gerentes && gerenteId in config.gerentes) {
    const metaGerente = normalizeMeta(config.gerentes[gerenteId])
    if (metaGerente) return metaGerente
  }

  const lojaId = params.lojaId?.trim()
  if (lojaId && config.lojas && lojaId in config.lojas) {
    const metaLoja = normalizeMeta(config.lojas[lojaId])
    if (metaLoja) return metaLoja
  }

  return normalizeMeta(config.default) ?? fallback
}

export const gerenteDashboardMetaDiaExample = `{
  "default": 2000,
  "lojas": {
    "a0000001-0000-4000-8000-000000000001": 3500
  },
  "gerentes": {
    "00000000-0000-0000-0000-000000000123": 5000
  }
}`
