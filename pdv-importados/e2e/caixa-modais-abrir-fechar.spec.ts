import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { gotoApp } from './helpers/url'
import {
  confirmarModalValorNumerico,
  confirmarModalMotivoMin,
  MODAL_TITULO_FECHAR,
  MODAL_TITULO_MOTIVO_DIF,
} from './helpers/caixaModais'
import { limparCupomOuNovoCupom } from './helpers/caixaOperacoes'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'

test.describe('Caixa — modais abertura e fechamento (sem prompt)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Defina PLAYWRIGHT_CAIXA_TEST_EMAIL / PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await loginCaixaOperador(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('abre caixa pelo modal (valor + confirmar) e fecha com divergência (valor + motivo)', async ({
    page,
  }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '77,25')

    await limparCupomOuNovoCupom(page)

    const headerText = await page.locator('header').innerText()
    const saldoMatch =
      headerText.match(/Saldo estimado[^\dR]*R\$\s*([\d.,]+)/i) ??
      headerText.match(/Fundo[^\dR]*R\$\s*([\d.,]+)/i)
    if (!saldoMatch?.[1]) {
      test.skip(
        true,
        'Ambiente com blind closure ou UI sem «Saldo estimado»/«Fundo»; fluxo de motivo por diferença não aplicável.',
      )
      return
    }
    const saldoFmt = saldoMatch[1].trim()
    const saldo = Number.parseFloat(saldoFmt.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(saldo)) {
      test.skip(true, 'Não foi possível ler o saldo do cabeçalho.')
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

    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, {
      timeout: 25_000,
    })
  })
})
