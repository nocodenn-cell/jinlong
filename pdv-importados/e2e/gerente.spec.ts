import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'

const LOGIN_PATH = '/login'

test.describe('Painel do gerente', () => {
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
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
    await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
  })

  test('painel inicial /gerente carrega', async ({ page }) => {
    await page.goto('/gerente')
    await expect(page).toHaveURL(/\/gerente\/?$/)
    await expect(page.getByText(/Painel do Gerente|经理面板|經理面板/)).toBeVisible()
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: /^(Produtos|商品管理)$/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^(Estoque|库存|庫存)$/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^(Vendas|销售|銷售紀錄)$/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^(Caixas|收银会话|收銀會話)$/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^(Relatórios|报告|報表)$/ })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: /^(Início|首页|首頁)$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^(Data|时间|時間)$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^(Total|金额|金額)$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^(Pagamento|支付方式)$/ })).toBeVisible()
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

  test('página de vendas carrega sem erro interno', async ({ page }) => {
    await page.goto('/gerente/vendas')
    await expect(page.getByRole('heading', { name: /vendas|销售/i })).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('página de caixas lista colunas e export CSV', async ({ page }) => {
    await page.goto('/gerente/caixas')
    await expect(page.getByRole('heading', { level: 1, name: /Caixas|收银会话|收銀會話/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^(Data|时间)$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Exportar CSV|导出 CSV|exportar csv/i })).toBeVisible()
  })

  test('página de relatórios exibe filtros de período', async ({ page }) => {
    await page.goto('/gerente/relatorios')
    await expect(page.getByRole('heading', { level: 1, name: /Relatórios|报告|報表/ })).toBeVisible()
    await expect(page.getByText(/Vendas por período|时段销售/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Aplicar|应用)$/ })).toBeVisible()
  })

  test('toggle de idioma exibe mandarim no painel', async ({ page }) => {
    await page.goto('/gerente/produtos')
    const zhBtn = page.getByRole('button', { name: '普通话' })
    await expect(zhBtn).toBeVisible()
    await zhBtn.click()
    await expect(page.getByText('经理面板')).toBeVisible({ timeout: 10_000 })
  })
})
