import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
  isCi,
} from './helpers/env'

const LOGIN_PATH = '/login'

test.describe('Login → Dashboard do gerente', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test('login com credenciais válidas redireciona para /gerente', async ({
    page,
  }) => {
    if (!hasGerenteTestUser()) {
      test.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD.',
      )
      return
    }

    await test.step('navegar até /login', async () => {
      await page.goto(LOGIN_PATH)
      await expect(
        page.getByRole('heading', { name: 'Jīn Lóng' }),
      ).toBeVisible()
    })

    await test.step('preencher email e senha', async () => {
      await page
        .getByPlaceholder('Email')
        .fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
      await page
        .getByPlaceholder('Senha')
        .fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    })

    await test.step('clicar em Entrar e aguardar redirecionamento', async () => {
      await page.getByRole('button', { name: /^Entrar$/ }).click()
      await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })
    })

    await test.step('validar dashboard do gerente', async () => {
      await expect(page).toHaveURL(/\/gerente/)
      await expect(
        page.getByText(/Faturamento hoje|Today.*billing|今日营业额/i),
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test('dashboard exibe métricas e navegação após login', async ({ page }) => {
    if (!hasGerenteTestUser()) {
      test.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD.',
      )
      return
    }

    await page.goto(LOGIN_PATH)
    await page
      .getByPlaceholder('Email')
      .fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
    await page
      .getByPlaceholder('Senha')
      .fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })

    const mainNav = page.getByLabel('Painel do Gerente')
    await expect(
      mainNav.getByRole('link', { name: /^(Estoque|库存|庫存)$/ }),
    ).toBeVisible()
    await expect(
      mainNav.getByRole('link', { name: /^(Vendas|销售|銷售紀錄)$/ }),
    ).toBeVisible()

    await expect(page.getByText('Ticket médio hoje')).toBeVisible()
    await expect(page.getByText('Vendas hoje')).toBeVisible()
  })
})

test.describe('Login com credenciais inválidas (screenshot de falha)', () => {
  test('mostra erro e permanece em /login', async ({ page }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    if (!url || !key) {
      if (isCi()) {
        throw new Error(
          'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes no CI.',
        )
      }
      test.skip(true, 'Local: defina variáveis Supabase para este teste.')
      return
    }

    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill('inexistente@falso.test')
    await page.getByPlaceholder('Senha').fill('senhaErrada123')
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    await expect(page.getByText(/incorretos/i)).toBeVisible({
      timeout: 12_000,
    })
    await expect(page).toHaveURL(/\/login/)
  })
})
