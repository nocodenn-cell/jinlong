import { test, expect, type Page } from '@playwright/test'
import { loginGerente } from './helpers/login'
import { hasGerenteTestUser } from './helpers/env'
import { gotoApp } from './helpers/url'

/**
 * QA operacional do fluxo de entrada: NF-e → Compra → Estoque → Financeiro.
 *
 * Somente leitura e navegação — nenhuma etapa confirma entrada, credita estoque
 * ou gera título. As invariantes do backend (conferência obrigatória antes de
 * creditar, idempotência, auditoria) ficam intactas e não são exercitadas aqui.
 */

const SHOTS = 'test-results/qa-entrada'

test.describe('Entrada de mercadoria — fluxo operacional', () => {
  test.skip(!hasGerenteTestUser(), 'Requer PLAYWRIGHT_TEST_EMAIL/PASSWORD')

  test.beforeEach(async ({ page }) => {
    await loginGerente(page)
  })

  async function irParaEntrada(page: Page): Promise<void> {
    await gotoApp(page, '/admin/estoque/entrada')
    await expect(page.getByRole('heading', { name: 'Entrada de mercadoria' })).toBeVisible({
      timeout: 30_000,
    })
  }

  test('A1 · o hub de Estoque abre pela Entrada e expõe Compras', async ({ page }) => {
    await gotoApp(page, '/admin/estoque')
    const hub = page.getByRole('navigation', { name: /estoque/i })
    await expect(hub).toBeVisible({ timeout: 30_000 })

    for (const aba of ['Entrada', 'Saldos', 'Compras', 'Recebimento', 'Importar NF-e']) {
      await expect(hub.getByRole('link', { name: aba, exact: true })).toBeVisible()
    }

    await page.screenshot({ path: `${SHOTS}/01-estoque-saldos.png`, fullPage: true })
  })

  test('A2 · a Entrada oferece os três caminhos, cada um com o efeito declarado', async ({
    page,
  }) => {
    await irParaEntrada(page)

    await expect(page.getByRole('heading', { name: 'Chegou com NF-e' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chegou de uma ordem de compra' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chegou sem nota' })).toBeVisible()

    // O caminho com NF-e é o único que declara efeito financeiro.
    await expect(page.getByText('Contas a pagar', { exact: true }).first()).toBeVisible()

    await page.screenshot({ path: `${SHOTS}/02-entrada-hub.png`, fullPage: true })
  })

  test('A3 · cada caminho leva à tela certa e volta ao hub pela aba', async ({ page }) => {
    await irParaEntrada(page)
    await page.getByRole('link', { name: 'Importar XML' }).click()
    await expect(page).toHaveURL(/\/admin\/estoque\/importar-nfe/)
    await page.screenshot({ path: `${SHOTS}/03-importar-nfe.png`, fullPage: true })

    await irParaEntrada(page)
    await page.getByRole('link', { name: 'Ver ordens em trânsito' }).click()
    // Chega filtrado: uma lista crua faria o operador procurar de novo.
    await expect(page).toHaveURL(/\/admin\/compras\?status=EM_TRANSITO/)
    await expect(page.getByRole('navigation', { name: /estoque/i })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/04-compras.png`, fullPage: true })

    await irParaEntrada(page)
    await page.getByRole('link', { name: 'Registrar remessa' }).click()
    await expect(page).toHaveURL(/\/admin\/estoque\/recebimento/)
    await page.screenshot({ path: `${SHOTS}/05-recebimento.png`, fullPage: true })
  })

  test('C1 · Contas a pagar declara a origem e volta para a NF-e pela rota canônica', async ({
    page,
  }) => {
    await gotoApp(page, '/admin/financeiro/contas-pagar')
    await expect(page.getByRole('heading', { name: /contas a pagar/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await page.screenshot({ path: `${SHOTS}/06-contas-pagar.png`, fullPage: true })

    const linkNfe = page.getByRole('link', { name: /NF-e #/ }).first()
    if (await linkNfe.count()) {
      await expect(linkNfe).toHaveAttribute('href', /\/admin\/estoque\/importar-nfe\?id=/)
    }
  })

  test('C2 · ?id= inválido não quebra a tela de importação', async ({ page }) => {
    await gotoApp(page, '/admin/estoque/importar-nfe?id=nao-e-uuid')
    await expect(page.getByRole('heading', { name: /importar nf-e/i }).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('B1 · o hub de Entrada se mantém legível em viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await irParaEntrada(page)
    await page.screenshot({ path: `${SHOTS}/07-entrada-mobile.png`, fullPage: true })

    const doc = page.locator('body')
    const overflow = await doc.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    )
    expect(overflow, 'body não deve rolar horizontalmente').toBeLessThanOrEqual(1)
  })
})
