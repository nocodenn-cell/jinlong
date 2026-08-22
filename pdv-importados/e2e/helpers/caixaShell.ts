import { expect, type Page } from '@playwright/test'

/**
 * Shell do /caixa (layout clássico ou legado + i18n).
 *
 * NÃO é mais `/Venda PDV|PDV · Caixa|.../` — esse rótulo foi removido de propósito da UI
 * (ver comentário em `app/caixa/CaixaPdvTopBar.tsx`: "'Venda PDV' saiu — o operador sabe
 * onde está"). O helper ficou apontando para um elemento que não existe mais, e todo
 * teste que dependia dele falhava por "element(s) not found" — nunca foi flakiness de
 * timing, o seletor é que ficou obsoleto. Trocado pelo placeholder do campo de busca de
 * produto (`src/lib/i18n/{pt,zh}.json`, chave `caixa.busca_placeholder`), presente em
 * QUALQUER estado da tela (caixa aberto ou fechado), nas duas línguas suportadas.
 */
export const CAIXA_SHELL_HEADING =
  /Código de barras, nome ou categoria…|条码、名称或类别…/

// 30s, não 15s: em `next dev` (CI com PLAYWRIGHT_E2E_WITH_DEV=1) um reload no meio do
// teste (park → refresh → resume) pode recompilar a rota /caixa outra vez sob carga —
// 15s bastava no caminho quente, mas era curto demais para o pior caso observado em CI.
export async function expectCaixaShellVisible(
  page: Page,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByPlaceholder(CAIXA_SHELL_HEADING).first()).toBeVisible({
    timeout,
  })
}
