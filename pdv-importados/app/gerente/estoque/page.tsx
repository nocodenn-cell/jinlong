import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { createClient } from '@/lib/supabase/server'
import { EstoqueGerentePageClient } from './EstoqueGerentePageClient'

export default async function EstoqueGerentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const modo = filtro === 'baixo' ? 'baixo' : 'todos'

  const supabase = await createClient()
  const { data: importacaoNfeEnabled } = await supabase.rpc('is_feature_enabled', {
    flag_name: 'importacao_xml',
  })

  return (
    <EstoqueGerentePageClient
      idioma={idioma}
      filtro={modo}
      importacaoNfeEnabled={importacaoNfeEnabled ?? false}
    />
  )
}
