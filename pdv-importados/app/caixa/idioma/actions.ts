'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizeIdioma, type Idioma } from '@/idioma/normalizeIdioma'

export async function setIdiomaAction(formData: FormData) {
  const idiomaRaw = formData.get('idioma')
  if (!idiomaRaw) return
  const idioma: Idioma = normalizeIdioma(idiomaRaw)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase
    .from('usuarios')
    .update({ idioma_preferido: idioma })
    .eq('id', user.id)

  revalidatePath('/caixa')
}
