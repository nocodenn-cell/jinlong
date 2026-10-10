/**
 * F5 — Hub de Importações (Import Intelligence): E2E com Supabase LOCAL e backend real.
 *
 * Pré-requisitos (somente local):
 *   1. `supabase start` + migrations F1–F5 aplicadas;
 *   2. `node backend/scripts/f5-homologacao-local.mjs` (identidades e empresas FICTÍCIAS);
 *   3. app em PLAYWRIGHT_BASE_URL (ex.: http://localhost:3100) apontando para o Supabase local;
 *   4. env E2E_SUPABASE_URL + E2E_SERVICE_ROLE_KEY (somente para conferir que o ERP não mudou).
 * Sem E2E_SUPABASE_URL local, a suíte é pulada. Nunca roda contra host remoto.
 *
 * Cenários (pedido F5): 1 acesso com módulo · 2 menu oculto sem módulo · 3 rota direta negada ·
 * 4 sem permissão (OPERADOR) · 5 A não vê C · 6 criar · 7 produtos · 8 despesas/tributos ·
 * 9 calcular · 10 reabrir persistido · 11 segunda versão · 12 bloqueado não aprova ·
 * 13 aprovar válido · 14 memória · 15 sem efeito no ERP · 16 pt/zh.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

const SUPA = process.env.E2E_SUPABASE_URL ?? ''
const SERVICE = process.env.E2E_SERVICE_ROLE_KEY ?? ''
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPA)
const SENHA = 'Homolog-Importacoes-2026!' // fictícia, definida em backend/scripts/f5-homologacao-local.mjs

const USR = {
  dono: 'dono.importadora@homolog.test',
  gerente: 'gerente.importadora@homolog.test',
  operador: 'operador.importadora@homolog.test',
  semModulo: 'dono.semmodulo@homolog.test',
  concorrente: 'dono.concorrente@homolog.test',
}
const REF = `E2E-IMP-${Date.now().toString(36).toUpperCase()}`
const LENTO = { timeout: 90_000 }

test.describe.configure({ mode: 'serial', timeout: 900_000 })
test.skip(!LOCAL || !SERVICE, 'E2E do hub exige Supabase LOCAL (E2E_SUPABASE_URL) e E2E_SERVICE_ROLE_KEY')

async function entrar(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // sai de /login (OPERADOR vai ao caixa; no modo dev a 1ª compilação do /caixa é lenta)
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240_000, waitUntil: 'commit' })
  return page
}

async function servico(path: string): Promise<unknown> {
  const r = await fetch(`${SUPA.replace(/\/$/, '')}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

async function fotoErp() {
  const estoque = (await servico('estoque?select=quantidade_atual')) as { quantidade_atual: number }[]
  const precos = (await servico('produtos?select=id,preco_varejo,preco_custo,preco_custo_medio&order=id')) as unknown[]
  const ap = (await servico('contas_pagar?select=id')) as unknown[]
  const kardex = (await servico('movimentos_estoque_log?select=id')) as unknown[]
  return { estoque: estoque.reduce((a, e) => a + Number(e.quantidade_atual), 0), precos: JSON.stringify(precos), ap: ap.length, kardex: kardex.length }
}

/**
 * Acesso negado no servidor: notFound() — a página "não encontrada" é renderizada e nenhum dado
 * do hub/operação aparece. Observação: o status HTTP é 200 porque /admin tem loading.tsx (streaming
 * começa antes do notFound); por isso a prova é o CONTEÚDO, não o código HTTP.
 */
async function negado(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible(LENTO)
  await expect(page.getByTestId('importacoes-hub')).toHaveCount(0)
  await expect(page.getByTestId('importacao-detalhe')).toHaveCount(0)
  await expect(page.getByText(REF)).toHaveCount(0)
}

let opUrl = ''
let erpAntes: Awaited<ReturnType<typeof fotoErp>>

test('1 + 6: DONO licenciado vê o menu, abre o hub e cria uma importação', async ({ browser }) => {
  erpAntes = await fotoErp()
  const page = await entrar(browser, USR.dono)
  await expect(page.locator('[data-nav-group="modulos"]').getByRole('link', { name: /Importações/ })).toBeVisible(LENTO)
  await page.goto('/admin/importacoes')
  await expect(page.getByTestId('importacoes-hub')).toBeVisible(LENTO)
  await page.getByTestId('imp-nova').click()
  const form = page.getByTestId('imp-nova-form')
  await form.getByTestId('imp-ref').fill(REF)
  await form.getByLabel('Data da invoice').fill('2026-09-18')
  await form.getByTestId('imp-criar').click()
  await page.waitForURL(/\/admin\/importacoes\/[0-9a-f-]{36}\?aba=mercadorias/, LENTO)
  opUrl = page.url().split('?')[0]
  await expect(page.getByRole('heading', { name: REF })).toBeVisible()
  await page.context().close()
})

test('7 + 8: mercadorias (código com zeros), câmbio, despesa rateada e tributo, conferidos', async ({ browser }) => {
  const page = await entrar(browser, USR.dono)
  await page.goto(`${opUrl}?aba=mercadorias`)
  const item = async (d: Record<string, string>) => {
    await page.getByTestId('imp-item-adicionar').click()
    const f = page.getByTestId('imp-item-form')
    await f.getByTestId('imp-item-descricao').fill(d.descricao)
    await f.getByTestId('imp-item-codigo-input').fill(d.codigo)
    await f.getByTestId('imp-item-valor').fill(d.valor)
    await f.getByTestId('imp-item-qtd').fill(d.qtd)
    await f.getByTestId('imp-item-fator').fill(d.fator)
    await f.getByTestId('imp-item-qtd-estoque').fill(d.estoque)
    await f.getByTestId('imp-item-peso-bruto').fill(d.peso)
    await f.getByTestId('imp-item-salvar').click()
    await expect(page.getByTestId('imp-itens').getByText(d.descricao)).toBeVisible(LENTO)
  }
  await item({ descricao: 'Parafuso M6 inox', codigo: '000123', valor: '1.000,00', qtd: '100', fator: '50', estoque: '5000', peso: '210' })
  await item({ descricao: 'Arruela lisa', codigo: '0045-B', valor: '500', qtd: '10', fator: '100', estoque: '1000', peso: '90' })
  await expect(page.getByTestId('imp-itens').getByText('000123', { exact: true })).toBeVisible()

  await page.goto(opUrl)
  await page.getByTestId('imp-cambio-taxa').fill('5,4321098765')
  await page.getByLabel('Data do câmbio').fill('2026-10-01')
  await page.getByTestId('imp-cambio-salvar').click()
  await expect(page.getByTestId('imp-cambios').getByText('5,4321098765')).toBeVisible(LENTO)

  await page.goto(`${opUrl}?aba=lancamentos`)
  await page.getByTestId('imp-desp-adicionar').click()
  const fd = page.getByTestId('imp-form-despesa')
  await fd.getByTestId('imp-desp-tipo').fill('Frete internacional')
  await fd.getByTestId('imp-desp-valor').fill('300')
  await fd.getByTestId('imp-desp-criterio').selectOption('PESO_BRUTO')
  await fd.getByTestId('imp-desp-justificativa').fill('BL fictício, rateio pelo peso bruto')
  await fd.getByTestId('imp-lanc-salvar').click()
  await expect(page.getByTestId('imp-desp-rateio').getByText('Frete internacional', { exact: true })).toBeVisible(LENTO)

  await page.getByTestId('imp-trib-adicionar').click()
  const ft = page.getByTestId('imp-form-tributo')
  await ft.getByTestId('imp-trib-codigo').fill('II')
  await ft.getByTestId('imp-trib-status').selectOption('NAO_RECUPERAVEL')
  await ft.getByTestId('imp-trib-valor').fill('972,00')
  await ft.getByTestId('imp-trib-item').selectOption({ label: 'Parafuso M6 inox' })
  await ft.getByTestId('imp-trib-regra').fill('II-NCM-7318')
  await ft.getByTestId('imp-trib-incorpora').selectOption('true')
  await ft.getByTestId('imp-trib-vig').fill('2026-01-01')
  await ft.getByTestId('imp-trib-fato').fill('2026-10-01')
  await ft.getByTestId('imp-lanc-salvar').click()
  await expect(page.getByTestId('imp-trib-nao-rec').getByText('II', { exact: true })).toBeVisible(LENTO)

  await page.getByTestId('imp-conferir-despesa').click()
  await expect(page.getByTestId('imp-desp-rateio').getByText('Conferido', { exact: true })).toBeVisible(LENTO)
  await page.getByTestId('imp-conferir-tributo').click()
  await expect(page.getByTestId('imp-trib-nao-rec').getByText('Conferido', { exact: true })).toBeVisible(LENTO)
  await page.context().close()
})

test('9 + 10 + 14: simular, calcular com o motor, reabrir a página e ver a memória de cálculo', async ({ browser }) => {
  const page = await entrar(browser, USR.dono)
  await page.goto(`${opUrl}?aba=apuracao`)
  await page.getByTestId('imp-simular').click()
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Simulação', LENTO)
  await page.getByTestId('imp-calcular').click()
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Versão 2', LENTO)
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Cálculo válido')
  await expect(page.getByTestId('imp-conservacao')).toContainText('conferem')
  const unit = page.getByTestId('imp-custo-unitario')
  await expect(unit).toHaveCount(2)
  for (const t of await unit.allInnerTexts()) expect(t).toMatch(/^\d{1,3}(\.\d{3})*,\d{6}$/)

  // reabrir: nova navegação, dados vêm do banco
  await page.goto('/admin/importacoes')
  await page.getByRole('link', { name: REF }).click()
  await page.getByTestId('imp-aba-apuracao').click()
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Versão 2', LENTO)
  await expect(page.getByTestId('imp-memoria').locator('details')).toHaveCount(2)
  await expect(page.getByTestId('imp-memoria').locator('li').first()).toBeVisible()
  await expect(page.getByTestId('imp-rateios')).toContainText('Peso bruto')
  await page.context().close()
})

test('11 + 12: despesa com decisão pendente gera versão bloqueada que não pode ser aprovada', async ({ browser }) => {
  const page = await entrar(browser, USR.dono)
  await page.goto(`${opUrl}?aba=lancamentos`)
  await page.getByTestId('imp-desp-adicionar').click()
  const fd = page.getByTestId('imp-form-despesa')
  await fd.getByTestId('imp-desp-tipo').fill('Armazenagem a decidir')
  await fd.getByTestId('imp-desp-valor').fill('150')
  await fd.getByLabel('Entra no custo?').selectOption('DECISAO_03')
  await fd.getByTestId('imp-desp-justificativa').fill('Aguardando decisão de incorporação')
  await fd.getByTestId('imp-lanc-salvar').click()
  await expect(page.getByTestId('imp-desp-rateio').getByText('Armazenagem a decidir', { exact: true })).toBeVisible(LENTO)

  await page.goto(`${opUrl}?aba=apuracao`)
  await page.getByTestId('imp-calcular').click()
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Versão 3', LENTO)
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Cálculo bloqueado')
  await expect(page.getByTestId('imp-divergencias')).toContainText('Bloqueante')

  await page.getByTestId('imp-aba-versoes').click()
  const atual = page.getByTestId('imp-versoes').getByRole('row').filter({ has: page.getByRole('cell', { name: 'v3', exact: true }) })
  await atual.getByRole('link', { name: 'Abrir' }).click()
  await page.getByTestId('imp-aba-versoes').click()
  await expect(page.getByTestId('imp-inelegivel')).toContainText('cálculo bloqueado', LENTO)
  await expect(page.getByTestId('imp-aprovar')).toHaveCount(0)
  await page.context().close()
})

test('4: GERENTE opera mas não aprova; OPERADOR não acessa o hub', async ({ browser }) => {
  const ger = await entrar(browser, USR.gerente)
  await ger.goto(`${opUrl}?aba=versoes`)
  await expect(ger.getByText('Somente o DONO pode aprovar ou reabrir.')).toBeVisible(LENTO)
  await expect(ger.getByTestId('imp-aprovar')).toHaveCount(0)
  await ger.context().close()

  const op = await entrar(browser, USR.operador)
  const r = await op.goto('/admin/importacoes')
  // negado = redirecionado para fora do admin (caixa) OU 404 na rota
  // OPERADOR: a policy de perfil já o tira do admin (redireciona) ou o gate responde "não encontrada"
  if (op.url().includes('/admin/importacoes')) await negado(op)
  await expect(op.getByTestId('importacoes-hub')).toHaveCount(0)
  expect(r).toBeTruthy()
  await op.context().close()
})

test('13: corrigir, recalcular (nova versão), comparar e aprovar pelo servidor', async ({ browser }) => {
  const page = await entrar(browser, USR.dono)
  await page.goto(`${opUrl}?aba=lancamentos`)
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('imp-desp-rateio').getByRole('row', { name: /Armazenagem a decidir/ }).getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByTestId('imp-desp-rateio').getByText('Armazenagem a decidir', { exact: true })).toHaveCount(0, LENTO)

  await page.goto(`${opUrl}?aba=apuracao`)
  await page.getByTestId('imp-calcular').click()
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Versão 4', LENTO)
  await expect(page.getByTestId('imp-apuracao-cabecalho')).toContainText('Cálculo válido')

  await page.getByTestId('imp-aba-versoes').click()
  await page.getByTestId('imp-comparar').filter({ hasText: 'v2' }).first().click()
  await expect(page.getByTestId('imp-comparacao')).toBeVisible(LENTO)

  await page.getByTestId('imp-aprovar-motivo').fill('Custos conferidos com invoice, BL e DI fictícios')
  await page.getByTestId('imp-aprovar').click()
  await expect(page.getByTestId('imp-aprovada')).toContainText('v4', LENTO)
  await expect(page.getByTestId('imp-somente-leitura')).toBeVisible()
  await expect(page.getByTestId('imp-decisoes')).toContainText('Aprovada')
  await page.context().close()
})

test('5: empresa licenciada concorrente não vê nem abre a importação de A', async ({ browser }) => {
  const page = await entrar(browser, USR.concorrente)
  await page.goto('/admin/importacoes')
  await expect(page.getByTestId('importacoes-hub')).toBeVisible(LENTO)
  await expect(page.getByRole('link', { name: REF })).toHaveCount(0)
  await page.goto(opUrl)
  await negado(page)
  await page.goto(`${opUrl}?aba=apuracao`)
  await negado(page)
  await page.context().close()
})

test('2 + 3: cliente sem módulo não vê o menu e não acessa a rota direta', async ({ browser }) => {
  const page = await entrar(browser, USR.semModulo)
  await page.goto('/admin/dashboard')
  await expect(page.getByTestId('executive-sidebar-nav').first()).toBeVisible(LENTO)
  await expect(page.locator('[data-nav-group="modulos"]')).toHaveCount(0)
  await expect(page.locator('a[href="/admin/importacoes"]')).toHaveCount(0)
  await page.goto('/admin/importacoes')
  await negado(page)
  await page.goto(opUrl)
  await negado(page)
  await page.context().close()
})

test('16: navegação em chinês e de volta ao português', async ({ browser }) => {
  const page = await entrar(browser, USR.dono)
  await page.goto('/admin/importacoes')
  await page.getByRole('button', { name: '普通话', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '进口管理' })).toBeVisible(LENTO)
  await expect(page.locator('[data-nav-group="modulos"]')).toContainText('进口管理')
  await page.goto(`${opUrl}?aba=apuracao`)
  await expect(page.getByTestId('imp-aba-versoes')).toHaveText('版本与审批', LENTO)
  await page.getByRole('button', { name: 'PT', exact: true }).first().click()
  await expect(page.getByTestId('imp-aba-versoes')).toHaveText('Versões e aprovação', LENTO)
  await page.context().close()
})

test('15: nenhum efeito em estoque, kardex, contas a pagar ou preços', async () => {
  const depois = await fotoErp()
  expect(depois).toEqual(erpAntes)
})
