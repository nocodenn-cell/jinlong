/**
 * PDV — Timing dos fluxos críticos.
 *
 * Mede o tempo real de cada etapa operacional que o operador de caixa sente.
 * Não é benchmark sintético — são medições dos fluxos reais com o browser.
 *
 * Thresholds definidos com margem para CI (2× o esperado em produção real):
 *   - Login → /caixa pronto:       < 8s
 *   - Busca de produto (digitação): < 2s até primeiro resultado
 *   - Adicionar item ao carrinho:  < 500ms (feedback visual)
 *   - Abrir modal (qualquer):      < 400ms
 *   - Finalizar venda completa:    < 5s (do clique até toast de confirmação)
 *   - Novo cupom (limpar):         < 300ms
 *
 * Rodar: npm run test:e2e -- pdv-timing.spec.ts
 * Output: timings aparecem no reporter como anotações de teste.
 */
import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword, e2eProdutoCodigoBarras } from './helpers/env'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './helpers/caixaModais'

const LOGIN_PATH = '/login'

// Thresholds em ms — ajustar se o ambiente de staging for consistentemente mais lento
const T = {
  loginToCaixa:    8_000,
  buscaProduto:    2_000,
  adicionarItem:     500,
  abrirModal:        400,
  finalizarVenda:  5_000,
  novoCupom:         300,
  abrirCaixa:     25_000,
}

test.describe.configure({ mode: 'serial' })

test.describe('PDV — timing fluxos críticos', () => {
  test.skip(!hasCaixaOperadorUser(), 'Requer PLAYWRIGHT_CAIXA_TEST_EMAIL + _PASSWORD')

  let t0: number

  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/caixa/, { timeout: 20_000 })
  })

  test('T1 — login → PDV pronto (interactive)', async ({ page }, testInfo) => {
    t0 = Date.now()
    await page.goto(LOGIN_PATH)

    const loginStart = Date.now()
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/caixa/, { timeout: 20_000 })

    // PDV pronto = campo de busca focável (PDV interativo para o operador)
    const busca = page.getByRole('textbox', { name: /código de barras|条码/i })
    await busca.waitFor({ state: 'visible', timeout: 15_000 })

    const elapsed = Date.now() - loginStart
    testInfo.annotations.push({ type: 'timing', description: `login→PDV: ${elapsed}ms` })
    console.log(`[timing] login→PDV: ${elapsed}ms (threshold ${T.loginToCaixa}ms)`)
    expect(elapsed, `Login→PDV deve ser < ${T.loginToCaixa}ms`).toBeLessThan(T.loginToCaixa)
  })

  test('T2 — busca de produto (digitação → primeiro resultado)', async ({ page }, testInfo) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银/)).toBeVisible({ timeout: 15_000 })

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', { name: /código de barras|条码/i })
    await busca.waitFor({ state: 'visible' })
    await busca.click()

    const buscaStart = Date.now()
    await busca.fill(codigo)
    // Primeiro resultado: toast, item no carrinho, ou sugestão de autocomplete
    await expect(
      page.getByRole('status').or(page.getByRole('listitem').first()),
    ).toBeVisible({ timeout: T.buscaProduto + 1_000 })

    const elapsed = Date.now() - buscaStart
    testInfo.annotations.push({ type: 'timing', description: `busca produto: ${elapsed}ms` })
    console.log(`[timing] busca produto: ${elapsed}ms (threshold ${T.buscaProduto}ms)`)
    expect(elapsed, `Busca deve responder em < ${T.buscaProduto}ms`).toBeLessThan(T.buscaProduto)
  })

  test('T3 — abrir modal de caixa', async ({ page }, testInfo) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银/)).toBeVisible({ timeout: 15_000 })

    // Testa o modal que estiver disponível (abrir ou fechar caixa)
    const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    const fecharBtn = page.getByRole('button', { name: /Fechar caixa|关闭收银台/ })

    const btnDisponivel = await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)
      ? abrirBtn
      : fecharBtn

    const modalStart = Date.now()
    await btnDisponivel.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: T.abrirModal + 500 })

    const elapsed = Date.now() - modalStart
    testInfo.annotations.push({ type: 'timing', description: `abrir modal: ${elapsed}ms` })
    console.log(`[timing] abrir modal caixa: ${elapsed}ms (threshold ${T.abrirModal}ms)`)
    expect(elapsed, `Modal deve abrir em < ${T.abrirModal}ms`).toBeLessThan(T.abrirModal)

    // Fechar sem confirmar
    await page.keyboard.press('Escape')
  })

  test('T4 — novo cupom (limpar carrinho)', async ({ page }, testInfo) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银/)).toBeVisible({ timeout: 15_000 })

    const novoBtn = page.getByRole('button', { name: /Novo cupom|New sale|新单/ })
    if (!await novoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      testInfo.skip(true, 'Botão "Novo cupom" não visível — caixa pode estar fechado')
    }

    const t = Date.now()
    await novoBtn.click()
    // Carrinho limpo = total zerado ou empty state visível
    await expect(
      page.getByText(/R\$\s*0,00|carrinho vazio|empty|0\.00/i).first(),
    ).toBeVisible({ timeout: T.novoCupom + 1_000 })

    const elapsed = Date.now() - t
    testInfo.annotations.push({ type: 'timing', description: `novo cupom: ${elapsed}ms` })
    console.log(`[timing] novo cupom: ${elapsed}ms (threshold ${T.novoCupom}ms)`)
    expect(elapsed, `Novo cupom deve ser < ${T.novoCupom}ms`).toBeLessThan(T.novoCupom)
  })
})
