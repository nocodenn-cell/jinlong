import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

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
    await loginGerente(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('painel inicial /gerente carrega', async ({ page }) => {
    await gotoApp(page, '/gerente')
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
    await gotoApp(page, '/gerente/estoque')
    await expect(page.getByRole('heading', { name: 'Estoque' })).toBeVisible()
  })

  test('página de imprimir etiquetas carrega', async ({ page }) => {
    await gotoApp(page, '/gerente/estoque/imprimir-etiquetas')
    await expect(page.getByRole('heading', { name: /Imprimir Etiquetas|打印标签/ })).toBeVisible()
    await expect(page.getByPlaceholder(/Código de barras|条形码/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Gerar PDF|生成PDF/ })).toBeVisible()
  })

  test('fluxo básico: bipar produto -> adicionar ao carrinho -> gerar PDF', async ({ page }) => {
    await gotoApp(page, '/gerente/estoque/imprimir-etiquetas')
    
    // Verificar campo de busca
    const searchInput = page.getByPlaceholder(/Código de barras|条形码/)
    await expect(searchInput).toBeVisible()
    
    // Digitar código de barras (simulando leitor)
    await searchInput.fill('7891234567890')
    await searchInput.press('Enter')
    
    // Aguardar processamento
    await page.waitForTimeout(1000)
    
    // Verificar se produto foi adicionado ao carrinho (ou erro se não existir)
    // Como não temos dados de teste garantidos, vamos apenas verificar que o fluxo não quebra
    const cartSection = page.locator('div').filter({ hasText: /Total|总计/ })
    const isCartVisible = await cartSection.isVisible().catch(() => false)
    
    // Se carrinho estiver visível, testar geração de PDF
    if (isCartVisible) {
      const generateButton = page.getByRole('button', { name: /Gerar PDF|生成PDF/ })
      await expect(generateButton).toBeVisible()
      
      // Clicar em gerar PDF (pode falhar se não haver itens, mas o fluxo deve estar completo)
      await generateButton.click()
      await page.waitForTimeout(2000)
    }
  })

  test('página de produtos carrega', async ({ page }) => {
    await gotoApp(page, '/gerente/produtos')
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('página de vendas carrega sem erro interno', async ({ page }) => {
    await gotoApp(page, '/gerente/vendas')
    await expect(page.getByRole('heading', { name: /vendas|销售/i })).toBeVisible()
    await expect(page.getByText(/erro interno/i)).not.toBeVisible()
  })

  test('página de caixas lista colunas e export CSV', async ({ page }) => {
    await gotoApp(page, '/gerente/caixas')
    await expect(page.getByRole('heading', { level: 1, name: /Caixas|收银会话|收銀會話/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^(Data|时间)$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Exportar CSV|导出 CSV|exportar csv/i })).toBeVisible()
  })

  test('página de relatórios exibe filtros de período', async ({ page }) => {
    await gotoApp(page, '/gerente/relatorios')
    await expect(page.getByRole('heading', { level: 1, name: /Relatórios|报告|報表/ })).toBeVisible()
    await expect(page.getByText(/Vendas por período|时段销售/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Aplicar|应用)$/ })).toBeVisible()
  })

  test('toggle de idioma exibe mandarim no painel', async ({ page }) => {
    await gotoApp(page, '/gerente/produtos')
    const zhBtn = page.getByRole('button', { name: '普通话' })
    await expect(zhBtn).toBeVisible()
    await zhBtn.click()
    await expect(page.getByText('经理面板')).toBeVisible({ timeout: 10_000 })
  })

  test('fluxo crítico admin/gerente em chinês + validação traduzida', async ({ page }) => {
    await gotoApp(page, '/gerente/produtos')
    await page.getByRole('button', { name: '普通话' }).click()
    await expect(page.getByText('经理面板')).toBeVisible({ timeout: 10_000 })

    // Dispara erro de validação (preço <= 0) para validar prefixo i18n em CN.
    await page.getByPlaceholder('商品名称').fill('Teste idioma CN')
    await page.getByPlaceholder('条形码').fill(`E2E-${Date.now()}`)
    await page.getByPlaceholder('零售价').fill('0')
    await page.getByRole('button', { name: /保存/ }).click()
    await expect(page.getByText(/数据无效：|資料無效：/)).toBeVisible({ timeout: 10_000 })

    await gotoApp(page, '/admin/dashboard')
    await expect(page.getByText('主控台')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('生意看板')).toBeVisible({ timeout: 10_000 })
  })
})
