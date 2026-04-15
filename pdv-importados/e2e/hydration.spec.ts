import { test, expect } from '@playwright/test'
import { collectHydrationViolationsDuring } from './helpers/hydration'
import {
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'

/** Navegação alinhada ao `next dev`: evita esperar `load` indefinidamente. */
const GOTO = { waitUntil: 'domcontentloaded' as const }

/**
 * Falha se o console do Chromium reportar erro/aviso típico de hidratação (SSR ≠ cliente).
 * Rode com servidor limpo (Playwright inicia `next dev` na porta E2E) e, de preferência, sem extensões.
 */

test.describe('Hidratação — rotas públicas', () => {
  test('/login sem violações', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await page.goto('/login', GOTO)
    })
    expect.soft(violations, violations.join('\n')).toEqual([])
  })

  test('raiz / redireciona para login sem violações', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await page.goto('/', GOTO)
    })
    await expect(page).toHaveURL(/\/login/)
    expect.soft(violations, violations.join('\n')).toEqual([])
  })

  test('/gerente sem sessão redireciona e hidrata login', async ({ page }) => {
    const violations = await collectHydrationViolationsDuring(page, async () => {
      await page.goto('/gerente/produtos', GOTO)
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

    const email = process.env.PLAYWRIGHT_TEST_EMAIL!
    const password = process.env.PLAYWRIGHT_TEST_PASSWORD!

    const violations = await collectHydrationViolationsDuring(
      page,
      async () => {
        await page.goto('/login', GOTO)
        await page.getByPlaceholder('Email').fill(email)
        await page.getByPlaceholder('Senha').fill(password)
        await page.getByRole('button', { name: /^Entrar$/ }).click()
        await page.waitForURL(/\/(caixa|gerente)/, { timeout: 25_000 })

        const path = new URL(page.url()).pathname
        if (path.startsWith('/gerente')) {
          await page.goto('/gerente/estoque', GOTO)
          await page.goto('/admin/dashboard', GOTO)
          await expect(page).toHaveURL(/\/admin\/dashboard/)
          return
        }

        if (path.startsWith('/caixa')) {
          await page.goto('/caixa', GOTO)
          await expect(page).toHaveURL(/\/caixa\/?$/)
        }
      },
      { settleMs: 800 },
    )

    expect(violations, violations.join('\n')).toEqual([])
  })
})
