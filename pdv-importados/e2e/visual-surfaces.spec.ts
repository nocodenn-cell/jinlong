/**
 * Visual surface snapshots — critical UI states.
 *
 * Captura screenshots dos estados críticos do PDV para detectar regressão visual.
 * Não requer transações reais — captura o estado estático de cada surface.
 *
 * Para atualizar snapshots: npx playwright test visual-surfaces.spec.ts --update-snapshots
 * Para rodar: npm run test:e2e -- visual-surfaces.spec.ts
 *
 * Requer: PLAYWRIGHT_CAIXA_TEST_EMAIL / PLAYWRIGHT_CAIXA_TEST_PASSWORD
 */
import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword } from './helpers/env'

const LOGIN_PATH = '/login'

// Aguarda o PDV carregar completamente (sem skeleton visível)
async function aguardarPDVPronto(page: Parameters<typeof test>[1] extends never ? never : Parameters<Parameters<typeof test.beforeEach>[0]>[0]) {
  await page.waitForLoadState('networkidle')
  // Aguarda spinner de loading sumir
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
    { timeout: 20_000 },
  )
}

test.describe('Visual surfaces — PDV crítico', () => {
  test.skip(!hasCaixaOperadorUser(), 'Requer PLAYWRIGHT_CAIXA_TEST_EMAIL + PLAYWRIGHT_CAIXA_TEST_PASSWORD')

  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
    await page.goto('/caixa')
  })

  test('surface: PDV com caixa aberto + carrinho vazio', async ({ page }) => {
    await aguardarPDVPronto(page)
    // Garante que não há itens no carrinho
    const novoBtn = page.getByRole('button', { name: /Novo cupom/ })
    if (await novoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await novoBtn.click()
      await page.waitForTimeout(400)
    }
    await expect(page).toHaveScreenshot('pdv-caixa-aberto-vazio.png', {
      fullPage: false,
      animations: 'disabled',
    })
  })

  test('surface: PDV com caixa fechado', async ({ page }) => {
    await aguardarPDVPronto(page)
    // Só captura se caixa estiver fechado — não força fechamento
    const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (!await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Caixa está aberto — pular snapshot de caixa fechado')
    }
    await expect(page).toHaveScreenshot('pdv-caixa-fechado.png', {
      fullPage: false,
      animations: 'disabled',
    })
  })

  test('surface: modal abrir caixa', async ({ page }) => {
    await aguardarPDVPronto(page)
    const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (!await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Caixa já aberto — pular snapshot do modal de abertura')
    }
    await abrirBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    await expect(page).toHaveScreenshot('pdv-modal-abrir-caixa.png', {
      fullPage: false,
      animations: 'disabled',
    })
  })

  test('surface: footer PDV com desconto aplicado', async ({ page }) => {
    await aguardarPDVPronto(page)
    // Este snapshot é informativo — só roda se caixa aberto e produto adicionável
    const searchInput = page.getByPlaceholder(/Buscar produto|Product|产品/)
    if (!await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Sem campo de busca visível — caixa provavelmente fechado')
    }
    // Captura o footer como está (pode ter desconto 0 ou valor real)
    const footer = page.locator('footer, [data-testid="caixa-footer"]').first()
    if (await footer.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(footer).toHaveScreenshot('pdv-footer.png', {
        animations: 'disabled',
      })
    } else {
      // Fallback: página completa
      await expect(page).toHaveScreenshot('pdv-footer-full.png', {
        fullPage: false,
        animations: 'disabled',
      })
    }
  })
})

test.describe('Visual surfaces — Dragon UI components (sem auth)', () => {
  test('surface: /login page', async ({ page }) => {
    await page.goto(LOGIN_PATH)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: false,
      animations: 'disabled',
    })
  })
})
