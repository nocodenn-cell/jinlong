import { expect, type Page } from '@playwright/test'
import { ensureCaixaAberto } from './ensureCaixaAberto'

export async function abrirCaixaSeNecessario(page: Page): Promise<void> {
  await ensureCaixaAberto(page, '300')
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
  const tab = page.getByRole('tab', { name: /Pgto|付款|收銀/i })
  if (await tab.isVisible().catch(() => false)) {
    await tab.click()
  }
  await expect(painelPgto(page)).toBeVisible({ timeout: 10_000 })
}

export function painelPgto(page: Page) {
  const byId = page.locator('#caixa-pdv-panel-pgto')
  // Layout clássico: painel sempre visível como region (sem tab).
  return byId.or(page.getByRole('region', { name: /Pagamento|Parcelas do cupom|付款/i }))
}

export async function adicionarParcela(page: Page): Promise<void> {
  const btn = painelPgto(page).getByRole('button', {
    name: /Adicionar forma|Adicionar parcela|添加付款方式|新增付款方式/i,
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
  await dismissReciboSeAberto(page)
}

/**
 * Fecha o modal de recibo pós-venda para não interceptar cliques seguintes.
 * Race: `caixa-msg-venda-ok` e o dialog abrem no mesmo commit React; um
 * `isVisible()` imediato pode retornar false e deixar o overlay aberto.
 */
export async function dismissReciboSeAberto(page: Page): Promise<void> {
  const recibo = page.getByRole('dialog', { name: /Recibo da venda|收据|收據/i })
  const apareceu = await recibo
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!apareceu) return

  const novaVenda = recibo.getByTestId('caixa-recibo-nova-venda').or(
    recibo.getByRole('button', {
      name: /Adicionar nova venda|添加新销售|Nova venda|新单|新單/i,
    }),
  )
  const fechar = recibo.getByTestId('caixa-recibo-fechar').or(
    recibo.getByRole('button', { name: /Fechar recibo|Fechar|关闭|關閉/i }),
  )
  if (await novaVenda.first().isVisible().catch(() => false)) {
    await novaVenda.first().click()
  } else if (await fechar.first().isVisible().catch(() => false)) {
    await fechar.first().click()
  } else {
    await page.keyboard.press('Escape')
  }
  await expect(recibo).toBeHidden({ timeout: 10_000 })
}
