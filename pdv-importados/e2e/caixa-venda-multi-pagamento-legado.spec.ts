import { test, expect, type Page } from '@playwright/test'
import {
  hasCaixaOperadorUser,
  caixaOperadorEmail,
  caixaOperadorPassword,
  e2eProdutoCodigoBarras,
} from './helpers/env'

const LOGIN_PATH = '/login'
const unifiedSalesFlowEnabled = process.env.USE_UNIFIED_SALES_FLOW === 'true'

function queuePromptAnswers(page: Page, answers: readonly string[]) {
  for (const answer of answers) {
    page.once('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(answer)
      else await dialog.dismiss()
    })
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — split bloqueado no fluxo legado', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Defina PLAYWRIGHT_CAIXA_TEST_EMAIL / PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/caixa/, { timeout: 20_000 })
  })

  test('bloqueia split quando USE_UNIFIED_SALES_FLOW=false', async ({ page }) => {
    test.skip(
      unifiedSalesFlowEnabled,
      'Cenário cobre fallback legado com USE_UNIFIED_SALES_FLOW=false.',
    )

    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      queuePromptAnswers(page, ['300'])
      await abrir.click()
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称/i,
    })
    await busca.fill(codigo)
    await busca.press('Enter')

    const status = page.getByTestId('caixa-status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const statusTxt = (await status.innerText()).toLowerCase()
    if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
      test.skip(
        true,
        `Produto «${codigo}» não encontrado (seed 027 ou PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
      )
      return
    }
    await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })

    const footer = page.locator('footer')
    await footer.getByRole('button', { name: /^\+$/ }).click()
    await expect(footer.locator('select')).toHaveCount(2, { timeout: 10_000 })

    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    await expect(status).toContainText(
      /Split de pagamento requer fluxo unificado habilitado no servidor/i,
      { timeout: 20_000 },
    )
    await expect(page.getByTestId('caixa-msg-venda-ok')).toHaveCount(0)
  })
})
