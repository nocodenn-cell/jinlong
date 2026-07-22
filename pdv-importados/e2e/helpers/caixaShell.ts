import { expect, type Page } from '@playwright/test'

/** Shell do /caixa (layout clássico ou legado + i18n). */
export const CAIXA_SHELL_HEADING =
  /Venda PDV|PDV · Caixa|POS · 收银|POS · 收銀/

export async function expectCaixaShellVisible(
  page: Page,
  timeout = 15_000,
): Promise<void> {
  await expect(page.getByText(CAIXA_SHELL_HEADING).first()).toBeVisible({
    timeout,
  })
}
