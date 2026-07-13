import { expect, type Page } from '@playwright/test'
import {
  confirmarModalValorNumerico,
  MODAL_TITULO_ABRIR,
} from './caixaModais'

/**
 * Garante turno aberto sem race de status ainda carregando.
 * Aguarda o topbar estabilizar (TURNO/Fundo ou botão Abrir/Fechar) antes de decidir.
 */
export async function ensureCaixaAberto(
  page: Page,
  valorInicial = '100',
): Promise<'ja_aberto' | 'abriu'> {
  await expect(page.locator('header')).toContainText(/TURNO|Fundo|Abrir caixa|Fechar caixa|fechado/i, {
    timeout: 25_000,
  })

  const fechar = page.getByRole('button', { name: /Fechar caixa|结算收银台|結算收銀台/ })
  const abrir = page.getByRole('button', { name: /^Abrir caixa$|开启收银台/ })

  // Janela curta: se o status resolver como aberto, não force reabertura.
  const jaAberto = await fechar
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (jaAberto) return 'ja_aberto'

  await expect(abrir).toBeVisible({ timeout: 15_000 })
  await abrir.click()
  await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, valorInicial)
  await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto/i, {
    timeout: 25_000,
  })
  await expect(fechar).toBeVisible({ timeout: 15_000 })
  return 'abriu'
}
