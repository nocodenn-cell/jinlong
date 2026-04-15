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

  const missingRecommended = recommended.filter((k) => !parsed.get(k))
  if (missingRecommended.length > 0) {
    console.warn('[env-check] Aviso: variáveis recomendadas ausentes:')
    for (const k of missingRecommended) console.warn(` - ${k}`)
  }

  console.log(`[env-check] OK: ${okMessage}`)
}
