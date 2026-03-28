import { test, expect } from '@playwright/test'

const LOGIN_PATH = '/login'
const hasTestUser =
  Boolean(process.env.PLAYWRIGHT_TEST_EMAIL) && Boolean(process.env.PLAYWRIGHT_TEST_PASSWORD)

test.describe('Painel do gerente', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasTestUser) {
      testInfo.skip(true, 'Defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD')
      return
    }
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
    await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
  })

  test('painel inicial /gerente carrega', async ({ page }) => {
    await page.goto('/gerente')
    await expect(page).toHaveURL(/\/gerente\/?$/)
    await expect(page.locator('main h1').first()).toBeVisible()
  })

  test('página de estoque carrega', async ({ page }) => {
    await page.goto('/gerente/estoque')
    await expect(page.getByRole('heading', { name: 'Estoque' })).toBeVisible()
  })

  test('página de produtos carrega', async ({ page }) => {
    await page.goto('/gerente/produtos')
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('toggle de idioma exibe mandarim no painel', async ({ page }) => {
    await page.goto('/gerente/produtos')
    const zhBtn = page.getByRole('button', { name: '普通话' })
    await expect(zhBtn).toBeVisible()
    await zhBtn.click()
    await expect(page.getByText('经理面板')).toBeVisible({ timeout: 10_000 })
  })
})
