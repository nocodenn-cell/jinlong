import { expect, type Page } from '@playwright/test'
import { confirmarModalValorNumerico, MODAL_TITULO_ABRIR } from './caixaModais'

/** Botão topbar / menu — abrir turno (pt + zh). */
export const BTN_ABRIR_CAIXA = /Abrir caixa|开启收银台/i
/** Botão topbar — fechar turno (pt + zh 结算). */
export const BTN_FECHAR_CAIXA = /Fechar caixa|结算收银台|关闭收银|關閉收銀/i

type TurnoUi = 'loading' | 'aberto' | 'fechado'

/**
 * Botões do turno escopados ao topbar (`<header>` de `CaixaPdvTopBar`).
 *
 * Desde o UX-011 (2d8d1eec) a faixa "Caixa fechado" do cupom
 * (`CaixaPdvCartSaleBar`) também tem um botão "Abrir caixa". Sem escopo o
 * locator resolve 2 elementos, `isVisible`/`isEnabled` lançam strict mode
 * violation, o `.catch(() => false)` engole o erro e o turno fica 'loading'
 * para sempre — mesmo com o status já carregado (CI 38656914306).
 */
function botoesTurno(page: Page) {
  const topbar = page.getByRole('banner')
  return {
    abrir: topbar.getByRole('button', { name: BTN_ABRIR_CAIXA }),
    fechar: topbar.getByRole('button', { name: BTN_FECHAR_CAIXA }),
  }
}

async function lerTurnoUi(page: Page): Promise<TurnoUi> {
  const { abrir, fechar } = botoesTurno(page)
  if (await fechar.isVisible().catch(() => false)) return 'aberto'
  if (await abrir.isEnabled().catch(() => false)) return 'fechado'
  if (await abrir.isVisible().catch(() => false)) return 'loading'
  return 'loading'
}

/**
 * Garante caixa ABERTO sem corrida de status.
 *
 * Evidência Cycle 5: clique em Abrir ainda `disabled`/`carregandoStatus` troca o
 * slot para Fechar e abre o modal errado. Sempre aguardar turno estabilizar.
 */
export async function ensureCaixaAberto(
  page: Page,
  valorFundo = '300',
): Promise<'ja_aberto' | 'abriu'> {
  const { abrir, fechar } = botoesTurno(page)

  const fecharDialog = page.getByRole('dialog', {
    name: /Fechar caixa|结算收银台|关闭收银|關閉收銀/i,
  })
  if (await fecharDialog.isVisible().catch(() => false)) {
    await fecharDialog.getByRole('button', { name: /Cancelar|取消/i }).click()
    await expect(fecharDialog).toBeHidden({ timeout: 10_000 })
  }

  await expect
    .poll(async () => lerTurnoUi(page), { timeout: 40_000 })
    .not.toBe('loading')

  if ((await lerTurnoUi(page)) === 'aberto') {
    return 'ja_aberto'
  }

  await expect(abrir).toBeEnabled({ timeout: 10_000 })
  await abrir.click()

  const turnoModal = page.getByTestId('caixa-abrir-turno-modal')
  if (await turnoModal.isVisible().catch(() => false)) {
    await turnoModal.getByRole('textbox').fill(valorFundo)
    await turnoModal.getByRole('button', { name: BTN_ABRIR_CAIXA }).click()
  } else {
    await confirmarModalValorNumerico(page, MODAL_TITULO_ABRIR, valorFundo)
  }

  await expect(page.getByRole('status')).toContainText(/Caixa aberto|aberto|已开|已開/i, {
    timeout: 25_000,
  })
  await expect(fechar).toBeVisible({ timeout: 15_000 })
  return 'abriu'
}
