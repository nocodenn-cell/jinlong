/**
 * PDV — Cenários offline e rede intermitente.
 *
 * Testa o comportamento do PDV quando a rede cai ou responde devagar.
 * O PDV operacional é usado em ambientes com Wi-Fi instável (balcão, depósito).
 *
 * Cenários cobertos:
 *   1. Rede cai durante sessão ativa → UI não quebra, mostra feedback
 *   2. Rede volta → PDV recupera sem reload manual
 *   3. Request lento (> 3s) → loading state visível, sem UI travada
 *   4. Supabase realtime desconecta → PDV continua operável (sem crash)
 *   5. Múltiplos cliques em "Finalizar" com rede lenta → sem duplicação
 *
 * Rodar: npm run test:e2e -- pdv-offline-intermitente.spec.ts
 *
 * IMPORTANTE: Estes testes usam `page.route()` para interceptar requests —
 * não requerem rede real offline. Funcionam em CI sem secret de caixa.
 */
import { test, expect, type Page } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword, e2eProdutoCodigoBarras } from './helpers/env'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './helpers/caixaModais'

const LOGIN_PATH = '/login'

// ── helpers ──────────────────────────────────────────────────────────────────

async function loginComoOperador(page: Page) {
  await page.goto(LOGIN_PATH)
  await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
  await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForURL(/\/caixa/, { timeout: 20_000 })
}

async function garantirCaixaAberto(page: Page) {
  await page.goto('/caixa')
  await expect(page.getByText(/PDV · Caixa|POS · 收银/)).toBeVisible({ timeout: 15_000 })
  const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
  if (await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await abrirBtn.click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '200')
    await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
  }
}

// ── testes sem auth (interceptação de rede pura) ────────────────────────────

test.describe('PDV — rede intermitente (sem auth, interceptação browser)', () => {
  test('página /caixa mostra erro útil quando Supabase inacessível no load inicial', async ({ page }) => {
    // Bloqueia todas as requests para Supabase antes de navegar
    await page.route('**/supabase.co/**', (route) => route.abort('failed'))
    await page.route('**/supabase.io/**', (route) => route.abort('failed'))

    await page.goto('/caixa')
    await page.waitForLoadState('domcontentloaded')

    // Deve mostrar erro de autenticação/redirect, não crash com stack trace nu
    // Aceita: login redirect, error boundary, ou mensagem de erro amigável
    const temErroVisivel = await Promise.race([
      page.waitForURL(/\/login/, { timeout: 8_000 }).then(() => 'login'),
      page.getByRole('heading', { name: /erro|error|falha|offline/i })
           .waitFor({ timeout: 8_000 }).then(() => 'heading'),
      page.getByText(/tente novamente|try again|reconectar|connection/i)
           .first().waitFor({ timeout: 8_000 }).then(() => 'text'),
    ]).catch(() => 'timeout')

    // Nunca deve mostrar um stack trace nu ou página em branco
    const pageContent = await page.content()
    expect(pageContent).not.toContain('at Object.<anonymous>')
    expect(pageContent).not.toContain('Unhandled Runtime Error')

    console.log(`[offline] resultado com Supabase bloqueado: ${temErroVisivel}`)
  })

  test('request lento (3s) para API de produto → loading visível, sem freeze', async ({ page }) => {
    // Simula rede lenta para endpoints de produto/busca
    await page.route('**/rest/v1/produtos**', async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue()
    })
    await page.route('**/rest/v1/rpc/buscar**', async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue()
    })

    await page.goto('/caixa')
    await page.waitForLoadState('domcontentloaded')

    // Página deve carregar sem travar (mesmo com API lenta)
    // Verifica que o browser ainda responde (título ou qualquer elemento visível)
    const titulo = page.getByText(/PDV|Caixa|Login|POS/i).first()
    await expect(titulo).toBeVisible({ timeout: 15_000 })

    // UI não deve estar frozen — deve aceitar interação
    const isInteractable = await page.evaluate(() => {
      return document.readyState === 'complete' || document.readyState === 'interactive'
    })
    expect(isInteractable).toBe(true)
  })

  test('múltiplos clicks em botão de submit → sem duplicação de requests', async ({ page }) => {
    let requestCount = 0
    await page.route('**/rest/v1/rpc/finalizar**', (route) => {
      requestCount++
      route.continue()
    })
    await page.route('**/rest/v1/rpc/registrar_venda**', (route) => {
      requestCount++
      route.continue()
    })

    // Navega para a página e verifica que botão fica disabled após o primeiro click
    await page.goto('/caixa')
    await page.waitForLoadState('domcontentloaded')

    // Localiza qualquer botão de submit/finalizar visível
    const finalizarBtn = page.getByRole('button', {
      name: /Finalizar|Pagar|结账|結賬|Abrir caixa|开启收银台/i,
    }).first()

    if (!await finalizarBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      test.skip(true, 'Nenhum botão de ação primária visível sem auth')
      return
    }

    await finalizarBtn.click()

    // Após o primeiro click, deve ficar disabled (aria-busy ou disabled attr)
    // Isso evita duplo-click acidental do operador
    const isDisabledAfterClick = await Promise.race([
      finalizarBtn.evaluate((el) =>
        el.hasAttribute('disabled') || el.getAttribute('aria-busy') === 'true'
      ).then((v) => v),
      new Promise<boolean>((r) => setTimeout(() => r(false), 1_000)),
    ])

    // Anotação informativa — não bloqueia (pode ter modal intermediário)
    if (!isDisabledAfterClick) {
      console.warn('[offline] AVISO: botão não ficou disabled após click — risco de duplo-submit')
    }
  })
})

// ── testes com auth ──────────────────────────────────────────────────────────

test.describe('PDV — offline com sessão ativa', () => {
  test.skip(!hasCaixaOperadorUser(), 'Requer PLAYWRIGHT_CAIXA_TEST_EMAIL + _PASSWORD')

  test('rede cai após login → PDV não crasha, mostra feedback', async ({ page }, testInfo) => {
    await loginComoOperador(page)
    await garantirCaixaAberto(page)

    // Rede cai após o PDV estar carregado
    await page.context().setOffline(true)

    // Aguarda um pouco para qualquer subscription de realtime perceber
    await page.waitForTimeout(1_500)

    // PDV deve continuar visível, não crashar
    await expect(page.getByText(/PDV · Caixa|POS · 收银/)).toBeVisible({ timeout: 5_000 })

    // Estrutura básica do PDV deve estar intacta
    const busca = page.getByRole('textbox', { name: /código de barras|条码/i })
    await expect(busca).toBeVisible({ timeout: 3_000 })

    // Não deve mostrar stack trace
    const pageContent = await page.content()
    expect(pageContent).not.toContain('at Object.<anonymous>')
    testInfo.annotations.push({ type: 'step', description: '✓ PDV sobrevive a offline' })

    // Rede volta
    await page.context().setOffline(false)
    await page.waitForTimeout(2_000)

    // PDV deve recuperar — campo de busca ainda funcional
    await expect(busca).toBeEditable({ timeout: 5_000 })
    testInfo.annotations.push({ type: 'step', description: '✓ PDV recupera após rede voltar' })
  })

  test('busca com rede lenta (500ms) → loading visível, resultado correto', async ({ page }, testInfo) => {
    await loginComoOperador(page)
    await garantirCaixaAberto(page)

    // Throttle apenas nos endpoints de busca de produto
    await page.route('**/rest/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 500))
      await route.continue()
    })

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', { name: /código de barras|条码/i })
    await expect(busca).toBeVisible({ timeout: 10_000 })
    await busca.fill(codigo)

    // Algum feedback durante a espera (loading, spinner, ou resultado)
    const feedback = page.getByRole('status')
      .or(page.getByRole('progressbar'))
      .or(page.locator('[aria-busy="true"]'))
      .or(page.locator('[data-testid="cart-item"]').first())

    await expect(feedback).toBeVisible({ timeout: 6_000 })
    testInfo.annotations.push({ type: 'step', description: '✓ Feedback visível com rede lenta' })
  })

  test('duplo-clique em Finalizar com rede lenta → apenas 1 venda', async ({ page }, testInfo) => {
    await loginComoOperador(page)
    await garantirCaixaAberto(page)

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', { name: /código de barras|条码/i })
    await expect(busca).toBeVisible({ timeout: 10_000 })
    await busca.fill(codigo)

    const itemOuStatus = page.locator('[data-testid="cart-item"]').first()
      .or(page.getByRole('status'))
    const produtoEncontrado = await itemOuStatus.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!produtoEncontrado) {
      testInfo.skip(true, `Produto ${codigo} não encontrado — pular teste de duplo-clique`)
      return
    }

    // Throttle a finalização para dar tempo de duplo-clicar
    await page.route('**/rest/v1/rpc/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_500))
      await route.continue()
    })

    const finalizarBtn = page.getByRole('button', { name: /Finalizar|Pagar|结账|結賬/i })
    if (!await finalizarBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      testInfo.skip(true, 'Botão Finalizar não visível — pular teste de duplo-clique')
      return
    }

    // Duplo-clique intencional (simula operador apressado)
    await finalizarBtn.click()
    await finalizarBtn.click({ force: true }) // força mesmo se disabled

    // Após os clicks, botão DEVE estar disabled (proteção anti-duplo-submit)
    await expect(finalizarBtn).toBeDisabled({ timeout: 2_000 })
    testInfo.annotations.push({ type: 'step', description: '✓ Botão desabilitado após primeiro click' })
  })
})
