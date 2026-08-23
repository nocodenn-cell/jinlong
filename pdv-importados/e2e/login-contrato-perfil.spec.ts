import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  caixaOperadorEmail,
  caixaOperadorPassword,
  hasCaixaOperadorUser,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente, loginWithRetry } from './helpers/login'

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

  test('GERENTE: login cai em /admin/dashboard e a navegação do painel confirma autorização', async ({
    page,
  }) => {
    test.skip(!hasGerenteTestUser(), 'PLAYWRIGHT_TEST_EMAIL/PASSWORD ausentes (local).')
    await loginGerente(page)
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/admin\/dashboard/)
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('OPERADOR: nunca alcança /admin/dashboard — contrato do caixa não pode aceitar admin', async ({
    page,
  }) => {
    test.skip(!hasCaixaOperadorUser(), 'PLAYWRIGHT_CAIXA_TEST_EMAIL/PASSWORD ausentes (local).')
    // `fillLogin` tem dois waits fixos de 30s (compilação fria do form),
    // independentes do `timeout` passado a `loginWithRetry` — somados aos 20s
    // do redirect aqui, o pior caso chega perto de 90s. Este teste É a prova
    // de que o contrato falha (deve mesmo esgotar seu orçamento e rejeitar),
    // então precisa de folga própria no timeout do teste, não do helper.
    test.setTimeout(120_000)

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
