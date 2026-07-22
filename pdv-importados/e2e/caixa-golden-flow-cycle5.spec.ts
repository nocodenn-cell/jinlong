/**
 * Cycle 5 — Golden Flow operacional (browser).
 * Login → caixa aberto → produto → qty → finalizar → feedback → cupom limpo.
 */
import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import {
  adicionarProdutoDemo,
  finalizarVenda,
  readTotalLiquidoFooter,
} from './helpers/caixaPagamento'
import { gotoApp } from './helpers/url'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — Golden Flow Cycle 5 (browser)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(true, 'PLAYWRIGHT_CAIXA_TEST_EMAIL / PASSWORD obrigatórios.')
      return
    }
    await loginCaixaOperador(page)
  })

  test('venda DINHEIRO ponta a ponta com feedback e cupom limpo', async ({ page }) => {
    test.setTimeout(120_000)
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)

    const turno = await ensureCaixaAberto(page, '300')
    expect(['ja_aberto', 'abriu']).toContain(turno)

    const codigo = e2eProdutoCodigoBarras()
    await adicionarProdutoDemo(page, codigo)

    const qty = page.getByRole('spinbutton', { name: /Quantidade —/i }).first()
    if (await qty.isVisible().catch(() => false)) {
      await qty.fill('2')
      await qty.blur()
    }

    const total = await readTotalLiquidoFooter(page)
    expect(total).toBeGreaterThan(0)

    // Parcela de pagamento deve acompanhar o total (evita "Falta" bloquear finalize)
    const parcela = page.getByRole('spinbutton', { name: /Valor \(R\$\) da parcela/i }).first()
    if (await parcela.isVisible().catch(() => false)) {
      await parcela.fill(String(total))
    }

    await finalizarVenda(page)

    const vendaOk = page.getByTestId('caixa-msg-venda-ok')
    await expect(vendaOk).toContainText(/Venda registrada|registrad|已记录|已記錄/i)

    await expect(page.getByTestId('caixa-total-liquido')).toHaveAttribute(
      'data-total-liquido',
      '0.00',
      { timeout: 15_000 },
    )
  })

  test('venda fracionada (qty 0,5) finaliza e limpa cupom', async ({ page }) => {
    test.setTimeout(120_000)
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')

    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())

    const qty = page.getByRole('spinbutton', { name: /Quantidade —/i }).first()
    await expect(qty).toBeVisible({ timeout: 10_000 })
    await qty.fill('0.5')
    await qty.blur()

    await expect
      .poll(async () => Number(await page.getByTestId('caixa-total-liquido').getAttribute('data-total-liquido')), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    const totalFrac = await readTotalLiquidoFooter(page)
    const parcela = page.getByRole('spinbutton', { name: /Valor \(R\$\) da parcela/i }).first()
    if (await parcela.isVisible().catch(() => false)) {
      await parcela.fill(String(totalFrac))
    }

    await finalizarVenda(page)
    await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
    await expect(page.getByTestId('caixa-total-liquido')).toHaveAttribute('data-total-liquido', '0.00', {
      timeout: 15_000,
    })
  })
})
