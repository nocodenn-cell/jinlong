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

    await expect(selects).toHaveCount(1, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(selects.nth(0)).toHaveValue('DINHEIRO')

    await adicionarProdutoDemo(page, codigo)
    await adicionarParcela(page)
    await expect(selects).toHaveCount(2, { timeout: 10_000 })

    await page.getByRole('button', { name: /Novo cupom|Nova venda|新单|新單/i }).click()
    await expect(selects).toHaveCount(1, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(selects.nth(0)).toHaveValue('DINHEIRO')
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
})
