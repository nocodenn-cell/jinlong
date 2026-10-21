import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { loginWithRetry } from './helpers/login'
import { gotoApp } from './helpers/url'

/**
 * Módulo Comissão — fluxo principal (P0→P2) contra o harness LOCAL (Postgres + PostgREST + gateway de auth fictício),
 * com a seed fictícia de backend/supabase/tests/comissao (empresa "Comissão Teste A"). Nunca rodar contra produção.
 * Ative com COMISSAO_E2E=1; senha da seed: COMISSAO_E2E_SENHA.
 */
const ATIVO = process.env.COMISSAO_E2E === '1'
const SENHA = process.env.COMISSAO_E2E_SENHA ?? ''
const SHOTS = process.env.COMISSAO_E2E_SHOTS

test.describe.configure({ mode: 'serial' })
test.skip(!ATIVO, 'Defina COMISSAO_E2E=1 (harness local com a seed do módulo de comissão).')

async function entrar(page: Page, email: string, destino: RegExp) {
  await loginWithRetry(page, email, SENHA, destino, 90_000)
}
async function foto(page: Page, nome: string) {
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${nome}.png`, fullPage: true }) }
}

test('caixa: venda com vendedora escolhida no seletor "Vendedor / 销售员"', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page, 'caixa@demo.test', /\/caixa(\/|$|\?)/)
  await gotoApp(page, '/caixa')
  const sel = page.getByTestId('caixa-vendedor-select')
  await expect(sel).toBeVisible({ timeout: 30_000 })
  await sel.selectOption({ label: 'Ana Souza' })
  const busca = page.getByRole('textbox', { name: /código de barras|nome do produto|条码|商品名称/i })
  await busca.fill('7899999992002')
  await busca.press('Enter')
  await expect(page.getByRole('status')).toContainText(/adicionad|added|已添加|加入/i, { timeout: 20_000 })
  await foto(page, '01-caixa-vendedor')
  await page.getByRole('button', { name: /Finalizar venda|完成销售/i }).click()
  await expect(page.getByTestId('caixa-msg-venda-ok')).toBeVisible({ timeout: 35_000 })
})

test('gerente: regra por cargo com prévia, relatório CSV, metas, fechamento e export contábil', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page, 'gerente@demo.test', /\/admin\/dashboard(\/|$|\?)/)

  await gotoApp(page, '/admin/comissoes/regras')
  await page.getByTestId('regra-quem').selectOption('cargo')
  await page.getByTestId('regra-cargo').fill('vendedor interno')
  await page.getByTestId('regra-valor').fill('6')
  await page.getByTestId('regra-salvar').click()
  await expect(page.getByTestId('regras-tabela')).toContainText('vendedor interno', { timeout: 15_000 })
  await page.getByTestId('previa-vendedor').selectOption({ label: 'Bruno Lima' })
  await page.getByTestId('previa-produto').selectOption({ label: 'Capa de Celular' })
  await page.getByTestId('previa-calcular').click()
  await expect(page.getByTestId('previa-resultado')).toContainText('6%')
  await foto(page, '02-regras-previa')

  await gotoApp(page, '/admin/comissoes/relatorio')
  const tabela = page.getByTestId('comissao-tabela-vendedores')
  await expect(tabela).toContainText('Ana Souza')
  await expect(tabela).toContainText('Bruno Lima')
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rel-csv').click()])
  const conteudo = fs.readFileSync((await csv.path())!, 'utf8')
  expect(conteudo).toContain('Ana Souza')
  await foto(page, '03-relatorio')

  await gotoApp(page, '/admin/comissoes/metas')
  await expect(page.getByTestId('metas-tabela')).toContainText('Ana Souza')
  await foto(page, '04-metas-divisoes')

  await gotoApp(page, '/admin/comissoes/fechamento')
  page.on('dialog', (d) => void d.accept())
  await page.getByTestId('fech-em_revisao').click()
  await expect(page.getByTestId('comissao-status-periodo')).toContainText(/revisão|审核/i, { timeout: 15_000 })
  await page.getByTestId('fech-aprovado').click()
  await expect(page.getByTestId('comissao-status-periodo')).toContainText(/Aprovado|已批准/i, { timeout: 15_000 })
  const [exp] = await Promise.all([page.waitForEvent('download'), page.getByTestId('fech-export-contabil').click()])
  expect(fs.readFileSync((await exp.path())!, 'utf8')).toContain('total_a_pagar')
  await foto(page, '05-fechamento-aprovado')
})

test('vendedora: autoatendimento mostra só os próprios números', async ({ page }) => {
  test.setTimeout(90_000)
  await entrar(page, 'ana@demo.test', /\/caixa(\/|$|\?)/)
  await gotoApp(page, '/caixa/minhas-comissoes')
  const t = page.getByTestId('minhas-comissoes')
  await expect(t).toBeVisible({ timeout: 30_000 })
  await expect(t).toContainText(/Aprovado|已批准/)
  await expect(page.locator('body')).not.toContainText('Bruno Lima')
  await foto(page, '06-minhas-comissoes')
})
