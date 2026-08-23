import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import {
  adicionarParcela,
  adicionarProdutoDemo,
  finalizarVenda,
  irParaAbaPgto,
  painelPgto,
  parcelasNoPainel,
  readTotalLiquidoFooter,
  round2,
} from './helpers/caixaPagamento'
import { gotoApp } from './helpers/url'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — venda multi-pagamento (painel Pgto clássico)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Defina PLAYWRIGHT_CAIXA_TEST_EMAIL / PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR).',
      )
      return
    }
    await loginCaixaOperador(page)
  })

  test('duas parcelas somam ao total e finaliza com sucesso', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)
    await adicionarParcela(page)

    const { selects, inputs } = parcelasNoPainel(page)
    await expect(selects).toHaveCount(2, { timeout: 10_000 })
    await expect(inputs).toHaveCount(2)

    await selects.nth(0).selectOption({ value: 'DINHEIRO' })
    await selects.nth(1).selectOption({ value: 'PIX' })

    const total = await readTotalLiquidoFooter(page)
    const parte1 = round2(Math.max(0.01, total * 0.4))
    const parte2 = round2(total - parte1)
    await inputs.nth(0).fill(String(parte1))
    await inputs.nth(1).fill(String(parte2))

    await finalizarVenda(page)
  })

  test('nao vaza parcelas para proximo cupom apos finalizar e novo cupom', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    const codigo = e2eProdutoCodigoBarras()
    await adicionarProdutoDemo(page, codigo)
    await irParaAbaPgto(page)
    await adicionarParcela(page)

    const { selects, inputs } = parcelasNoPainel(page)
    await expect(selects).toHaveCount(2, { timeout: 10_000 })
    await selects.nth(0).selectOption({ value: 'DINHEIRO' })
    await selects.nth(1).selectOption({ value: 'PIX' })

    const total = await readTotalLiquidoFooter(page)
    const parte1 = round2(Math.max(0.01, total * 0.6))
    const parte2 = round2(total - parte1)
    await inputs.nth(0).fill(String(parte1))
    await inputs.nth(1).fill(String(parte2))

    await finalizarVenda(page)

    // Uma única parcela (não dividido) não usa mais `<select>` — o painel
    // troca para o RadioGroup de forma de pagamento nesse estado
    // (`dividido = pagamentos.length > 1`, CaixaPdvOperadorTabs.tsx:73/121).
    // `<select>` só existe quando dividido (linha 128 do mesmo arquivo).
    // Preservando a intenção do teste (nenhuma parcela do cupom anterior
    // vaza para o novo): 0 selects comprova que voltou ao modo não dividido,
    // e o radio marcado comprova que o método resetou para o padrão
    // (Dinheiro), sem herdar a forma da parcela anterior.
    await expect(selects).toHaveCount(0, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(painelPgto(page).getByRole('radio', { checked: true })).toHaveAccessibleName(/Dinheiro/i)

    await adicionarProdutoDemo(page, codigo)
    await adicionarParcela(page)
    await expect(selects).toHaveCount(2, { timeout: 10_000 })

    // "Novo cupom" nunca existiu na UI atual — o botão real é "Nova venda (+)"
    // (`m.caixa.nova_venda_espera`, `CaixaPageClient.tsx:1459`). zh correto é
    // "新单 (+)" (confirmado no i18n; não "新销售"/"新銷售").
    await page.getByRole('button', { name: /Nova venda \(\+\)|新单/i }).click()
    await expect(selects).toHaveCount(0, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(painelPgto(page).getByRole('radio', { checked: true })).toHaveAccessibleName(/Dinheiro/i)
  })

  test('tres parcelas (DINHEIRO + PIX + CARTAO_DEBITO) somam ao total e finaliza', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)
    await adicionarParcela(page)
    await adicionarParcela(page)

    const { selects, inputs } = parcelasNoPainel(page)
    await expect(selects).toHaveCount(3, { timeout: 10_000 })
    await expect(inputs).toHaveCount(3)

    await selects.nth(0).selectOption({ value: 'DINHEIRO' })
    await selects.nth(1).selectOption({ value: 'PIX' })
    await selects.nth(2).selectOption({ value: 'CARTAO_DEBITO' })

    const total = await readTotalLiquidoFooter(page)
    const p1 = round2(Math.max(0.01, total * 0.25))
    const p2 = round2(Math.max(0.01, total * 0.35))
    const p3 = round2(total - p1 - p2)
    await inputs.nth(0).fill(String(p1))
    await inputs.nth(1).fill(String(p2))
    await inputs.nth(2).fill(String(p3))

    await finalizarVenda(page)
  })

  test('pagamento parcial sem cliente abre modal Fase 5b (BA-001)', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)

    const { inputs } = parcelasNoPainel(page)
    const total = await readTotalLiquidoFooter(page)
    const paga = round2(total * 0.4)
    await inputs.nth(0).fill(String(paga))

    await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    await expect(page.getByRole('heading', { name: /Selecionar Cliente/i })).toBeVisible({
      timeout: 15_000,
    })
  })
})
