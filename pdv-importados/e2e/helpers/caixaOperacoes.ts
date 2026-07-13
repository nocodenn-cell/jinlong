import { expect, type Page } from '@playwright/test'

/**
 * Abre sangria via atalho oficial do PDV (Ctrl+Shift+R), com fallback pelo menu Operações.
 * Em seguida confirma o modal sensível e deixa o formulário «Registrar sangria» visível.
 */
export async function abrirSangriaViaOperacoes(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+R')

  const confirmarSangria = page.getByRole('dialog').filter({
    hasText: /Confirmar sangria|确认.*抽|確認.*抽/i,
  })
  const apareceu = await confirmarSangria
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  if (!apareceu) {
    await page.getByRole('button', { name: /^Operações$|操作/ }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByRole('menuitem', { name: /Sangria|抽现|取出/i }).click()
    await expect(confirmarSangria).toBeVisible({ timeout: 10_000 })
  }

  await confirmarSangria.getByRole('button', { name: /^Confirmar$|确认|確認/i }).click()

  await expect(page.getByRole('dialog').filter({ hasText: /Registrar sangria/i })).toBeVisible({
    timeout: 10_000,
  })
}


/** Valor pequeno (R$ 1,00) — evita MOV_CAIXA_SALDO_INSUFICIENTE quando `saldo_atual` << Fundo UI. */
export async function confirmarSangriaValor(page: Page, valor = '1'): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: /Registrar sangria/i })
  await dialog.getByRole('textbox', { name: /Valor/i }).fill(valor)
  await dialog.getByRole('button', { name: /^Confirmar$|确认|確認/i }).click()
}

/** Sugestão rápida R$ 50,00 (pt-BR) no modal de movimentação. */
export async function escolherSugestaoSangria50(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: /Registrar sangria/i })
  await dialog.getByRole('button', { name: /R\$\s*50[,.]00/ }).click()
  await dialog.getByRole('button', { name: /^Confirmar$|确认|確認/i }).click()
}

/**
 * Limpa cupom: layout classic usa «Excluir venda»; default/legado usa «Novo cupom».
 */
export async function limparCupomOuNovoCupom(page: Page): Promise<void> {
  const btn = page.getByRole('button', {
    name: /Novo cupom|Excluir venda|Nova venda|新小票|新單|新单/i,
  })
  await expect(btn.first()).toBeVisible({ timeout: 10_000 })
  await btn.first().click()
}
