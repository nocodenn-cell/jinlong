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
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import { expectCaixaShellVisible } from './helpers/caixaShell'

test.describe('Caixa — modais abertura e fechamento (sem prompt)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
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

    // "Novo cupom" não existe mais — o botão atual é "Nova venda (+)"
    // (mesmo contrato já corrigido/validado em caixa-fluxos-criticos.spec.ts).
    await page.getByRole('button', { name: /Nova venda \(\+\)|新销售|新銷售/i }).click()

    // "Saldo estimado" nunca existiu na UI atual — o cabeçalho mostra
    // "Fundo: {{valor}}" (`CaixaPdvTopBar.tsx`), já refletindo fundo −
    // sangrias + vendas. Mesmo contrato e mesmo motivo já comprovados em
    // caixa-fluxos-criticos.spec.ts: falha explícita, não skip — com blind
    // closure desligado (`pdv_config.blind_closure = false` no ambiente
    // local) "Fundo:" é uma precondição obrigatória do fluxo, não um
    // caminho alternativo.
    const headerText = await page.locator('header').innerText()
    expect(headerText, 'cabeçalho do caixa deveria exibir "Fundo:" com blind closure desligado').toContain(
      'Fundo:',
    )
    const m = headerText.match(/Fundo:\s*R\$\s*([\d.,]+)/i)
    const saldoStr = m?.[1]?.replace(/\./g, '').replace(',', '.').trim()
    const saldo = saldoStr ? Number.parseFloat(saldoStr) : Number.NaN
    expect(Number.isFinite(saldo), `não foi possível ler o valor de "Fundo:" no cabeçalho (texto: "${headerText}")`).toBe(
      true,
    )

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
