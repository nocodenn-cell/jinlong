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
 * Espera o React hidratar a página (o `document` ganha a chave `__reactContainer$…`).
 * Interagir ANTES disso perde o clique (hamburger do drawer) ou, num <form action={serverAction}>
 * (toggle PT/普通话), dispara um POST de página inteira cujo streaming Suspense fica preso em
 * `div[hidden]` — `main` vazio e h1 "hidden". Com `next dev` frio a hidratação leva segundos.
 * Não falha se a página não hidrata (ex.: resposta não-React): a asserção do teste decide.
 */
export async function waitForHydration(page: Page, timeout = 60_000) {
  await page
    .waitForFunction(() => Object.keys(document).some((k) => k.startsWith('__reactContainer')), undefined, {
      timeout,
    })
    .catch(() => undefined)
}

/**
 * Navegação com URL absoluta — não depende de `use.baseURL` no CI.
 * Default `domcontentloaded`: CI #1228 WebKit estourou 150s em `waitUntil=load`
 * (`gerente.spec` imprimir-etiquetas) enquanto o `next dev` recompilava.
 * Depois do `goto`, espera a hidratação (ver `waitForHydration`).
 */
export async function gotoApp(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
) {
  const response = await page.goto(resolveE2eUrl(path), { ...E2E_GOTO_DOMCONTENTLOADED, ...options })
  await waitForHydration(page)
  return response
}
