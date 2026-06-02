import { test, expect, type Page } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'

const LOGIN_PATH = '/login'

async function loginGerente(page: Page) {
  await page.goto(LOGIN_PATH)
  await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
  await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForURL(/\/(caixa|gerente|admin)/, { timeout: 20_000 })
}

async function switchToPtIfNeeded(page: Page) {
  const ptBtn = page.getByRole('button', { name: /^PT$/ })
  await expect(ptBtn).toBeVisible()
  if (!(await ptBtn.isDisabled())) {
    await ptBtn.click()
  }
}

test.describe('Admin - i18n idioma', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasGerenteTestUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD (e Supabase público) para estes fluxos.',
      )
      return
    }
    await loginGerente(page)
    await page.goto('/admin/dashboard')
    await switchToPtIfNeeded(page)
  })

  test('alterna para zh e persiste após refresh', async ({ page }) => {
    await expect(page.getByText('Dashboard comercial')).toBeVisible()
    await page.getByRole('button', { name: '普通话' }).click()
    await expect(page.getByText('主控台')).toBeVisible({ timeout: 10_000 })
    await page.reload()
    await expect(page.getByText('主控台')).toBeVisible({ timeout: 10_000 })
  })

  })
