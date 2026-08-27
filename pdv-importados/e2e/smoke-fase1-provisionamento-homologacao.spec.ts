/**
 * Smoke homologação Fase 1 — fluxo único sem intervenção manual:
 * ADMIN → provisionar loja+DONO → checklist → logout →
 * DONO → produto → abrir caixa → venda → fechar caixa → dashboard.
 */
import { createClient } from '@supabase/supabase-js'
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loginWithRetry } from './helpers/login'
import { gotoApp, E2E_GOTO_DOMCONTENTLOADED, LOGIN_PATH } from './helpers/url'
import { ensureCaixaAberto, BTN_FECHAR_CAIXA } from './helpers/ensureCaixaAberto'
import {
  adicionarProdutoDemo,
  dismissReciboSeAberto,
  finalizarVenda,
  irParaAbaPgto,
} from './helpers/caixaPagamento'
import {
  confirmarModalMotivoMin,
  confirmarModalValorNumerico,
  MODAL_TITULO_FECHAR,
  MODAL_TITULO_MOTIVO_DIF,
} from './helpers/caixaModais'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvLocal()

const ADMIN_EMAIL =
  process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() || 'e2e-admin@fastproduct.dev'
const ADMIN_PASSWORD =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() ||
  process.env.SEED_DEV_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
  ''

function hasSmokeEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      ADMIN_PASSWORD,
  )
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

async function findAuthUserByEmail(email: string) {
  const admin = adminClient()
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

/** Garante usuário ADMIN interno (equipe FastProduct) para o wizard. */
async function ensureAdminUser(): Promise<void> {
  const admin = adminClient()
  let user = await findAuthUserByEmail(ADMIN_EMAIL)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Admin FastProduct' },
    })
    if (error || !data.user) throw new Error(error?.message ?? 'create ADMIN falhou')
    user = data.user
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    })
  }

  const { error } = await admin.from('usuarios').upsert(
    {
      id: user.id,
      nome: 'E2E Admin FastProduct',
      perfil: 'ADMIN',
      idioma_preferido: 'pt',
      ativo: true,
      loja_id: LOJA_MATRIZ_ID,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`usuarios ADMIN: ${error.message}`)
}

async function logoutViaUi(page: Page): Promise<void> {
  const sair = page.getByRole('link', { name: /^Sair$/ }).or(page.getByRole('button', { name: /^Sair$/ }))
  if (await sair.first().isVisible().catch(() => false)) {
    await sair.first().click()
    await page.waitForURL(/\/login/, { timeout: 30_000 })
    return
  }
  await gotoApp(page, '/auth/signout', E2E_GOTO_DOMCONTENTLOADED)
  await page.waitForURL(/\/login/, { timeout: 30_000 }).catch(async () => {
    await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
  })
}

async function loginAs(page: Page, email: string, password: string, post: RegExp): Promise<void> {
  await loginWithRetry(page, email, password, post, 90_000)
}

/** Digitação real — dispara onChange do React em inputs controlados. */
async function typeInto(page: Page, testId: string, value: string) {
  const locator = page.getByTestId(testId)
  await locator.click()
  await locator.fill('')
  await page.keyboard.type(value, { delay: 20 })
  await expect(locator).toHaveValue(value)
}

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('Smoke Fase 1 — provisionamento → venda → dashboard', () => {
  const stamp = Date.now()
  const lojaNome = `Smoke Homolog ${stamp}`
  const lojaCodigo = `SMOKE_${stamp}`
  const donoNome = `Dono Smoke ${stamp}`
  const donoEmail = `smoke.dono.${stamp}@fp-homolog.com`
  const donoSenha = ADMIN_PASSWORD.length >= 8 ? ADMIN_PASSWORD : 'SmokeHomolog1!'
  const produtoNome = `Produto Smoke ${stamp}`
  const produtoCodigo = `SMK${String(stamp).slice(-10)}`
  const produtoPreco = '10,00'

  let lojaId = ''

  test.beforeAll(async () => {
    test.skip(!hasSmokeEnv(), 'Exige SUPABASE + senha ADMIN/SEED no .env.local')
    await ensureAdminUser()
  })

  test('1 — Login ADMIN e provisionar loja + DONO', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/(admin|gerente|caixa)/)

    await gotoApp(page, '/admin/provisionamento', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByRole('heading', { name: /Provisionamento/i })).toBeVisible({
      timeout: 60_000,
    })

    // Step loja
    await typeInto(page, 'prov-loja-nome', lojaNome)
    await typeInto(page, 'prov-loja-codigo', lojaCodigo)
    await expect(page.getByTestId('prov-step-loja-next')).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId('prov-step-loja-next').click()

    // Step DONO
    await typeInto(page, 'prov-dono-nome', donoNome)
    await typeInto(page, 'prov-dono-email', donoEmail)
    await typeInto(page, 'prov-dono-senha', donoSenha)
    await page.getByTestId('prov-dono-idioma').selectOption('pt')
    await expect(page.getByTestId('prov-step-dono-next')).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId('prov-step-dono-next').click()

    // Confirmar
    await expect(page.getByText(lojaNome)).toBeVisible()
    await page.getByTestId('prov-submit').click()

    // `getByText(/Loja pronta/)` casa o `<li>` do wizard E o toast `role=status`
    // ao mesmo tempo → strict mode violation (CI #1226). O sinal estável de
    // sucesso é `prov-loja-id` (UUID renderizado só no step 3).
    const sucesso = page.getByTestId('prov-loja-id')
    const toastErro = page.locator('[aria-live="polite"], [role="status"], [data-sonner-toast]').filter({
      hasText: /erro|falha|inválid|Could not|duplicate|violates/i,
    })

    await Promise.race([
      sucesso.waitFor({ state: 'visible', timeout: 90_000 }),
      toastErro
        .first()
        .waitFor({ state: 'visible', timeout: 90_000 })
        .then(async () => {
          throw new Error(`Provisionamento falhou: ${(await toastErro.first().innerText()).trim()}`)
        }),
    ])

    await expect(sucesso).toBeVisible()
    const lojaCode = sucesso
    lojaId = (await lojaCode.innerText()).trim()
    expect(lojaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  test('2 — Abrir checklist da loja provisionada', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/(admin|gerente|caixa)/)
    await gotoApp(
      page,
      `/admin/implantacao?lojaId=${encodeURIComponent(lojaId)}`,
      E2E_GOTO_DOMCONTENTLOADED,
    )

    await expect(page.getByRole('heading', { name: /Implantação|GO-LIVE|上线/i })).toBeVisible({
      timeout: 60_000,
    })
    // CI #1228: `getByText(/Loja criada/)` casa o item da timeline E um
    // segundo bloco na página → strict mode. Escopo: `implantacao-timeline`.
    const timeline = page.getByTestId('implantacao-timeline')
    await expect(timeline.getByText(/Loja criada|门店已创建/i)).toBeVisible()
    await expect(timeline.getByText(/DONO criado|店主已创建/i)).toBeVisible()
    // Status concluído na linha da loja criada
    const rowLoja = page.getByRole('row').filter({ hasText: /Loja criada|门店已创建/i })
    await expect(rowLoja.getByText(/Concluído|已完成/i)).toBeVisible()
  })

  test('3 — Logout ADMIN → login DONO → cadastrar produto', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/(admin|gerente|caixa)/)
    await logoutViaUi(page)

    await loginAs(page, donoEmail, donoSenha, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/catalogo', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByRole('heading', { name: /Catálogo|Produtos|商品/i }).first()).toBeVisible({
      timeout: 60_000,
    })

    const novo = page
      .getByRole('button', { name: /Cadastro rápido|Novo produto|创建商品|快速/i })
      .first()
    await novo.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    await dialog.locator('input[data-field="nome"]').fill(produtoNome)
    await dialog.locator('input[data-field="codigo_barras"]').fill(produtoCodigo)
    await dialog.locator('input[data-field="preco_varejo"]').fill(produtoPreco)

    const labelEstoque = dialog.locator('label').filter({ hasText: /Estoque inicial|初始库存/i })
    await labelEstoque.locator('input').fill('20')

    await dialog.getByRole('button', { name: /^Salvar$|^保存$/ }).click()

    // Pós-salvar pode mostrar painel de sucesso; fechar se houver
    const fecharPos = dialog.getByRole('button', { name: /Fechar|关闭|繼續|Continuar/i })
    if (await fecharPos.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
      await fecharPos.first().click()
    }

    await expect(dialog).toBeHidden({ timeout: 30_000 }).catch(async () => {
      // alguns fluxos fecham e recarregam a lista
      await page.keyboard.press('Escape')
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(produtoNome)).toBeVisible({ timeout: 30_000 })
  })

  test('4 — Abrir caixa → venda → fechar caixa', async ({ page }) => {
    await loginAs(page, donoEmail, donoSenha, /\/(admin|gerente)/)
    await gotoApp(page, '/caixa', E2E_GOTO_DOMCONTENTLOADED)

    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, produtoCodigo)
    await irParaAbaPgto(page)
    await finalizarVenda(page)
    await dismissReciboSeAberto(page)

    await page.getByRole('button', { name: BTN_FECHAR_CAIXA }).click()
    // fundo 300 + venda 10 = 310
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, '310,00')

    const motivo = page.getByRole('dialog', { name: MODAL_TITULO_MOTIVO_DIF })
    if (await motivo.isVisible().catch(() => false)) {
      await confirmarModalMotivoMin(page, MODAL_TITULO_MOTIVO_DIF, 'Smoke homologação Fase 1')
    }

    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado|已结|已關/i, {
      timeout: 30_000,
    })
  })

  test('5 — Confirmar dashboard do DONO', async ({ page }) => {
    await loginAs(page, donoEmail, donoSenha, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/dashboard', E2E_GOTO_DOMCONTENTLOADED)

    await expect(
      page.getByRole('heading', { name: /Painel|Dashboard|Visão|看板|主控/i }).first(),
    ).toBeVisible({ timeout: 60_000 })

    // Evidência de operação: KPI ou texto de vendas do dia
    const evidencia = page
      .getByText(/Vendas|Total|Ticket|销售|营业/i)
      .first()
    await expect(evidencia).toBeVisible({ timeout: 30_000 })
  })
})
