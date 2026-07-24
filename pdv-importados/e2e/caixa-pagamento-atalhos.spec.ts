import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import {
  adicionarProdutoDemo,
  irParaAbaPgto,
  readTotalLiquidoFooter,
} from './helpers/caixaPagamento'
import { gotoApp } from './helpers/url'

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — atalhos de teclado para método de pagamento', () => {
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

  async function setupPagamento(page: any) {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)
  }

  test('tecla 1 seleciona Dinheiro e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('1')

    const metodosRadio = page.locator('[role="radio"]')
    const primeiroRadio = metodosRadio.first()
    await expect(primeiroRadio).toHaveAttribute('aria-checked', 'true')
    await expect(primeiroRadio).toHaveAttribute('value', 'dinheiro')

    const atalhoDisplay = primeiroRadio.locator('[aria-hidden="true"]').first()
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('1')
  })

  test('tecla 2 seleciona PIX e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAttribute('value', 'pix')

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').first()
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('2')
  })

  test('tecla 3 seleciona Crédito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('3')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAttribute('value', 'credito')

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').first()
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('3')
  })

  test('tecla 4 seleciona Débito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('4')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAttribute('value', 'debito')

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').first()
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('4')
  })

  test('método visual selecionado corresponde ao valor da forma na primeira parcela', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const total = await readTotalLiquidoFooter(page)
    const inputValor = page.locator('input[type="number"]').first()
    await inputValor.fill(String(total))

    const metodoNoRadio = page.locator('[role="radio"][aria-checked="true"]').first()
    const valor = await metodoNoRadio.getAttribute('value')
    expect(valor?.toLowerCase()).toBe('pix')
  })

  test('sequência de atalhos: 1→2→3→4→1 muda corretamente', async ({ page }) => {
    await setupPagamento(page)

    const keys = ['1', '2', '3', '4', '1']
    const esperados = ['dinheiro', 'pix', 'credito', 'debito', 'dinheiro']

    for (let i = 0; i < keys.length; i++) {
      await page.keyboard.press(keys[i])

      const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
      const valorAtivo = await metodoAtivo.getAttribute('value')
      expect(valorAtivo?.toLowerCase()).toBe(esperados[i])
    }
  })
})
