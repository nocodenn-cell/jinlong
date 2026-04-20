import { test, expect, type Page } from '@playwright/test'
import { hasCaixaOperadorUser, caixaOperadorEmail, caixaOperadorPassword } from './helpers/env'

const LOGIN_PATH = '/login'

/** Enfileira handlers `once` na ordem dos prompts esperados. */
function queuePromptAnswers(page: Page, answers: readonly string[]) {
  for (const answer of answers) {
    page.once('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(answer)
      else await dialog.dismiss()
    })
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Caixa — fluxos críticos (abrir → sangria → fechar)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasCaixaOperadorUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_CAIXA_TEST_EMAIL e PLAYWRIGHT_CAIXA_TEST_PASSWORD (OPERADOR) + Supabase público. Gerente não acessa /caixa.',
      )
      return
    }
    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
    await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
  })

  test('fluxo: abrir caixa → sangria R$50 → limpar cupom → fechar com valor do sistema', async ({
    page,
  }) => {
    await page.goto('/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa/ })
    if (await abrir.isVisible().catch(() => false)) {
      queuePromptAnswers(page, ['120'])
      await abrir.click()
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    await page.getByRole('button', { name: /Sangria \(\-\)/ }).click()
    await expect(page.getByRole('dialog')).toContainText(/Registrar sangria/i, { timeout: 10_000 })
    await page.getByRole('button', { name: /R\$\s*50\.00/ }).click()
    await page.getByRole('button', { name: /^Confirmar$/ }).click()
    await expect(page.getByRole('status')).toContainText(
      /registrada com sucesso|pendente|gerente/i,
      { timeout: 25_000 },
    )

    await page.getByRole('button', { name: /Novo cupom/ }).click()

    const headerText = await page.locator('header').innerText()
    if (!headerText.includes('Saldo estimado')) {
      test.skip(
        true,
        'UI sem linha «Saldo estimado» (ex.: blind closure); fechamento automático não coberto aqui.',
      )
      return
    }
    const m = headerText.match(/Saldo estimado[^\dR]*R\$\s*([\d.,]+)/i)
    const bruto = m?.[1]?.replace(',', '.').trim()
    if (!bruto || Number.isNaN(Number.parseFloat(bruto))) {
      test.skip(true, 'Não foi possível ler o saldo estimado do cabeçalho para o prompt de fechamento.')
      return
    }

    queuePromptAnswers(page, [bruto])
    await page.getByRole('button', { name: /Fechar caixa/ }).click()
    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado\./i, { timeout: 25_000 })
  })
})
