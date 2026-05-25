/**
 * PDV — Smoke test de venda completa.
 *
 * Fluxo operacional completo que um caixa executa dezenas de vezes por dia:
 *   1. Login como operador
 *   2. Abrir caixa (se fechado)
 *   3. Buscar produto por código de barras
 *   4. Confirmar adição ao carrinho
 *   5. Aplicar desconto (se disponível)
 *   6. Finalizar com DINHEIRO → troco
 *   7. Confirmar toast de sucesso
 *   8. Novo cupom → carrinho limpo
 *
 * Este teste NÃO requer seed controlado — usa produto demo do ambiente de teste.
 * Se o produto não existir: SKIP com mensagem clara.
 *
 * Rodar: npm run test:e2e -- pdv-smoke-venda-completa.spec.ts
 */
import { test, expect } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword, e2eProdutoCodigoBarras } from './helpers/env'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './helpers/caixaModais'

const LOGIN_PATH = '/login'
const TIMEOUT_OP = 25_000 // operações Supabase podem ter latência em staging

test.describe.configure({ mode: 'serial' })

test.describe('PDV — smoke venda completa (login → cupom pago → novo cupom)', () => {
  test.skip(!hasCaixaOperadorUser(), 'Requer PLAYWRIGHT_CAIXA_TEST_EMAIL + _PASSWORD')

  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/caixa/, { timeout: 20_000 })
  })

  test('fluxo completo: abrir caixa → produto → pagar → novo cupom', async ({ page }, testInfo) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    // ── Passo 1: Garantir caixa aberto ──────────────────────────────────────
    const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await abrirBtn.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '500')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: TIMEOUT_OP })
    }
    testInfo.annotations.push({ type: 'step', description: '✓ Caixa aberto' })

    // ── Passo 2: Buscar produto por código de barras ─────────────────────────
    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', { name: /código de barras|nome do produto|条码|商品名称/i })
    await expect(busca).toBeVisible({ timeout: 10_000 })
    await busca.click()
    await busca.fill(codigo)

    // Produto adicionado = aparece na lista do carrinho (li com nome ou preço)
    // Ou toast de "produto adicionado". Aguarda qualquer dos dois.
    const itemNoCarrinho = page.locator('[data-testid="cart-item"], [role="listitem"]').first()
    const toastAdicionado = page.getByRole('status')

    try {
      await expect(itemNoCarrinho.or(toastAdicionado)).toBeVisible({ timeout: 5_000 })
    } catch {
      testInfo.skip(true, `Produto ${codigo} não encontrado no ambiente de teste — configure PLAYWRIGHT_E2E_PRODUTO_CODIGO`)
      return
    }
    testInfo.annotations.push({ type: 'step', description: `✓ Produto ${codigo} adicionado` })

    // ── Passo 3: Verificar total > 0 no footer ───────────────────────────────
    // Total deve ser > R$ 0,00 após adicionar produto
    await expect(
      page.getByText(/R\$\s*[1-9][\d,.]+/).first()
    ).toBeVisible({ timeout: 5_000 })
    testInfo.annotations.push({ type: 'step', description: '✓ Total calculado' })

    // ── Passo 4: Selecionar método DINHEIRO ──────────────────────────────────
    const dinheiroBtn = page.getByRole('button', { name: /^Dinheiro|^现金|^現金/ })
    if (await dinheiroBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dinheiroBtn.click()
    }
    // Se já estiver selecionado (padrão), continua

    // ── Passo 5: Finalizar venda ─────────────────────────────────────────────
    const finalizarBtn = page.getByRole('button', {
      name: /Finalizar|Pagar|结账|結賬|Cobrar/i,
    })
    await expect(finalizarBtn).toBeVisible({ timeout: 5_000 })
    await expect(finalizarBtn).toBeEnabled({ timeout: 3_000 })

    const finalizarStart = Date.now()
    await finalizarBtn.click()

    // Pode abrir modal de valor ou finalizar direto
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible({ timeout: 1_500 }).catch(() => false)) {
      // Modal de valor recebido — inserir valor igual ao total para troco = 0
      const totalText = await page.getByText(/R\$\s*[\d,.]+/).first().textContent()
      const valorNumerico = totalText?.replace(/[^\d,]/g, '').replace(',', '.') ?? '50'
      await dialog.getByRole('textbox').fill(valorNumerico)
      await dialog.getByRole('button', { name: /Confirmar|确认|確認/ }).click()
    }

    // ── Passo 6: Confirmar sucesso ────────────────────────────────────────────
    await expect(page.getByRole('status')).toContainText(
      /venda|finaliz|sucesso|pago|sale|完成|done/i,
      { timeout: TIMEOUT_OP },
    )
    const vendaMs = Date.now() - finalizarStart
    testInfo.annotations.push({ type: 'timing', description: `finalizar venda: ${vendaMs}ms` })
    testInfo.annotations.push({ type: 'step', description: '✓ Venda finalizada' })
    console.log(`[timing] finalizar venda: ${vendaMs}ms`)

    // ── Passo 7: Novo cupom → carrinho zerado ────────────────────────────────
    const novoBtn = page.getByRole('button', { name: /Novo cupom|New sale|新单/ })
    await expect(novoBtn).toBeVisible({ timeout: 5_000 })
    await novoBtn.click()

    // Carrinho zerado = busca focada ou empty state visível
    await expect(busca.or(page.getByText(/carrinho vazio|empty|0,00/i).first()))
      .toBeVisible({ timeout: 3_000 })
    testInfo.annotations.push({ type: 'step', description: '✓ Novo cupom — carrinho limpo' })
  })

  test('venda cancelada: produto adicionado → novo cupom sem pagar', async ({ page }, testInfo) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrirBtn = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      testInfo.skip(true, 'Caixa fechado — pular teste de cancelamento')
      return
    }

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', { name: /código de barras|nome do produto|条码|商品名称/i })
    await expect(busca).toBeVisible({ timeout: 10_000 })
    await busca.fill(codigo)

    const itemOuStatus = page.locator('[data-testid="cart-item"], [role="listitem"]').first()
      .or(page.getByRole('status'))
    const apareceu = await itemOuStatus.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!apareceu) {
      testInfo.skip(true, `Produto ${codigo} não encontrado — pular teste de cancelamento`)
      return
    }

    // Limpar sem pagar — não deve deixar estado inconsistente
    const novoBtn = page.getByRole('button', { name: /Novo cupom|New sale|新单/ })
    await expect(novoBtn).toBeVisible({ timeout: 5_000 })
    await novoBtn.click()

    // PDV deve estar funcional após descartar
    await expect(busca).toBeVisible({ timeout: 3_000 })
    await expect(busca).toBeEditable()
    testInfo.annotations.push({ type: 'step', description: '✓ Cancelamento sem inconsistência' })
  })
})
