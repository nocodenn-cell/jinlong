/**
 * E2E — recuperação de senha de ponta a ponta (ERP).
 *
 * Usa uma conta SINTÉTICA criada e removida pelo próprio teste, via Admin API do Supabase
 * local. O link de "e-mail" vem de `admin/generate_link` (hashed_token), que é o mesmo
 * token_hash do template com {{ .TokenHash }} → /auth/confirm.
 *
 * Só roda contra Supabase local (o helper do Playwright já recusa alvo não local).
 * Requer: NEXT_PUBLIC_SUPABASE_URL (localhost), SUPABASE_SERVICE_ROLE_KEY e
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Sem elas, o bloco é pulado com motivo explícito.
 */
import { test, expect, type Page } from '@playwright/test'
import { resolveE2eUrl } from './helpers/url'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPA_URL)
const configurado = Boolean(SUPA_URL && ANON && SERVICE && LOCAL)

const OLD = 'SenhaAntiga123'
const NEW = 'SenhaNova456'

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPA_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

async function criarUsuario(): Promise<{ id: string; email: string }> {
  const email = `sint-e2e-rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
  const r = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: OLD, email_confirm: true }) })
  const j = (await r.json()) as { id?: string }
  if (!j.id) throw new Error(`não criou usuário sintético (HTTP ${r.status})`)
  return { id: j.id, email }
}

async function tokenHashDoEmail(email: string): Promise<string> {
  const r = await admin('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email }) })
  const j = (await r.json()) as { hashed_token?: string }
  if (!j.hashed_token) throw new Error(`generate_link sem token (HTTP ${r.status})`)
  return j.hashed_token
}

async function apagarUsuario(id: string) {
  await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
}

async function loginSenha(email: string, password: string): Promise<number> {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return r.status
}

/** Abre o link de confirmação como o usuário faria (página /auth/confirm + clique). */
async function abrirLink(page: Page, tokenHash: string) {
  await page.goto(resolveE2eUrl(`/auth/confirm?token_hash=${tokenHash}&type=recovery&next=%2Fauth%2Fredefinir-senha`))
  await page.locator('[data-testid=confirm-email-link-form] button').first().click()
  await page.waitForLoadState('networkidle')
  // a tela de redefinição só aceita o envio depois da hidratação do React
  await page.waitForFunction(() => document.querySelector('[data-testid=reset-password-form]') !== null || document.querySelector('[role=alert]') !== null)
}

test.describe('recuperação de senha (ERP)', () => {
  test.skip(!configurado, 'precisa de Supabase local: NEXT_PUBLIC_SUPABASE_URL (localhost), anon e service role')

  test('caminho feliz: link → nova senha → login com a nova e não com a antiga', async ({ page }) => {
    const u = await criarUsuario()
    try {
      const tokenHash = await tokenHashDoEmail(u.email)
      await abrirLink(page, tokenHash)
      await expect(page).toHaveURL(/\/auth\/redefinir-senha/)
      await expect(page.locator('[data-testid=reset-password-form] button[type=submit]')).toBeEnabled()

      await page.locator('#reset-senha').fill(NEW)
      await page.locator('#reset-confirm').fill(NEW)
      await page.locator('[data-testid=reset-password-form] button[type=submit]').click()

      await expect(page.locator("p[role=status]")).toContainText('Senha atualizada')
      expect(await loginSenha(u.email, NEW)).toBe(200)
      expect(await loginSenha(u.email, OLD)).not.toBe(200)
    } finally {
      await apagarUsuario(u.id)
    }
  })

  test('mesma senha da anterior: mensagem clara em português e nada é alterado', async ({ page }) => {
    const u = await criarUsuario()
    try {
      await abrirLink(page, await tokenHashDoEmail(u.email))
      await page.locator('#reset-senha').fill(OLD)
      await page.locator('#reset-confirm').fill(OLD)
      await page.locator('[data-testid=reset-password-form] button[type=submit]').click()
      await expect(page.locator("p[role=alert]")).toContainText('precisa ser diferente')
      await expect(page.locator("p[role=alert]")).not.toContainText('New password')
      expect(await loginSenha(u.email, OLD)).toBe(200)
    } finally {
      await apagarUsuario(u.id)
    }
  })

  test('senha curta: a regra aparece na tela e o envio não acontece', async ({ page }) => {
    const u = await criarUsuario()
    try {
      await abrirLink(page, await tokenHashDoEmail(u.email))
      await page.locator('#reset-senha').fill('abc')
      await page.locator('#reset-confirm').fill('abc')
      await page.locator('[data-testid=reset-password-form] button[type=submit]').click()
      await expect(page.locator("p[role=alert]")).toContainText('pelo menos 8 caracteres')
      expect(await loginSenha(u.email, OLD)).toBe(200)
    } finally {
      await apagarUsuario(u.id)
    }
  })

  test('link reutilizado não serve de novo: volta a pedir novo link', async ({ page }) => {
    const u = await criarUsuario()
    try {
      const tokenHash = await tokenHashDoEmail(u.email)
      await abrirLink(page, tokenHash)
      await expect(page).toHaveURL(/\/auth\/redefinir-senha/)
      await page.context().clearCookies()
      const outra = await page.context().newPage()
      await abrirLink(outra, tokenHash)
      await expect(outra).toHaveURL(/\/auth\/esqueci-senha\?erro=link_(invalido|expirado)/)
    } finally {
      await apagarUsuario(u.id)
    }
  })

  test('link inválido: volta a esqueci-senha com erro', async ({ page }) => {
    await abrirLink(page, 'token-invalido-000')
    await expect(page).toHaveURL(/\/auth\/esqueci-senha\?erro=link_(invalido|expirado)/)
  })

  test('sem sessão: formulário desabilitado com instrução para pedir novo link', async ({ page }) => {
    await page.goto(resolveE2eUrl('/auth/redefinir-senha'))
    await page.waitForLoadState('networkidle')
    await expect(page.locator("p[role=alert]")).toContainText('Sessão de recuperação ausente')
    await expect(page.locator('[data-testid=reset-password-form] button[type=submit]')).toBeDisabled()
  })
})
