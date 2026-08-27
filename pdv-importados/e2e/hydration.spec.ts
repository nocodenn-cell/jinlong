import { test, expect } from '@playwright/test'
import { collectHydrationViolationsDuring } from './helpers/hydration'
import {
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { E2E_GOTO_DOMCONTENTLOADED, gotoApp } from './helpers/url'

/**
 * Falha se o console do Chromium reportar erro/aviso típico de hidratação (SSR ≠ cliente).
 * Rode com servidor limpo (Playwright inicia `next dev` na porta E2E) e, de preferência, sem extensões.
 */

test.describe('Hidratação — rotas públicas', () => {
  test('/login sem violações', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await gotoApp(page, '/login', E2E_GOTO_DOMCONTENTLOADED)
    })
    expect.soft(violations, violations.join('\n')).toEqual([])
  })

  test('raiz / redireciona para login sem violações', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await gotoApp(page, '/', E2E_GOTO_DOMCONTENTLOADED)
    })
    await expect(page).toHaveURL(/\/login/)
    expect.soft(violations, violations.join('\n')).toEqual([])
  })

  test('/gerente sem sessão redireciona e hidrata login', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await gotoApp(page, '/gerente/produtos', E2E_GOTO_DOMCONTENTLOADED)
    })
    await expect(page).toHaveURL(/\/login/)
    expect.soft(violations, violations.join('\n')).toEqual([])
  })
})

test.describe('Hidratação — após login (gerente)', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
  })

  test('rotas do perfil após login sem violações', async ({ page }, testInfo) => {
    if (!hasGerenteTestUser()) {
      testInfo.skip(
        true,
        'Defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD (e Supabase público) para este fluxo.',
      )
      return
    }

    const violations = await collectHydrationViolationsDuring(
      page,
      async () => {
        // `loginGerente` já espera `/admin/dashboard` (contrato do perfil).
        // CI #1228: login ad-hoc + desvio extra a `/admin/estoque` estourou
        // 150s em compile fria do `next dev` — não é violação de hidratação.
        await loginGerente(page)
        await gotoApp(page, '/admin/dashboard', E2E_GOTO_DOMCONTENTLOADED)
        await expect(page).toHaveURL(/\/admin\/dashboard/)
      },
      { settleMs: 800 },
    )

    expect(violations, violations.join('\n')).toEqual([])
  })
})
