import { expect, type Page } from '@playwright/test'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './caixaModais'

export async function abrirCaixaSeNecessario(page: Page): Promise<void> {
  const abrir = page.getByRole('button', { name: /Abrir caixa|开启收银台/ })
  if (await abrir.isVisible().catch(() => false)) {
    await abrir.click()
    await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, '300')
    await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, { timeout: 25_000 })
  }
}

export async function adicionarProdutoDemo(page: Page, codigo: string): Promise<void> {
  const busca = page.getByRole('textbox', {
    name: /código de barras|nome do produto|条码|商品名称/i,
  })
  await busca.fill(codigo)
  await busca.press('Enter')

  const status = page.getByTestId('caixa-status')
  await expect(status).toBeVisible({ timeout: 20_000 })
  const statusTxt = (await status.innerText()).toLowerCase()
  if (statusTxt.includes('não encontrad') || statusTxt.includes('not found') || statusTxt.includes('找不到')) {
    throw new Error(`Produto «${codigo}» não encontrado (seed 027 ou PLAYWRIGHT_E2E_PRODUTO_CODIGO).`)
  }
  await expect(status).toContainText(/adicionad|added|已添加|加入/i, { timeout: 15_000 })
}

export async function irParaAbaPgto(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /Pgto|付款|收銀/i }).click()
  await expect(page.locator('#caixa-pdv-panel-pgto')).toBeVisible({ timeout: 10_000 })
}

function painelPgto(page: Page) {
  return page.locator('#caixa-pdv-panel-pgto')
}

export async function adicionarParcela(page: Page): Promise<void> {
  const btn = painelPgto(page).getByRole('button', {
    name: /Adicionar forma|添加付款方式|新增付款方式/i,
  })
  await btn.click()
}

export function parcelasNoPainel(page: Page) {
  const panel = painelPgto(page)
  return {
    selects: panel.locator('select'),
    inputs: panel.locator('input[type="number"]'),
  }
}

export async function readTotalLiquidoFooter(page: Page): Promise<number> {
  const el = page.getByTestId('caixa-total-liquido')
  await expect(el).toBeVisible({ timeout: 10_000 })
  const raw = (await el.getAttribute('data-total-liquido'))?.trim()
  if (!raw) throw new Error('Atributo data-total-liquido ausente no footer')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`Total bruto inválido: «${raw}»`)
  return parsed
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function finalizarVenda(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()
  await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
}
