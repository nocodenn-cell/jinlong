import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(REPO_ROOT, 'pdv-importados', '.env.local')

export function loadPdvEnv(): void {
  if (!fs.existsSync(ENV_PATH)) return
  const text = fs.readFileSync(ENV_PATH, 'utf8')
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

export type SupabaseEnv = {
  url: string
  serviceKey: string
  anonKey: string
  operadorEmail: string
  operadorPassword: string
}

export function requireSupabaseEnv(): SupabaseEnv {
  loadPdvEnv()
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''
  const operadorEmail =
    process.env.SEED_OPERADOR_EMAIL?.trim() || 'e2e-operador@localhost.test'
  const operadorPassword =
    process.env.SEED_DEV_PASSWORD?.trim() ||
    process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
    ''

  if (!url || !serviceKey) {
    throw new Error(
      'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em pdv-importados/.env.local',
    )
  }
  if (!operadorPassword) {
    throw new Error(
      'Defina SEED_DEV_PASSWORD ou PLAYWRIGHT_TEST_PASSWORD para autenticar o operador.',
    )
  }
  return { url, serviceKey, anonKey, operadorEmail, operadorPassword }
}

export const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'
export const DEMO_PRODUTO_CODIGO = '7898512340015'
