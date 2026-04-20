import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword } from './helpers/env'

const LOGIN_PATH = '/login'

test.describe('PDV Caixa', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
  })

  test('página /caixa carrega com cabeçalho do PDV', async ({ page }) => {
    await page.goto('/caixa')
    await expect(page).toHaveURL(/\/caixa\/?$/)
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })
  })

  test('busca de produto e ação de sair estão acessíveis', async ({ page }) => {
    await page.goto('/caixa')
    await expect(
      page.getByRole('textbox', {
        name: /código de barras|nome do produto|条码|商品名称/i,
      }),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /^Sair$|^退出登录$|^登出$/ })).toBeVisible()
  })
})
