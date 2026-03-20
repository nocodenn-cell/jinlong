'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizeIdioma } from '@/src/lib/idioma/normalizeIdioma'
import type { Idioma } from '@/src/lib/idioma/normalizeIdioma'

export async function setIdiomaAction(formData: FormData) {
  const idiomaRaw = formData.get('idioma')
  const idioma: Idioma = normalizeIdioma(idiomaRaw)
  if (!idiomaRaw) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (!usuario || !['GERENTE', 'DONO'].includes(usuario.perfil)) return

  await supabase
    .from('usuarios')
    .update({ idioma_preferido: idioma })
    .eq('id', user.id)

  // Revalidar rotas do painel para garantir atualização imediata.
  revalidatePath('/gerente/produtos')
  revalidatePath('/gerente/dashboard')
  revalidatePath('/gerente')
}

