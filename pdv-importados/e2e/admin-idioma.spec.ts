import { test, expect, type Page } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

async function switchToPtIfNeeded(page: Page) {
  const ptBtn = page.getByRole('button', { name: /^PT$/ })
  await expect(ptBtn).toBeVisible()
  if (!(await ptBtn.isDisabled())) {
    await ptBtn.click()
    await expect(ptBtn).toBeDisabled({ timeout: 10_000 })
    // Confirma persistência de verdade com um reload — o mesmo padrão que o
    // teste principal usa pra provar que zh persiste. Só o botão ficar
    // `disabled` pode ser estado otimista do client; sem o reload, um afterEach
    // de limpeza pode terminar (e a página fechar) antes do PATCH assíncrono
    // de `idioma_preferido` de fato confirmar no servidor — comprovado: outro
    // spec rodando logo depois ainda via a UI presa em zh mesmo com o clique
    // em "PT" já disparado e "disabled" já confirmado sem o reload.
    await page.reload()
    await expect(page.getByRole('button', { name: /^PT$/ })).toBeDisabled({ timeout: 10_000 })
  }
}

test.describe('Admin - i18n idioma', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.beforeEach(async ({ page }, testInfo) => {
    if (!hasGerenteTestUser()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD (e Supabase público) para estes fluxos.',
      )
      return
    }
    await loginGerente(page)
    await gotoApp(page, '/admin/dashboard')
    await switchToPtIfNeeded(page)
  })

  test('alterna para zh e persiste após refresh', async ({ page }) => {
    await expect(page.getByText('Dashboard comercial')).toBeVisible()
    await page.getByRole('button', { name: '普通话' }).click()
    // Não `getByText('主控台')`: esse é o rótulo do item de menu na sidebar,
    // que em `mobile-chrome-pixel`/`mobile-safari-iphone` fica dentro do
    // drawer de navegação (`AdminV2MobileNavDrawer`, fechado por padrão) —
    // `hidden`, não ausente. O h1 do dashboard é visível em qualquer
    // viewport e prova o mesmo contrato (idioma trocou/persistiu).
    await expect(page.getByText('生意看板')).toBeVisible({ timeout: 10_000 })
    await page.reload()
    await expect(page.getByText('生意看板')).toBeVisible({ timeout: 10_000 })
  })

  // `idioma_preferido` é persistido no perfil do usuário GERENTE (comprovado
  // pelo teste acima: sobrevive a um `page.reload()`), não em cookie/
  // localStorage do browser. O usuário E2E é COMPARTILHADO entre specs —
  // sem reverter aqui, todo spec que rodar depois deste na mesma suíte herda
  // a UI em chinês e quebra em locators só-em-português (comprovado: rodar
  // admin-vendas-devolucao-troca.spec.ts logo após este arquivo falha
  // procurando "Devolver / trocar", que não existe na UI em zh).
  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return
    await switchToPtIfNeeded(page).catch(() => {})
  })
})
