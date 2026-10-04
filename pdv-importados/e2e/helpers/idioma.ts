import { expect, type Page } from '@playwright/test'

/**
 * Garante idioma PT no painel do GERENTE (`/admin/*`), com confirmação real
 * (clique + `disabled` + reload + reconfirmação) — não só o estado otimista
 * do client, que não sobrevive a um reload nem prova que o PATCH assíncrono
 * de `idioma_preferido` no perfil já comitou.
 *
 * `idioma_preferido` é persistido no perfil do usuário — compartilhado entre
 * TODOS os specs e workers que usam a mesma conta `PLAYWRIGHT_TEST_EMAIL`.
 * Um teste que troca para 普通话 e falha antes de reverter deixa "zh"
 * vazando para o PRÓXIMO teste a rodar com essa conta, mesmo em outro
 * arquivo. Comprovado ao vivo: `gerente-transferencias.spec.ts` herdou "zh"
 * de uma falha anterior em `gerente.spec.ts` (o teste do fluxo crítico em
 * chinês travou antes de chegar ao seu próprio revert) e o modal de
 * confirmação renderizou "确认" em vez de "Confirmar", travando o teste por
 * 90s num locator que nunca existia.
 *
 * Chamar em `beforeEach` (baseline determinística antes do teste) E em
 * `afterEach` (defesa adicional — cobre o teste que troca de idioma e falha
 * no meio, antes de rodar seu próprio revert inline).
 *
 * Fora do painel ou com a página fechada, não altera o estado.
 * No painel, aguarda o toggle montar antes de preparar o idioma.
 */
export async function garantirIdiomaPt(page: Page): Promise<void> {
  if (page.isClosed() || !/\/admin(?:\/|$|\?)/.test(page.url())) return
  const ptBtn = page.getByRole('button', { name: /^PT$/ })
  await expect(ptBtn).toBeVisible({ timeout: 10_000 })
  const jaPt = await ptBtn.isDisabled().catch(() => false)
  if (jaPt) return

  await ptBtn.click()
  await expect(ptBtn).toBeDisabled({ timeout: 10_000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: /^PT$/ })).toBeDisabled({ timeout: 10_000 })
}
