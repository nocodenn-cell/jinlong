import { test, expect } from '@playwright/test'

/** Alinhado a `app/login/page.tsx` — sem prefixo de locale. */
const LOGIN_PATH = '/login'

test.describe('Página de login', () => {
  test('exibe formulário', async ({ page }) => {
    test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL não configurado')

    await page.goto(LOGIN_PATH)
    await expect(page.getByRole('heading', { name: 'PDV Importados' })).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Senha')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Entrar$/ })).toBeVisible()
  })

  test('credenciais inválidas mostram erro', async ({ page }) => {
    test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL não configurado')

    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill('invalido@teste.com')
    await page.getByPlaceholder('Senha').fill('errada123')
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await expect(page.getByText(/incorretos/i)).toBeVisible({ timeout: 12_000 })
  })

  test('rota gerente sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/gerente/produtos')
    await expect(page).toHaveURL(/\/login/)
  })
})
