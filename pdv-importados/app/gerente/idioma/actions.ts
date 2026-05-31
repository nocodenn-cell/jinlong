'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { normalizeIdioma } from '@/idioma/normalizeIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'

export async function setIdiomaAction(formData: FormData) {
  const idiomaRaw = formData.get('idioma')
  const idioma: Idioma = normalizeIdioma(idiomaRaw)
  if (!idiomaRaw) return

  const { userId, perfil } = await getUsuarioAtual()
  if (!userId || !isPerfilPainelGerencial(perfil)) return

  const supabase = await createClient()
  await supabase
    .from('usuarios')
    .update({ idioma_preferido: idioma })
    .eq('id', userId)

  // Revalidar rotas do painel para garantir atualização imediata.
  revalidatePath('/gerente/produtos')
  revalidatePath('/gerente/dashboard')
  revalidatePath('/gerente')
  revalidatePath('/admin')
  revalidatePath('/admin/dashboard')
}
