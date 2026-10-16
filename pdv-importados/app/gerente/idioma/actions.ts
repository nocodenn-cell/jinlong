'use server'

import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { normalizeIdioma } from '@/idioma/normalizeIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'

/**
 * Persiste o idioma do painel. Sem `revalidatePath`: quem chama
 * (`LanguageToggle`) recarrega o documento inteiro depois do `ok`.
 *
 * Antes, `revalidatePath('/admin', 'layout')` devolvia a árvore /admin inteira
 * no próprio POST e invalidava o cache de prefetch do router, que então
 * re-prefetchava todos os links visíveis (sidebar + uma rota por linha do
 * catálogo). Em CPU lenta o commit do idioma novo levava de 5 a 15 s — o CI
 * via o botão nunca ficar ativo (e2e idioma/admin-idioma/gerente).
 */
export async function setIdiomaAction(formData: FormData): Promise<{ ok: boolean }> {
  const idiomaRaw = formData.get('idioma')
  const idioma: Idioma = normalizeIdioma(idiomaRaw)
  if (!idiomaRaw) return { ok: false }

  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false }

  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios')
    .update({ idioma_preferido: idioma })
    .eq('id', auth.session.userId)

  return { ok: !error }
}
