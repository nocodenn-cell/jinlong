import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import { gotoApp } from './helpers/url'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — finalizar venda (catálogo seed)', () => {
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

  test('busca produto demo, adiciona ao cupom e finaliza venda (DINHEIRO)', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称/i,
    })
    await busca.fill(codigo)
    await busca.press('Enter')

    const adicionadoOuErro = page.getByRole('status')
    await expect(adicionadoOuErro).toBeVisible({ timeout: 20_000 })
    const statusTxt = (await adicionadoOuErro.innerText()).toLowerCase()
    if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
      test.skip(
        true,
        `Produto «${codigo}» não encontrado no ambiente (aplique seed 027 ou defina PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
      )
      return
    }
    await expect(adicionadoOuErro).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })

    await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    const vendaOk = page.getByTestId('caixa-msg-venda-ok')
    await expect(vendaOk).toBeVisible({ timeout: 35_000 })
    await expect(vendaOk).toContainText(
      /Venda registrada|已记录销售|已記錄銷售|registrad/i,
    )
  })
})
