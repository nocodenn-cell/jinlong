import type { Page } from '@playwright/test'
import { caixaOperadorEmail, caixaOperadorPassword } from './env'
import { gotoApp, LOGIN_PATH } from './url'

type LoginWaitOptions = {
  timeout?: number
  postLoginUrl?: RegExp
}

export async function loginGerente(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 20_000
  const postLoginUrl = options.postLoginUrl ?? /\/(caixa|gerente|admin)/
  await gotoApp(page, LOGIN_PATH)
  await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
  await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForURL(postLoginUrl, { timeout })
}

export async function loginCaixaOperador(
  page: Page,
  options: LoginWaitOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 20_000
  const postLoginUrl = options.postLoginUrl ?? /\/caixa/
  await gotoApp(page, LOGIN_PATH)
  await page.getByPlaceholder('Email').fill(caixaOperadorEmail())
  await page.getByPlaceholder('Senha').fill(caixaOperadorPassword())
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForURL(postLoginUrl, { timeout })
}
