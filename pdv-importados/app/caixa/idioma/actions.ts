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

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('loja_id').eq('id', user.id).maybeSingle()
  if (!usuarioRow?.loja_id) return
  await supabase
    .from('pdv_config').update({ idioma_padrao: idioma }).eq('loja_id', usuarioRow.loja_id)

  revalidatePath('/caixa')
}
