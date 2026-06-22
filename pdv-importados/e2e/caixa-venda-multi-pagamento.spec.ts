import { test, expect, type Page } from '@playwright/test'
import { hasCaixaOperadorUser, e2eProdutoCodigoBarras } from './helpers/env'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './helpers/caixaModais'
import { loginCaixaOperador } from './helpers/login'
import { gotoApp } from './helpers/url'
test.describe.configure({ mode: 'serial' })

test.describe.skip('Caixa — venda com split DINHEIRO + PIX (UI de parcelas removida do footer)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
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
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '300')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称/i,
    })
    await busca.fill(codigo)
    await busca.press('Enter')

    const status = page.getByTestId('caixa-status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const statusTxt = (await status.innerText()).toLowerCase()
    if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
      test.skip(
        true,
        `Produto «${codigo}» não encontrado (seed 027 ou PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
      )
      return
    }
    await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })

    const footer = page.locator('footer')
    await expect(footer.getByText(/Pagamento|付款/i)).toBeVisible()

    await footer.getByRole('button', { name: /^\+$/ }).click()

    const selects = footer.locator('select')
    const inputs = footer.locator('input[type="number"]')
    await expect(selects).toHaveCount(2, { timeout: 10_000 })
    await expect(inputs).toHaveCount(2)

    await selects.nth(0).selectOption({ value: 'DINHEIRO' })
    await selects.nth(1).selectOption({ value: 'PIX' })

    const total = await readTotalLiquidoFooter(page)
    const parte1 = round2(Math.max(0.01, total * 0.4))
    const parte2 = round2(total - parte1)
    await inputs.nth(0).fill(String(parte1))
    await inputs.nth(1).fill(String(parte2))

    await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
  })

  test('nao vaza parcelas para proximo cupom apos finalizar e novo cupom', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '300')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称/i,
    })
    await busca.fill(codigo)
    await busca.press('Enter')

    const status = page.getByTestId('caixa-status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const statusTxt = (await status.innerText()).toLowerCase()
    if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
      test.skip(
        true,
        `Produto «${codigo}» não encontrado (seed 027 ou PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
      )
      return
    }
    await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })

    const footer = page.locator('footer')
    await expect(footer.getByText(/Pagamento|付款/i)).toBeVisible()

    await footer.getByRole('button', { name: /^\+$/ }).click()
    const selects = footer.locator('select')
    const inputs = footer.locator('input[type="number"]')
    await expect(selects).toHaveCount(2, { timeout: 10_000 })
    await expect(inputs).toHaveCount(2)

    await selects.nth(0).selectOption({ value: 'DINHEIRO' })
    await selects.nth(1).selectOption({ value: 'PIX' })

    const total = await readTotalLiquidoFooter(page)
    const parte1 = round2(Math.max(0.01, total * 0.6))
    const parte2 = round2(total - parte1)
    await inputs.nth(0).fill(String(parte1))
    await inputs.nth(1).fill(String(parte2))

    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()
    await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })

    // Após venda OK, deve resetar para parcela única (sem herdar split anterior).
    await expect(selects).toHaveCount(1, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(selects.nth(0)).toHaveValue('DINHEIRO')

    // Recria split e valida reset também ao acionar "Novo cupom".
    await busca.fill(codigo)
    await busca.press('Enter')
    await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })
    await footer.getByRole('button', { name: /^\+$/ }).click()
    await expect(selects).toHaveCount(2, { timeout: 10_000 })

    await page.getByRole('button', { name: /Novo cupom|新单|新單/i }).click()
    await expect(selects).toHaveCount(1, { timeout: 10_000 })
    await expect(inputs).toHaveCount(1)
    await expect(selects.nth(0)).toHaveValue('DINHEIRO')
  })

  test('tres parcelas (DINHEIRO + PIX + CARTAO_DEBITO) somam ao total e finaliza', async ({ page }) => {
    await gotoApp(page, '/caixa')
    await expect(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/)).toBeVisible({ timeout: 15_000 })

    const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '300')
      await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
    }

    const codigo = e2eProdutoCodigoBarras()
    const busca = page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称/i,
    })
    await busca.fill(codigo)
    await busca.press('Enter')

    const status = page.getByTestId('caixa-status')
    await expect(status).toBeVisible({ timeout: 20_000 })
    const statusTxt = (await status.innerText()).toLowerCase()
    if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
      test.skip(
        true,
        `Produto «${codigo}» não encontrado (seed 027 ou PLAYWRIGHT_E2E_PRODUTO_CODIGO).`,
      )
      return
    }
    await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })

    const footer = page.locator('footer')
    await expect(footer.getByText(/Pagamento|付款/i)).toBeVisible()

    await footer.getByRole('button', { name: /^\+$/ }).click()
    await footer.getByRole('button', { name: /^\+$/ }).click()

    const selects = footer.locator('select')
    const inputs = footer.locator('input[type="number"]')
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

    await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
  })

})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Lê o total líquido bruto pelo atributo estável de teste. */
async function readTotalLiquidoFooter(page: Page): Promise<number> {
  const el = page.getByTestId('caixa-total-liquido')
  await expect(el).toBeVisible({ timeout: 10_000 })
  const raw = (await el.getAttribute('data-total-liquido'))?.trim()
  if (!raw) throw new Error('Atributo data-total-liquido ausente no footer')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`Total bruto inválido: «${raw}»`)
  return parsed
}
