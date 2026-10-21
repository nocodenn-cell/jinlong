/**
 * Demo Import Intelligence (P0): fluxo completo em ambiente LOCAL isolado, dados FICTÍCIOS.
 * Seed: backend/scripts/import-intelligence-e2e-seed.sql (empresas A/B com módulo, C sem).
 * Fluxo: criar → XML NF-e (100 un.) → tributos sugeridos por NCM → despesa com critério sugerido →
 * conferir → simular (estimado) → calcular → composição com link ao documento → aprovar
 * (custo aprovado, sem efeito no ERP) → precificação varejo/atacado por faixas → zh.
 * Isolamento: B não vê A, C sem módulo, OPERADOR negado. Screenshots: IMP_SHOTS (padrão /workspace/importacoes-shots).
 */
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'

const SUPA = process.env.E2E_SUPABASE_URL ?? ''
const SERVICE = process.env.E2E_SERVICE_ROLE_KEY ?? ''
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPA)
const SENHA = 'Demo-Importacoes-2026!' // fictícia (seed local)
const SHOTS = process.env.IMP_SHOTS ?? '/workspace/importacoes-shots'
const XML = path.join(__dirname, '..', 'lib/import/xml/fixtures/nfe-importacao-ficticia.xml')
const REF = `DEMO-${Date.now().toString(36).toUpperCase()}`
const LENTO = { timeout: 60_000 }

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.skip(!LOCAL || !SERVICE, 'demo exige Supabase LOCAL e E2E_SERVICE_ROLE_KEY')

async function entrar(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 120_000, waitUntil: 'commit' })
  return page
}
const foto = (p: Page, n: string) => p.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true })

async function servico(q: string): Promise<unknown> {
  const r = await fetch(`${SUPA.replace(/\/$/, '')}/rest/v1/${q}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  if (!r.ok) throw new Error(`${q}: ${r.status}`)
  return r.json()
}
async function fotoErp() {
  const estoque = await servico('estoque?select=produto_id,loja_id,quantidade_atual&order=produto_id')
  const produtos = await servico('produtos?select=id,preco_varejo,preco_custo,preco_custo_medio&order=id')
  const ap = ((await servico('contas_pagar?select=id')) as unknown[]).length
  return JSON.stringify({ estoque, produtos, ap })
}
async function conferirTodos(page: Page, tipo: 'despesa' | 'tributo') {
  const pend = page.getByTestId(`imp-conferir-${tipo}`).filter({ hasText: /^Conferir$/ })
  for (let n = await pend.count(); n > 0; n--) {
    await pend.first().click()
    await expect(pend).toHaveCount(n - 1, LENTO)
  }
}

let opUrl = ''
let erpAntes = ''
const passos: string[] = []

test('fluxo pt: 100 unidades → custo unitário revisado e aprovado', async ({ browser }) => {
  erpAntes = await fotoErp()
  const page = await entrar(browser, 'dono.a@demo.test')
  await page.goto('/admin/importacoes')
  await expect(page.getByTestId('importacoes-hub')).toBeVisible(LENTO)
  await foto(page, '01-hub')
  await page.getByTestId('imp-nova').click()
  const form = page.getByTestId('imp-nova-form')
  await form.getByTestId('imp-ref').fill(REF)
  await form.getByLabel('Data da invoice').fill('2026-10-01')
  await form.getByTestId('imp-criar').click(); passos.push('criar (2 campos)')
  await page.waitForURL(/\/admin\/importacoes\/[0-9a-f-]{36}/, LENTO)
  opUrl = page.url().split('?')[0]
  await expect(page.getByTestId('imp-estado-custo')).toHaveText('Custo provisório')

  // XML NF-e de importação → itens
  await page.goto(`${opUrl}?aba=documentos`)
  await page.getByTestId('imp-xml-arquivo').setInputFiles(XML); passos.push('escolher XML')
  await expect(page.getByTestId('imp-xml-proposta')).toContainText('Chaleira', LENTO)
  await expect(page.getByTestId('imp-ia-desligada')).toBeVisible()
  await foto(page, '02-xml-proposta')
  // tributos virão do catálogo por NCM (próxima aba); os do XML ficam de fora para não duplicar
  await page.getByLabel(/Incluir tributos do XML/).uncheck(); passos.push('desmarcar tributos do XML')
  await page.getByTestId('imp-xml-aplicar').click(); passos.push('aplicar XML')
  await expect(page.getByTestId('imp-xml-proposta')).toHaveCount(0, LENTO)
  await expect(page.getByTestId('imp-dossie-checklist')).toBeVisible()
  await foto(page, '03-dossie')

  // tributos sugeridos por NCM (parâmetros fictícios versionados)
  await page.goto(`${opUrl}?aba=tributos`)
  await expect(page.getByTestId('imp-trib-ficticio')).toBeVisible(LENTO)
  await page.getByTestId('imp-trib-uf').fill('SP'); passos.push('UF')
  await expect(page.getByTestId('imp-trib-sugestoes')).toContainText('85161000', LENTO)
  await foto(page, '04-tributos-sugeridos')
  await page.getByTestId('imp-trib-registrar').click(); passos.push('registrar tributos')
  await expect(page.getByText('Tributos registrados').first()).toBeVisible(LENTO).catch(() => undefined)

  // despesa com critério sugerido
  await page.goto(`${opUrl}?aba=lancamentos`)
  await page.getByTestId('imp-desp-adicionar').click()
  const fd = page.getByTestId('imp-form-despesa')
  await fd.getByTestId('imp-desp-tipo').fill('Honorários do despachante'); passos.push('tipo despesa')
  await fd.getByTestId('imp-desp-valor').fill('500'); passos.push('valor despesa')
  await expect(page.getByTestId('imp-desp-sugestao')).toBeVisible(LENTO)
  await page.getByTestId('imp-desp-usar-sugestao').click(); passos.push('usar critério sugerido')
  await fd.getByTestId('imp-desp-justificativa').fill('Nota do despachante fictícia'); passos.push('justificativa')
  await fd.getByTestId('imp-lanc-salvar').click(); passos.push('salvar despesa')
  await expect(page.getByTestId('imp-desp-rateio').getByText('Honorários do despachante')).toBeVisible(LENTO)
  await conferirTodos(page, 'despesa')
  await conferirTodos(page, 'tributo'); passos.push('conferir lançamentos')
  await foto(page, '05-lancamentos-conferidos')

  // estimado (simulação) e real (cálculo)
  await page.goto(`${opUrl}?aba=apuracao`)
  await page.getByTestId('imp-simular').click(); passos.push('simular')
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Simulação', LENTO)
  await page.getByTestId('imp-calcular').click(); passos.push('calcular')
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Cálculo válido', LENTO)
  await expect(page.getByTestId('imp-conservacao')).toContainText('conferem')
  for (const u of await page.getByTestId('imp-custo-unitario').allInnerTexts()) expect(u).toMatch(/^\d{1,3}(\.\d{3})*,\d{6}$/)
  await expect(page.getByTestId('imp-comp-doc-link').first()).toBeVisible()
  await foto(page, '06-apuracao-composicao')
  await page.getByTestId('imp-comp-doc-link').first().click()
  await expect(page).toHaveURL(/aba=documentos#doc-/, LENTO)

  // aprovação formal (só registra custo aprovado)
  await page.goto(`${opUrl}?aba=versoes`)
  await page.getByTestId('imp-aprovar-motivo').fill('Conferido com NF-e e nota do despachante fictícias'); passos.push('motivo')
  await page.getByTestId('imp-aprovar').click(); passos.push('aprovar')
  await expect(page.getByTestId('imp-aprovada')).toBeVisible(LENTO)
  await expect(page.getByTestId('imp-estado-custo')).toHaveText('Custo aprovado', LENTO)
  await foto(page, '07-aprovado')

  // precificação estimado × real, atacado por faixas, repreço
  await page.goto(`${opUrl}?aba=precificacao`)
  await expect(page.getByTestId('imp-prec-faixas')).toContainText('R$', LENTO)
  await expect(page.getByTestId('imp-prec-repreco').first()).toBeVisible()
  await foto(page, '08-precificacao')
  console.log(`PASSOS ${passos.length}: ${passos.join(' | ')}`)
  await page.context().close()
})

test('zh: mesma operação em chinês', async ({ browser }) => {
  const page = await entrar(browser, 'dono.a@demo.test')
  await page.goto('/admin/importacoes')
  await page.getByRole('button', { name: '普通话', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '进口管理' })).toBeVisible(LENTO)
  await page.goto(`${opUrl}?aba=precificacao`)
  await expect(page.getByTestId('imp-estado-custo')).toHaveText('已审批成本', LENTO)
  await expect(page.getByText('按数量分级的批发价')).toBeVisible()
  await foto(page, '09-precificacao-zh')
  await page.goto(`${opUrl}?aba=apuracao`)
  await foto(page, '10-apuracao-zh')
  await page.getByRole('button', { name: 'PT', exact: true }).first().click()
  await page.context().close()
})

test('isolamento: B não vê A; C sem módulo; OPERADOR negado', async ({ browser }) => {
  const nf = async (p: Page) => {
    await expect(p.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible(LENTO)
    await expect(p.getByText(REF)).toHaveCount(0)
  }
  const b = await entrar(browser, 'dono.b@demo.test')
  await b.goto('/admin/importacoes')
  await expect(b.getByTestId('importacoes-hub')).toBeVisible(LENTO)
  await expect(b.getByText(REF)).toHaveCount(0)
  await b.goto(opUrl); await nf(b)
  await b.context().close()
  const c = await entrar(browser, 'dono.c@demo.test')
  await c.goto('/admin/importacoes'); await nf(c)
  await c.context().close()
  const op = await entrar(browser, 'operador.a@demo.test')
  await op.goto('/admin/importacoes')
  if (op.url().includes('/admin/importacoes')) await nf(op)
  await expect(op.getByTestId('importacoes-hub')).toHaveCount(0)
  await op.context().close()
})

test('ERP intacto: estoque, preços e contas a pagar', async () => {
  expect(await fotoErp()).toBe(erpAntes)
})
