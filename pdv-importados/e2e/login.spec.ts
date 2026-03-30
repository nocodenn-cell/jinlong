import { test, expect } from '@playwright/test'
import {
  assertSupabasePublicEnvInCi,
  isCi,
} from './helpers/env'

/** Alinhado a `app/login/page.tsx` — sem prefixo de locale. */
const LOGIN_PATH = '/login'

test.describe('Página de login — UI', () => {
  test('exibe formulário', async ({ page }) => {
    await page.goto(LOGIN_PATH)
    await expect(page.getByRole('heading', { name: 'PDV Importados' })).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Senha')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Entrar$/ })).toBeVisible()
  })
})

test.describe('Página de login — autenticação Supabase', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
  })

  test('credenciais inválidas mostram erro', async ({ page }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    if (!url || !key) {
      if (isCi()) {
        throw new Error(
          'Variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes no CI.',
        )
      }
      test.skip(
        true,
        'Local: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para exercitar login.',
      )
      return
    }

    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill('invalido@teste.com')
    await page.getByPlaceholder('Senha').fill('errada123')
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await expect(page.getByText(/incorretos/i)).toBeVisible({ timeout: 12_000 })
  })
})

test.describe('Proteção de rota', () => {
  test('rota gerente sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/gerente/produtos')
    await expect(page).toHaveURL(/\/login/)
  })
})
