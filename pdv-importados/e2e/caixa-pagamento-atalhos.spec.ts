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

    const botaoDinheiro = page.getByRole('radio', { name: /Dinheiro|现金|現金/i }).first()
    await expect(botaoDinheiro).toHaveAttribute('aria-checked', 'true')

    const inputValor = page.locator('input[type="number"]').first()
    const parcelasContainer = inputValor.locator('.., .., .., ..').filter({ has: page.locator('select, [role="radio"]') })

    const metodoVisual = page.locator('[role="radio"][aria-checked="true"]').locator('[aria-hidden="true"]').first()
    const atalhoNumero = await metodoVisual.textContent()
    expect(atalhoNumero?.trim()).toBe('1')
  })

  test('tecla 2 seleciona PIX e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const botaoPix = page.getByRole('radio', { name: /PIX|Pix/i }).first()
    await expect(botaoPix).toHaveAttribute('aria-checked', 'true')

    const metodoVisual = page.locator('[role="radio"][aria-checked="true"]').locator('[aria-hidden="true"]').first()
    const atalhoNumero = await metodoVisual.textContent()
    expect(atalhoNumero?.trim()).toBe('2')
  })

  test('tecla 3 seleciona Crédito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('3')

    const botaoCredito = page.getByRole('radio', { name: /Crédito|信用|信用卡/i }).first()
    await expect(botaoCredito).toHaveAttribute('aria-checked', 'true')

    const metodoVisual = page.locator('[role="radio"][aria-checked="true"]').locator('[aria-hidden="true"]').first()
    const atalhoNumero = await metodoVisual.textContent()
    expect(atalhoNumero?.trim()).toBe('3')
  })

  test('tecla 4 seleciona Débito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('4')

    const botaoDebito = page.getByRole('radio', { name: /Débito|借记|借記|Debit/i }).first()
    await expect(botaoDebito).toHaveAttribute('aria-checked', 'true')

    const metodoVisual = page.locator('[role="radio"][aria-checked="true"]').locator('[aria-hidden="true"]').first()
    const atalhoNumero = await metodoVisual.textContent()
    expect(atalhoNumero?.trim()).toBe('4')
  })

  test('método visual selecionado corresponde ao valor preenchido na primeira parcela', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const total = await readTotalLiquidoFooter(page)
    const inputValor = page.locator('input[type="number"]').first()
    await inputValor.fill(String(total))

    const botaoPix = page.getByRole('radio', { name: /PIX|Pix/i }).first()
    await expect(botaoPix).toHaveAttribute('aria-checked', 'true')

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
