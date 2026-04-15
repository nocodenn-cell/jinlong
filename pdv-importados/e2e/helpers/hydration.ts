import type { ConsoleMessage, Page } from '@playwright/test'

/**
 * Padrões alinhados a mensagens de erro do React 18 / Next ao falhar hidratação.
 * Mantidos explícitos para evitar falso positivo com logs genéricos que citam "server".
 */
const HYDRATION_LINE =
  /hydration failed|error while hydrating|while hydrating|did not match server|text content does not match|expected server html|there was an error while hydrating/i

export type HydrationCollectOptions = {
  /** Tempo extra após `load` para o React concluir a hidratação (dev pode ser mais lento). */
  settleMs?: number
}

/**
 * Registra `console` e `pageerror` durante `action` e devolve violações relacionadas a hidratação.
 * Use após mudanças em `app/layout.tsx`, fontes no `<html>`, etc.
 */
export async function collectHydrationViolationsDuring(
  page: Page,
  action: () => Promise<void>,
  options: HydrationCollectOptions = {},
): Promise<string[]> {
  const settleMs = options.settleMs ?? 600
  const violations: string[] = []

  const onConsole = (msg: ConsoleMessage) => {
    const text = msg.text()
    if (!HYDRATION_LINE.test(text)) return
    const kind = msg.type()
    if (kind === 'error' || kind === 'warning') {
      violations.push(`[console.${kind}] ${text}`)
    }
  }

  const onPageError = (err: Error) => {
    if (HYDRATION_LINE.test(err.message)) {
      violations.push(`[pageerror] ${err.message}`)
    }
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  try {
    await action()
    /* `load` pode não disparar a tempo no `next dev` (HMR / recursos pendentes). */
    await page.waitForLoadState('domcontentloaded')
    await new Promise<void>((resolve) => {
      setTimeout(resolve, settleMs)
    })
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
  }

  return violations
}
