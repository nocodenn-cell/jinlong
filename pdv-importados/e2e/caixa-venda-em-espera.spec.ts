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

    // `getByRole('status')` sozinho casa QUALQUER toast — inclusive o "Item
    // adicionado ao cupom." de `adicionarProdutoDemo`, que pode ainda estar
    // visível quando o toast de "em espera" aparece. Dois toasts simultâneos
    // com role=status violam o strict mode do Playwright em `toContainText`
    // (comprovado em CI: "strict mode violation: getByRole('status') resolved
    // to 3 elements"). Não era timing/flakiness — o locator nunca deveria ter
    // casado o grupo inteiro. Filtrar pelo texto esperado resolve para o toast
    // específico independente de quantos outros estejam na tela.
    const statusEmEspera = page.getByRole('status').filter({ hasText: /em espera|等待|暫存/i })
    const statusErroRpc = page.getByRole('status').filter({
      hasText: /não foi possível|could not|function|colocar_venda/i,
    })

    await expect(statusEmEspera.or(statusErroRpc)).toBeVisible({ timeout: 20_000 })
    if (await statusErroRpc.isVisible().catch(() => false)) {
      test.skip(
        true,
        'RPC colocar_venda_em_espera indisponível — aplique migration 255 no ambiente de testes.',
      )
      return
    }
    await expect(statusEmEspera).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText(/Pedido #1|订单 #1|訂單 #1/i)).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await expectCaixaShellVisible(page)
    await expect(page.getByText(/Pedido #1|订单 #1|訂單 #1/i)).toBeVisible({ timeout: 15_000 })

    await page.getByText(/Pedido #1|订单 #1|訂單 #1/i).click()
    const statusRetomado = page.getByRole('status').filter({ hasText: /retomad|恢复|恢復/i })
    await expect(statusRetomado).toBeVisible({ timeout: 15_000 })

    await finalizarVenda(page)
  })
})
