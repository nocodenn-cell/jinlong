'use server'

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

  // Sem revalidatePath: com app/admin/loading.tsx o refresh da action deixa
  // o RSC novo em `<div hidden id="S:*">` e o main visível vazio
  // (CI #38081109994). Quem chama recarrega a rota e relê o perfil.
}
