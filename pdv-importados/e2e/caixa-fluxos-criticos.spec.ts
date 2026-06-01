import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { gotoApp } from './helpers/url'
import {
  confirmarModalValorNumerico,
  MODAL_TITULO_ABRIR,
  MODAL_TITULO_FECHAR,
} from './helpers/caixaModais'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — fluxos críticos (abrir → sangria → fechar)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR) + Supabase público. Gerente não acessa /caixa.',
      )
      return
    }
    await loginCaixaOperador(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('fluxo: abrir caixa → sangria R$50 → limpar cupom → fechar com valor do sistema', async ({
    page,
  }) => {
    await gotoApp(page, '/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '120')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    await page.getByRole('button', { name: /Sangria (-)/ }).click()
    await expect(page.getByRole('dialog')).toContainText(/Registrar sangria/i, { timeout: 10_000 })
    await page.getByRole('button', { name: /R\$\s*50\.00/ }).click()
    await page.getByRole('button', { name: /^Confirmar$/ }).click()
    await expect(page.getByRole('status')).toContainText(
      /registrada com sucesso|pendente|gerente/i,
      { timeout: 25_000 },
    )

    await page.getByRole('button', { name: /Novo cupom/ }).click()

    const headerText = await page.locator('header').innerText()
    if (!headerText.includes('Saldo estimado')) {
      test.skip(
        true,
        'UI sem linha «Saldo estimado» (ex.: blind closure); fechamento automático não coberto aqui.',
      )
      return
    }
    const m = headerText.match(/Saldo estimado[^\dR]*R\$\s*([\d.,]+)/i)
    const bruto = m?.[1]?.replace(',', '.').trim()
    if (!bruto || Number.isNaN(Number.parseFloat(bruto))) {
      test.skip(true, 'Não foi possível ler o saldo estimado do cabeçalho para o fechamento.')
      return
    }

    await page.getByRole('button', { name: /Fechar caixa|结算收银台|結算收銀台/ }).click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, bruto)
    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, { timeout: 25_000 })
  })
})
