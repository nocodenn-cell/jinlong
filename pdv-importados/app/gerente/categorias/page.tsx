import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { CategoriasGerentePageClient } from './CategoriasGerentePageClient'
import type { CategoriaRow } from './categoriasTypes'

export default async function CategoriasPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data } = await supabase
    .from('categorias')
    .select('id, nome, categoria_pai_id, ativo')
    .order('nome', { ascending: true })

  const rows = (data as CategoriaRow[] | null) ?? []

  return <CategoriasGerentePageClient idioma={idioma} rows={rows} />
}

