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

function keysMissing(parsed, keys) {
  return keys.filter((k) => !parsed.get(k))
}

function keysEmpty(parsed, keys) {
  return keys.filter((k) => !(parsed.get(k) ?? '').trim())
}

function printKeysAndExit(level, title, keys) {
  const log = level === 'error' ? console.error : console.warn
  log(`[env-check] ${title}`)
  for (const k of keys) log(` - ${k}`)
  if (level === 'error') process.exit(1)
}

function isConditionalBlockActive(parsed, block) {
  const raw = parsed.get(block.whenKey)
  const want = (block.whenValueEquals ?? 'true').trim().toLowerCase()
  return (raw ?? '').trim().toLowerCase() === want
}

function assertEnvFileExists(envPath, missingFileHint) {
  if (fs.existsSync(envPath)) return
  console.error(`[env-check] Arquivo não encontrado: ${envPath}`)
  console.error(`[env-check] ${missingFileHint}`)
  process.exit(1)
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
  assertEnvFileExists(envPath, missingFileHint)

  const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'))

  const missingRequired = keysMissing(parsed, required)
  if (missingRequired.length > 0) {
    printKeysAndExit('error', 'Variáveis obrigatórias ausentes:', missingRequired)
  }

  for (const block of conditionalRequired) {
    if (!isConditionalBlockActive(parsed, block)) continue
    const miss = keysEmpty(parsed, block.keys)
    if (miss.length > 0) {
      printKeysAndExit(
        'error',
        `Com ${block.whenKey} ativo, faltam variáveis (${block.description}):`,
        miss,
      )
    }
  }

  for (const fn of validators) {
    const msg = fn(parsed)
    if (msg) {
      console.error(`[env-check] ${msg}`)
      process.exit(1)
    }
  }

  const missingRecommended = keysMissing(parsed, recommended)
  if (missingRecommended.length > 0) {
    printKeysAndExit('warn', 'Aviso: variáveis recomendadas ausentes:', missingRecommended)
  }

  console.log(`[env-check] OK: ${okMessage}`)
}
