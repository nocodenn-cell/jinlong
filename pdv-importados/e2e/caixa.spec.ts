import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { gotoApp } from './helpers/url'

test.describe('PDV Caixa', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await loginCaixaOperador(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('página /caixa carrega com cabeçalho do PDV', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expect(page).toHaveURL(/\/caixa\/?$/)
    // "PDV · Caixa" saiu de propósito da UI (ver `helpers/caixaShell.ts`) —
    // o mesmo seletor obsoleto que outros specs já corrigiram, este arquivo
    // só não tinha migrado ainda.
    await expectCaixaShellVisible(page)
  })

  test('busca de produto e ação de sair estão acessíveis', async ({ page }) => {
    await gotoApp(page, '/caixa')
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
