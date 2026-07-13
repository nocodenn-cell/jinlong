import type { Page } from '@playwright/test'
import { caixaOperadorEmail, caixaOperadorPassword } from './env'
import { E2E_GOTO_DOMCONTENTLOADED, gotoApp, LOGIN_PATH } from './url'

type LoginWaitOptions = {
  timeout?: number
  postLoginUrl?: RegExp
}

/** next dev + HMR: evitar waitUntil=load; 90s cobre compile frio. */
const defaultLoginTimeout = 90_000

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('login-form').waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('[data-testid="login-form"][data-login-hydrated="1"]').waitFor({
    state: 'attached',
    timeout: 30_000,
  })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-senha').fill(password)
}

async function waitPostLogin(page: Page, postLoginUrl: RegExp, timeout: number): Promise<void> {
  try {
    await page.waitForURL(postLoginUrl, { timeout, waitUntil: 'commit' })
  } catch (err) {
    const alertTxt = (await page.getByRole('alert').first().textContent().catch(() => null))?.trim()
    const btn = (
      await page.getByRole('button', { name: /Entrar|Entrando/i }).textContent().catch(() => null)
    )?.trim()
    const emailVal = await page.locator('#login-email').inputValue().catch(() => '')
    const detail = [
      alertTxt && `alert=${alertTxt}`,
      btn && `btn=${btn}`,
      emailVal !== undefined && `email=${emailVal || '(vazio)'}`,
      `url=${page.url()}`,
    ]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`Login não navegou para ${postLoginUrl}${detail ? ` (${detail})` : ''}`, {
      cause: err,
    })
  }
}

/** Retry 1x em PGRST303 / JWT future (skew local Docker). */
async function loginWithRetry(
  page: Page,
  email: string,
  password: string,
  postLoginUrl: RegExp,
  timeout: number,
): Promise<void> {
  await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
  await fillLogin(page, email, password)
  await page.getByRole('button', { name: /^Entrar$/ }).click()

  try {
    await waitPostLogin(page, postLoginUrl, timeout)
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    const retryable = /PGRST303|JWT issued at future|perfil|email=\(vazio\)|login\?/i.test(msg)
    if (!retryable) throw first
    await page.waitForTimeout(1500)
    await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
    await fillLogin(page, email, password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await waitPostLogin(page, postLoginUrl, timeout)
  }
}

export async function loginGerente(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? defaultLoginTimeout
  const postLoginUrl = options.postLoginUrl ?? /\/(caixa|gerente|admin)/
  await loginWithRetry(
    page,
    process.env.PLAYWRIGHT_TEST_EMAIL!,
    process.env.PLAYWRIGHT_TEST_PASSWORD!,
    postLoginUrl,
    timeout,
  )
}

export async function loginCaixaOperador(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? defaultLoginTimeout
  const postLoginUrl = options.postLoginUrl ?? /\/caixa/
  await loginWithRetry(page, caixaOperadorEmail(), caixaOperadorPassword(), postLoginUrl, timeout)
}
