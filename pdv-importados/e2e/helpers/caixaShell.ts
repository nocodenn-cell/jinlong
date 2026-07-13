import { expect, type Page } from '@playwright/test'

/**
 * Shell do /caixa: título legado «PDV · Caixa» ou classic «Venda PDV» + busca.
 * Não exige texto fixo único — a variante de layout muda o heading.
 */
export async function expectCaixaShellVisible(page: Page): Promise<void> {
  const titulo = page
    .getByRole('heading', { name: /Venda PDV|PDV · Caixa|POS · 收银|POS · 收銀/i })
    .or(page.getByText(/PDV · Caixa|POS · 收银|POS · 收銀/i))
  await expect(titulo.first()).toBeVisible({ timeout: 20_000 })
  await expect(
    page.getByRole('textbox', {
      name: /código de barras|nome do produto|条码|商品名称|Código de barras/i,
    }),
  ).toBeVisible({ timeout: 15_000 })
}
