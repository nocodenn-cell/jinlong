import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  caixaOperadorEmail,
  caixaOperadorPassword,
  hasCaixaOperadorUser,
  hasGerenteTestUser,
} from './helpers/env'
import { garantirIdiomaPt } from './helpers/idioma'
import { assertGerenteNavVisible, loginGerente, loginWithRetry } from './helpers/login'

/**
 * Contrato de destino pós-login por perfil (`destinoPosLoginPorPerfil` em
 * `lib/auth/painelGerencial.ts`): GERENTE/DONO/ADMIN sempre em
 * /admin/dashboard, OPERADOR sempre em /caixa. Existe porque
 * `loginGerente(page, { postLoginUrl: /\/(caixa|gerente)/ })` (sem admin) em
 * `gerente.spec.ts` e `gerente-transferencias.spec.ts` esperava a venda
 * errada por 90s antes de a página fechar no timeout global e mascarar a
 * causa real como "Target page ... has been closed".
 */
test.describe('Contrato de login por perfil', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.afterEach(async ({ page }) => {
    // Defesa adicional: nenhum teste deste arquivo troca de idioma
    // intencionalmente, mas a conta GERENTE é compartilhada com outros
    // specs (`gerente.spec.ts`, `gerente-transferencias.spec.ts`) — não
    // deixar "zh" vazar daqui para eles, nem herdar o inverso deles.
    // No-op para o teste OPERADOR (o botão PT não existe fora de /admin/*).
    await garantirIdiomaPt(page)
  })

  test('GERENTE: login cai em /admin/dashboard e a navegação do painel confirma autorização', async ({
    page,
  }) => {
    test.skip(!hasGerenteTestUser(), 'PLAYWRIGHT_TEST_EMAIL/PASSWORD ausentes (local).')
    await loginGerente(page)
    await garantirIdiomaPt(page)
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/admin\/dashboard/)
    // `assertGerenteNavVisible` (não um `getByRole('navigation')` cru) porque
    // a prova de RBAC é responsiva — ver o teste de contrato abaixo.
    await assertGerenteNavVisible(page)
  })

  test('GERENTE: contrato de navegação responsiva — desktop mostra <nav> direto, mobile exige abrir o drawer', async ({
    page,
  }, testInfo) => {
    test.skip(!hasGerenteTestUser(), 'PLAYWRIGHT_TEST_EMAIL/PASSWORD ausentes (local).')
    // `loginGerente` já abre e fecha o drawer internamente (via
    // `assertGerenteNavVisible`) só para provar RBAC — aqui a asserção é
    // sobre o ESTADO inicial pós-login, então usamos `loginWithRetry` puro
    // (sem a prova de nav) para não confundir "drawer que loginGerente abriu
    // e fechou" com "drawer nunca aberto".
    await loginWithRetry(
      page,
      process.env.PLAYWRIGHT_TEST_EMAIL!,
      process.env.PLAYWRIGHT_TEST_PASSWORD!,
      /\/admin\/dashboard(\/|$|\?)/,
      90_000,
    )
    // Baseline determinística antes de ler o estado do drawer/nav — no-op
    // nesta página se o toggle PT/普通话 não estiver presente aqui.
    await garantirIdiomaPt(page)

    const isMobileProject = testInfo.project.name.startsWith('mobile-')
    // Prova de RBAC é a sidebar. O hub executivo também é `<nav>` e fica
    // visível no dashboard mobile — `getByRole('navigation')` casava ele e
    // `toBeHidden()` falhava com o landmark certo ainda oculto.
    const asideNav = page.locator('aside').getByTestId('executive-sidebar-nav')
    const menuButton = page.getByRole('button', { name: 'Navegação' })

    if (isMobileProject) {
      await expect(menuButton).toBeVisible()
      await expect(asideNav).toBeHidden()

      await menuButton.click()
      const drawer = page.getByRole('dialog', { name: 'Navegação' })
      await expect(drawer).toBeVisible()
      await expect(drawer.getByTestId('executive-sidebar-nav')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
    } else {
      await expect(asideNav).toBeVisible()
      await expect(menuButton).not.toBeVisible()
    }
  })

  test('OPERADOR: nunca alcança /admin/dashboard — contrato do caixa não pode aceitar admin', async ({
    page,
  }) => {
    test.skip(!hasCaixaOperadorUser(), 'PLAYWRIGHT_CAIXA_TEST_EMAIL/PASSWORD ausentes (local).')
    // Sem `setTimeout(120_000)`: o config global já é 150s (folga após login
    // de até 90s). CI #1228: o teto de 120s matava o teste antes do reject
    // esperado do contrato (`loginWithRetry` + compile fria do `next dev`).

    // Forçar a expectativa de destino do GERENTE contra um login de OPERADOR
    // tem que falhar: se "passasse", provaria que o regex de destino está
    // largo demais e deixaria o OPERADOR ser aceito numa rota administrativa.
    await expect(
      loginWithRetry(
        page,
        caixaOperadorEmail(),
        caixaOperadorPassword(),
        /\/admin\/dashboard/,
        20_000,
      ),
    ).rejects.toThrow()
  })
})
