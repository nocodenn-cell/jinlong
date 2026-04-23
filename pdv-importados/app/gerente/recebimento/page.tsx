import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { RecebimentoGerentePageClient } from './RecebimentoGerentePageClient'

export default async function RecebimentoPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(200)

  return <RecebimentoGerentePageClient idioma={idioma} produtos={produtos ?? []} />
}
