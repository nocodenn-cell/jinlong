/**
 * Evita “falso verde” no CI: jobs E2E não podem passar só com testes skipped por env ausente.
 */
export function isCi(): boolean {
  return process.env.CI === 'true'
}

/** URL + anon obrigatórios para fluxos que chamam Supabase Auth no browser. */
export function assertSupabasePublicEnvInCi(): void {
  if (!isCi()) return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error(
      'E2E no CI exige NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        '(p.ex. secrets PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL / PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_ANON_KEY). ' +
        'Não é permitido ignorar estes testes silenciosamente quando CI=true.',
    )
  }
}

export function assertGerenteCredentialsInCi(): void {
  if (!isCi()) return
  const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim()
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD?.trim()
  if (!email || !password) {
    throw new Error(
      'E2E no CI exige PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD para o painel do gerente.',
    )
  }
}

export function hasGerenteTestUser(): boolean {
  return (
    Boolean(process.env.PLAYWRIGHT_TEST_EMAIL?.trim()) &&
    Boolean(process.env.PLAYWRIGHT_TEST_PASSWORD?.trim())
  )
}

/**
 * Fluxo E2E completo desktop->sync->gerente exige:
 * - service role para seed controlado
 * - endpoint/key da Edge sync-outbox para injetar evento
 */
export function assertSyncFlowEnvInCi(): void {
  if (!isCi()) return
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const endpoint = process.env.SYNC_ENDPOINT?.trim()
  const key = process.env.SYNC_KEY?.trim()
  if (!serviceRole || !endpoint || !key) {
    throw new Error(
      'E2E do fluxo sync exige SUPABASE_SERVICE_ROLE_KEY, SYNC_ENDPOINT e SYNC_KEY no CI.',
    )
  }
}

export function hasSyncFlowEnv(): boolean {
  return (
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
    Boolean(process.env.SYNC_ENDPOINT?.trim()) &&
    Boolean(process.env.SYNC_KEY?.trim()) &&
    hasGerenteTestUser() &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
  )
}

/**
 * Fluxos em `/caixa` exigem usuário **OPERADOR** (middleware redireciona GERENTE/DONO para `/gerente`).
 * Use credenciais dedicadas; não reutilize só `PLAYWRIGHT_TEST_*` do painel gerente.
 */
export function hasCaixaOperadorUser(): boolean {
  return (
    Boolean(process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL?.trim()) &&
    Boolean(process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD?.trim())
  )
}

export function caixaOperadorEmail(): string {
  return process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL!.trim()
}

export function caixaOperadorPassword(): string {
  return process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD!.trim()
}

/** Código de barras do catálogo demo (migration `027_seed_produtos_demo_importados_zh.sql`). */
export function e2eProdutoCodigoBarras(): string {
  const raw = process.env.PLAYWRIGHT_E2E_PRODUTO_CODIGO?.trim()
  return raw || '7898512340003'
}
