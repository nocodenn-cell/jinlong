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
