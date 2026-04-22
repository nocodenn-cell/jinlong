/**
 * Parser e runner compartilhados para scripts `check-env.mjs` dos pacotes.
 */
import fs from 'node:fs'
import path from 'node:path'

export function parseEnv(content) {
  const out = new Map()
  for (const lineRaw of content.split(/\r?\n/)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    out.set(key, val)
  }
  return out
}

/**
 * @param {{
 *   cwd?: string
 *   envFileName: string
 *   required: string[]
 *   recommended?: string[]
 *   conditionalRequired?: Array<{
 *     description: string
 *     whenKey: string
 *     whenValueEquals?: string
 *     keys: string[]
 *   }>
 *   validators?: Array<(parsed: Map<string, string>) => string | null>
 *   missingFileHint: string
 *   okMessage: string
 * }} opts
 */
export function runEnvCheck(opts) {
  const {
    cwd = process.cwd(),
    envFileName,
    required,
    recommended = [],
    conditionalRequired = [],
    validators = [],
    missingFileHint,
    okMessage,
  } = opts

  const envPath = path.join(cwd, envFileName)
  if (!fs.existsSync(envPath)) {
    console.error(`[env-check] Arquivo não encontrado: ${envPath}`)
    console.error(`[env-check] ${missingFileHint}`)
    process.exit(1)
  }

  const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'))
  const missing = required.filter((k) => !parsed.get(k))
  if (missing.length > 0) {
    console.error('[env-check] Variáveis obrigatórias ausentes:')
    for (const k of missing) console.error(` - ${k}`)
    process.exit(1)
  }

  for (const block of conditionalRequired) {
    const raw = parsed.get(block.whenKey)
    const want = (block.whenValueEquals ?? 'true').trim().toLowerCase()
    const isOn = (raw ?? '').trim().toLowerCase() === want
    if (!isOn) continue
    const miss = block.keys.filter((k) => !(parsed.get(k) ?? '').trim())
    if (miss.length > 0) {
      console.error(
        `[env-check] Com ${block.whenKey} ativo, faltam variáveis (${block.description}):`,
      )
      for (const k of miss) console.error(` - ${k}`)
      process.exit(1)
    }
  }

  for (const fn of validators) {
    const msg = fn(parsed)
    if (msg) {
      console.error(`[env-check] ${msg}`)
      process.exit(1)
    }
  }

  const missingRecommended = recommended.filter((k) => !parsed.get(k))
  if (missingRecommended.length > 0) {
    console.warn('[env-check] Aviso: variáveis recomendadas ausentes:')
    for (const k of missingRecommended) console.warn(` - ${k}`)
  }

  console.log(`[env-check] OK: ${okMessage}`)
}
