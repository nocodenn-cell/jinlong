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

    const totalAntes = await readTotalLiquidoFooter(page)

    const qty = page.getByRole('spinbutton', { name: /Quantidade —/i }).first()
    if (await qty.isVisible().catch(() => false)) {
      await qty.fill('2')
      await qty.blur()

      // O footer recalcula de forma assíncrona após o blur — sem esperar a
      // atualização, `readTotalLiquidoFooter` abaixo pode ler o total ainda
      // da quantidade antiga (1), fazendo a parcela subsequente cobrir só
      // parte do total real e travar o finalize num "Falta R$X" silencioso
      // (era exatamente esse o timeout comprovado em `caixa-msg-venda-ok`).
      await expect
        .poll(
          async () =>
            Number(await page.getByTestId('caixa-total-liquido').getAttribute('data-total-liquido')),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(totalAntes)
    }

    const total = await readTotalLiquidoFooter(page)
    expect(total).toBeGreaterThan(0)

    // Pagamento único em DINHEIRO usa o campo "Recebido" (`#caixa-valor-
    // recebido`, `CaixaPdvOperadorTabs.tsx`), não "Valor (R$) da parcela" —
    // esse rótulo só existe no modo dividido (`Adicionar parcela de
    // pagamento`), que este fluxo nunca aciona. Com o seletor antigo,
    // `parcela.isVisible()` sempre resolvia `false` e o fill era pulado em
    // silêncio: "Recebido" ficava travado no valor do snapshot de quando o
    // produto foi adicionado (qty=1), sempre menor que o total após
    // aumentar a quantidade — daí o "Falta R$X" que bloqueava o finalize e
    // estourava o timeout em `caixa-msg-venda-ok`.
    const recebido = page.locator('#caixa-valor-recebido')
    if (await recebido.isVisible().catch(() => false)) {
      await recebido.fill(String(total))
      await recebido.blur()
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
    // Mesmo motivo documentado no teste anterior: campo real é "Recebido"
    // (#caixa-valor-recebido), não "Valor (R$) da parcela".
    const recebido = page.locator('#caixa-valor-recebido')
    if (await recebido.isVisible().catch(() => false)) {
      await recebido.fill(String(totalFrac))
      await recebido.blur()
    }

    await finalizarVenda(page)
    await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
    await expect(page.getByTestId('caixa-total-liquido')).toHaveAttribute('data-total-liquido', '0.00', {
      timeout: 15_000,
    })
  })
})
