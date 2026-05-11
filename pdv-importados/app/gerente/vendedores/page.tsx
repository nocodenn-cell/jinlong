import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { VendedoresGerentePageClient } from './VendedoresGerentePageClient'
import type { VendedorGerenteRow } from './vendedoresTypes'

export default async function VendedoresPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendedores')
    .select('id, codigo, nome, cpf, celular, ativo')
    .order('nome', { ascending: true })

  const rows = (data as VendedorGerenteRow[] | null) ?? []

  return <VendedoresGerentePageClient idioma={idioma} rows={rows} />
}
