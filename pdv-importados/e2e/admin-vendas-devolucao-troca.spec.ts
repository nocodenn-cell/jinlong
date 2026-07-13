import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

/**
 * Sprint B — Devolução/Troca em /admin/vendas
 *
 * Pré-requisitos:
 * - Migration 248 aplicada no ambiente alvo (homolog local ou staging)
 * - Pelo menos uma venda CONCLUIDA com itens
 * - Credenciais PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD (gerente)
 *
 * CI: falha se secrets ausentes (não skip silencioso).
 */
test.describe('Sprint B: Devolução/Troca em /admin/vendas', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.skip(!hasGerenteTestUser(), 'PLAYWRIGHT_TEST_EMAIL/PASSWORD ausentes (local)')

  test('abre detalhe de venda concluída e exibe ação Devolver / trocar', async ({ page }) => {
    await loginGerente(page, { postLoginUrl: /\/(admin|gerente|caixa)/ })
    await gotoApp(page, '/admin/vendas')

    await expect(page.getByText(/Vendas|vendas/i).first()).toBeVisible({ timeout: 30_000 })

    // Clica na primeira linha da tabela (venda)
    const firstRow = page.locator('table tbody tr, [data-row-key]').first()
    await expect(firstRow).toBeVisible({ timeout: 30_000 })
    await firstRow.click()

    const devolverBtn = page.getByRole('button', { name: /Devolver\s*\/\s*trocar/i })
    await expect(devolverBtn).toBeVisible({ timeout: 15_000 })
  })

  test('fluxo modal: selecionar item, motivo e confirmar devolução', async ({ page }) => {
    await loginGerente(page, { postLoginUrl: /\/(admin|gerente|caixa)/ })
    await gotoApp(page, '/admin/vendas')

    const firstRow = page.locator('table tbody tr, [data-row-key]').first()
    await expect(firstRow).toBeVisible({ timeout: 30_000 })
    await firstRow.click()

    await page.getByRole('button', { name: /Devolver\s*\/\s*trocar/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Devolução parcial|Troca de itens/i)).toBeVisible()

    // Incrementa quantidade do primeiro item disponível (+)
    const plusBtn = dialog.locator('button', { hasText: '+' }).first()
    if (await plusBtn.isEnabled()) {
      await plusBtn.click()
    }

    await dialog.getByLabel(/Motivo/i).fill('E2E homolog: devolução parcial smoke')
    await dialog.getByRole('button', { name: /Confirmar devolução/i }).click()

    // Sucesso: modal fecha ou toast de sucesso
    await expect(dialog).toBeHidden({ timeout: 30_000 })
  })
})
