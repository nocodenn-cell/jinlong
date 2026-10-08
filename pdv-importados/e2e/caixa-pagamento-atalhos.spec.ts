import { test, expect, type Page } from '@playwright/test'
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

test.describe('Caixa — atalhos de teclado e clique do mouse para método de pagamento', () => {
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

  async function setupPagamento(page: Page) {
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)
    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)
    // Os atalhos de teclado (1-4) são ignorados de propósito quando o foco
    // está num campo de texto (`alvoEhCampoTexto`,
    // useCaixaKeyboardShortcuts.ts) — proteção real contra digitar "2" no
    // código de barras e sem querer trocar a forma de pagamento. O foco
    // permanece no campo de busca depois de `adicionarProdutoDemo` (UX de
    // bipagem contínua); sem tirar o foco de lá, `page.keyboard.press()`
    // nunca alcança o handler do atalho.
    await page.getByRole('textbox', { name: /código de barras|nome do produto|条码|商品名称/i }).blur()
  }

  test('tecla 1 seleciona Dinheiro e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('1')

    // `value` não é atributo DOM real — `RadioGroupItem` (components/ui/radio-group.tsx)
    // é um `<button role="radio">`, e `value` é destructured para fora do
    // spread de props (só usado internamente via contexto React para decidir
    // `aria-checked`), nunca chega ao DOM. O nome acessível real é o texto
    // visível do botão ("Dinheiro"/"PIX"/"Crédito"/"Débito"); o dígito do
    // atalho fica num span `aria-hidden`, por isso não entra no nome.
    const metodosRadio = page.locator('[role="radio"]')
    const primeiroRadio = metodosRadio.first()
    await expect(primeiroRadio).toHaveAttribute('aria-checked', 'true')
    await expect(primeiroRadio).toHaveAccessibleName(/Dinheiro/i)

    // Dois elementos `aria-hidden` existem dentro do botão
    // (CaixaPdvMetodoPagamentoSelector.tsx): o ícone decorativo (primeiro no
    // DOM, sem texto) e o span do dígito do atalho (depois, com "1".."4").
    // `.first()` pegava sempre o ícone — texto vazio, nunca o dígito.
    // Filtrar por conteúdo (um único dígito) identifica o span certo pelo que
    // ele É, não pela posição no DOM; sem alterar o produto.
    const atalhoDisplay = primeiroRadio.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('1')
  })

  test('tecla 2 seleciona PIX e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/PIX/i)

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('2')
  })

  test('clique do mouse em Crédito (tecla 3) seleciona corretamente', async ({ page }) => {
    await setupPagamento(page)

    const radios = page.locator('[role="radio"]')
    const botaoCredito = radios.nth(2)

    await botaoCredito.click()

    await expect(botaoCredito).toHaveAttribute('aria-checked', 'true')
    await expect(botaoCredito).toHaveAccessibleName(/Crédito/i)

    const atalhoDisplay = botaoCredito.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('3')
  })

  test('tecla 3 seleciona Crédito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('3')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/Crédito/i)

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('3')
  })

  test('clique do mouse em Débito (tecla 4) seleciona corretamente', async ({ page }) => {
    await setupPagamento(page)

    const radios = page.locator('[role="radio"]')
    const botaoDebito = radios.nth(3)

    await botaoDebito.click()

    await expect(botaoDebito).toHaveAttribute('aria-checked', 'true')
    await expect(botaoDebito).toHaveAccessibleName(/Débito/i)

    const atalhoDisplay = botaoDebito.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('4')
  })

  test('tecla 4 seleciona Débito e reflete no RadioGroup', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('4')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/Débito/i)

    const atalhoDisplay = metodoAtivo.locator('[aria-hidden="true"]').filter({ hasText: /^\d$/ })
    const atalhoNumero = await atalhoDisplay.textContent()
    expect(atalhoNumero?.trim()).toBe('4')
  })

  test('alternância entre clique do mouse e teclado: Crédito (clique) → Débito (tecla)', async ({ page }) => {
    await setupPagamento(page)

    const radios = page.locator('[role="radio"]')
    const botaoCredito = radios.nth(2)

    await botaoCredito.click()
    await expect(botaoCredito).toHaveAttribute('aria-checked', 'true')
    await expect(botaoCredito).toHaveAccessibleName(/Crédito/i)

    await page.keyboard.press('4')

    const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/Débito/i)
  })

  test('alternância entre teclado e clique do mouse: Débito (tecla) → Crédito (clique)', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('4')

    let metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/Débito/i)

    const radios = page.locator('[role="radio"]')
    const botaoCredito = radios.nth(2)

    await botaoCredito.click()

    metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoAtivo).toHaveAccessibleName(/Crédito/i)
  })

  test('método visual selecionado corresponde ao valor da forma na primeira parcela', async ({ page }) => {
    await setupPagamento(page)

    await page.keyboard.press('2')

    const total = await readTotalLiquidoFooter(page)
    const inputValor = page.locator('input[type="number"]').first()
    await inputValor.fill(String(total))

    const metodoNoRadio = page.locator('[role="radio"][aria-checked="true"]').first()
    await expect(metodoNoRadio).toHaveAccessibleName(/PIX/i)
  })

  test('sequência de atalhos: 1→2→3→4→1 muda corretamente', async ({ page }) => {
    await setupPagamento(page)

    const keys = ['1', '2', '3', '4', '1']
    const esperados = [/Dinheiro/i, /PIX/i, /Crédito/i, /Débito/i, /Dinheiro/i]

    for (let i = 0; i < keys.length; i++) {
      await page.keyboard.press(keys[i])

      const metodoAtivo = page.locator('[role="radio"][aria-checked="true"]').first()
      await expect(metodoAtivo).toHaveAccessibleName(esperados[i])
    }
  })
})
