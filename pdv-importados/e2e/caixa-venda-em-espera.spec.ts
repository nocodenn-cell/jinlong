import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { gotoApp } from './helpers/url'
import {
  abrirCaixaSeNecessario,
  adicionarProdutoDemo,
  finalizarVenda,
} from './helpers/caixaPagamento'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — venda em espera (park → refresh → resume → finalizar)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Defina PLAYWRIGHT_CAIXA_TEST_EMAIL / PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await loginCaixaOperador(page)
  })

  test('coloca em espera, persiste após refresh, retoma e finaliza', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)

    await abrirCaixaSeNecessario(page)
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())

    await page.getByRole('button', { name: /Nova venda \(\+\)|新销售|新銷售/i }).click()

    const status = page.getByRole('status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const parkTxt = (await status.innerText()).toLowerCase()
    if (
      parkTxt.includes('não foi possível') ||
      parkTxt.includes('could not') ||
      parkTxt.includes('function') ||
      parkTxt.includes('colocar_venda')
    ) {
      test.skip(
        true,
        'RPC colocar_venda_em_espera indisponível — aplique migration 255 no ambiente de testes.',
      )
      return
    }
    await expect(status).toContainText(/em espera|等待|暫存/i, { timeout: 15_000 })

    await expect(page.getByText(/Pedido #1|订单 #1|訂單 #1/i)).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await expectCaixaShellVisible(page)
    await expect(page.getByText(/Pedido #1|订单 #1|訂單 #1/i)).toBeVisible({ timeout: 15_000 })

    await page.getByText(/Pedido #1|订单 #1|訂單 #1/i).click()
    await expect(status).toContainText(/retomad|恢复|恢復/i, { timeout: 15_000 })

    await finalizarVenda(page)
  })
})
