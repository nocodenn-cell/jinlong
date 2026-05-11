import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { createClient } from '@/lib/supabase/server'
import { EstoqueGerentePageClient } from './EstoqueGerentePageClient'

export type EstoqueCategoriaOpcao = Readonly<{ id: string; nome: string }>

export default async function EstoqueGerentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const modo = filtro === 'baixo' ? 'baixo' : 'todos'

  const supabase = await createClient()
  const [{ data: importacaoNfeEnabled }, { data: categorias }] = await Promise.all([
    supabase.rpc('is_feature_enabled', { flag_name: 'importacao_xml' }),
    supabase.from('categorias').select('id, nome').order('nome', { ascending: true }),
  ])

  const categoriasOpts: EstoqueCategoriaOpcao[] = (categorias ?? []).map((c) => ({
    id: c.id as string,
    nome: String(c.nome ?? ''),
  }))

  return (
    <EstoqueGerentePageClient
      idioma={idioma}
      filtro={modo}
      categorias={categoriasOpts}
      importacaoNfeEnabled={importacaoNfeEnabled ?? false}
    />
  )
}
