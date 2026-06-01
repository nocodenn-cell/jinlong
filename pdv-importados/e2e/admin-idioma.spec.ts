import { test, expect, type Page } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

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
    await gotoApp(page, '/admin/dashboard')
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
