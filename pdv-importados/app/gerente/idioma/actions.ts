'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { normalizeIdioma } from '@/idioma/normalizeIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'

export async function setIdiomaAction(formData: FormData) {
  const idiomaRaw = formData.get('idioma')
  const idioma: Idioma = normalizeIdioma(idiomaRaw)
  if (!idiomaRaw) return

  const auth = await assertGerenteSession()
  if (!auth.ok) return

  const supabase = await createClient()
  await supabase
    .from('usuarios')
    .update({ idioma_preferido: idioma })
    .eq('id', auth.session.userId)

  // 'layout' cascateia para TODA a árvore /admin — sem isso, só as rotas
  // listadas literalmente re-renderizavam com o idioma novo.
  revalidatePath('/admin', 'layout')
}
