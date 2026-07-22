import { expect, type Page } from '@playwright/test'

/** Primary CTA nos modais de caixa (`m.comum.confirmar` ou `m.caixa.abrir` no turno). */
const BTN_CONFIRMAR = /Confirmar|Abrir caixa|确认|確認|开班|開啟/

/**
 * Título do modal de abertura (`CaixaAbrirTurnoModal` = abrir_turno_titulo;
 * legado modal_valor_titulo_abrir). Inclui 开班 (zh turno).
 */
export const MODAL_TITULO_ABRIR = /Abrir caixa|开启收银|開啟收銀|开班/i
export const MODAL_TITULO_FECHAR = /Fechar caixa|结算收银台|关闭收银|關閉收銀/i

/** `CaixaMotivoMinModal` — diferença > limite (`m.caixa.modal_motivo_diferenca_titulo`). */
export const MODAL_TITULO_MOTIVO_DIF = /Motivo da diferença|差额原因|差額原因/i

export async function confirmarModalValorNumerico(
  page: Page,
  titulo: RegExp,
  valor: string,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: titulo })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('textbox').fill(valor)
  await dialog.getByRole('button', { name: BTN_CONFIRMAR }).click()
}

export async function confirmarModalMotivoMin(
  page: Page,
  titulo: RegExp,
  motivo: string,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: titulo })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('textbox').fill(motivo)
  await dialog.getByRole('button', { name: BTN_CONFIRMAR }).click()
}
