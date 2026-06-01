import type { Page } from '@playwright/test'

/** Alinhado a `app/login/page.tsx` — sem prefixo de locale. */
export const LOGIN_PATH = '/login'

/** Porta do Next nos E2E; deve bater com `playwright.config.ts` / `webServer`. */
export function getE2eTestPort(): string {
  return process.env.PLAYWRIGHT_TEST_PORT ?? '3000'
}

/**
 * Base URL efetiva dos testes.
 * `||` + trim: no CI, secret `PLAYWRIGHT_BASE_URL` ausente vira `''`, que `??` não trata.
 * Mantenha em sincronia com `playwright.config.ts`.
 */
export function getE2eBaseUrl(): string {
  const trimmed = process.env.PLAYWRIGHT_BASE_URL?.trim()
  if (trimmed) return trimmed
  return `http://localhost:${getE2eTestPort()}`
}

export function resolveE2eUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return new URL(normalized, getE2eBaseUrl()).href
}

/** Navegação com URL absoluta — não depende de `use.baseURL` no CI. */
export async function gotoApp(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
) {
  return page.goto(resolveE2eUrl(path), options)
}

/** Navegação alinhada ao `next dev`: evita esperar `load` indefinidamente. */
export const E2E_GOTO_DOMCONTENTLOADED = {
  waitUntil: 'domcontentloaded' as const,
}
