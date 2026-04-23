import { test, expect } from '@playwright/test'
import {
  hasCaixaOperadorUser,
  caixaOperadorEmail,
  caixaOperadorPassword,
} from './helpers/env'
import {
  confirmarModalValorNumerico,
  confirmarModalMotivoMin,
  MODAL_TITULO_ABRIR,
  MODAL_TITULO_FECHAR,
  MODAL_TITULO_MOTIVO_DIF,
} from './helpers/caixaModais'

const LOGIN_PATH = '/login'

test.describe('Caixa — modais abertura e fechamento (sem prompt)', () => {
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
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
  })

  test('abre caixa pelo modal (valor + confirmar) e fecha com divergência (valor + motivo)', async ({
    page,
  }) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '77,25')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    await page.getByRole('button', { name: /Novo cupom|新小票|新單/i }).click()

    const headerText = await page.locator('header').innerText()
    if (!headerText.includes('Saldo estimado')) {
      test.skip(
        true,
        'Ambiente com blind closure ou UI sem «Saldo estimado»; fluxo de motivo por diferença não aplicável.',
      )
      return
    }
    const m = headerText.match(/Saldo estimado[^\dR]*R\$\s*([\d.,]+)/i)
    const saldoStr = m?.[1]?.replace(',', '.').trim()
    const saldo = saldoStr ? Number.parseFloat(saldoStr) : Number.NaN
    if (!Number.isFinite(saldo)) {
      test.skip(true, 'Não foi possível ler o saldo estimado do cabeçalho.')
      return
    }

    const contado = saldo + 18.5
    const contadoFmt = contado.toFixed(2).replace('.', ',')

    await page.getByRole('button', { name: /Fechar caixa|结算收银台|結算收銀台/ }).click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, contadoFmt)
    await confirmarModalMotivoMin(
      page,
      MODAL_TITULO_MOTIVO_DIF,
      'Motivo automação E2E divergência.',
    )

    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, { timeout: 25_000 })
  })
})
