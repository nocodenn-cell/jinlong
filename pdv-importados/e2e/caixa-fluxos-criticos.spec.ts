import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { gotoApp } from './helpers/url'
import { confirmarModalValorNumerico, MODAL_TITULO_FECHAR } from './helpers/caixaModais'
import {
  abrirSangriaViaOperacoes,
  confirmarSangriaValor,
  limparCupomOuNovoCupom,
} from './helpers/caixaOperacoes'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — fluxos críticos (abrir → sangria → fechar)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR) + Supabase público. Gerente não acessa /caixa.',
      )
      return
    }
    await loginCaixaOperador(page, { postLoginUrl: /\/(caixa|gerente)/ })
  })

  test('fluxo: abrir caixa → sangria mínima → limpar cupom → fechar com valor do sistema', async ({
    page,
  }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '500')

    await abrirSangriaViaOperacoes(page)
    await confirmarSangriaValor(page, '1')

    const sangriaDialog = page.getByRole('dialog').filter({ hasText: /Registrar sangria/i })
    const erroLocal = sangriaDialog.getByRole('alert')
    const toastOk = page.getByRole('status').filter({ hasText: /registrada com sucesso|pendente|gerente/i })

    const outcome = await Promise.race([
      erroLocal.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'erro' as const),
      toastOk.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'ok' as const),
    ])

    if (outcome === 'erro') {
      const errTxt = await erroLocal.innerText()
      if (/SALDO_INSUFICIENTE/i.test(errTxt)) {
        await sangriaDialog.getByRole('button', { name: /Cancelar|取消/i }).click()
      } else {
        throw new Error(`Sangria falhou: ${errTxt}`)
      }
    }

    await limparCupomOuNovoCupom(page)

    const headerText = await page.locator('header').innerText()
    const saldoMatch =
      headerText.match(/Saldo estimado[^\dR]*R\$\s*([\d.,]+)/i) ??
      headerText.match(/Fundo[^\dR]*R\$\s*([\d.,]+)/i)
    if (!saldoMatch?.[1]) {
      test.skip(
        true,
        'UI sem «Saldo estimado»/«Fundo» no cabeçalho; fechamento automático não coberto aqui.',
      )
      return
    }
    const brutoFmt = saldoMatch[1].trim()
    const brutoNum = Number.parseFloat(brutoFmt.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(brutoNum)) {
      test.skip(true, 'Não foi possível ler o saldo do cabeçalho para o fechamento.')
      return
    }

    await page.getByRole('button', { name: /Fechar caixa|结算收银台|結算收銀台/ }).click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, brutoFmt)
    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, {
      timeout: 25_000,
    })
  })
})
