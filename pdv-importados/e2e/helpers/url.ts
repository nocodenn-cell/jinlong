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

/** Navegação alinhada ao `next dev`: evita esperar `load` indefinidamente. */
export const E2E_GOTO_DOMCONTENTLOADED = {
  waitUntil: 'domcontentloaded' as const,
}

/**
 * Navegação com URL absoluta — não depende de `use.baseURL` no CI.
 * Default `domcontentloaded`: CI #1228 WebKit estourou 150s em `waitUntil=load`
 * (`gerente.spec` imprimir-etiquetas) enquanto o `next dev` recompilava.
 */
export async function gotoApp(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
) {
  return page.goto(resolveE2eUrl(path), { ...E2E_GOTO_DOMCONTENTLOADED, ...options })
}

/**
 * Pronto para interação: o React já hidratou a página (há elementos com props do React).
 * Clicar antes disso dispara só o HTML do SSR — o botão não faz nada (PDV-100.1, Playwright).
 * Condição de estado, não timeout: espera o próprio React anexar os handlers.
 */
export async function esperarHidratacao(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('button')).some((el) =>
      Object.keys(el).some((k) => k.startsWith('__reactProps')),
    ),
  )
}
