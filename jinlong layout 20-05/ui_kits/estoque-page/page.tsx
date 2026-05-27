import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { createClient } from '@/lib/supabase/server'
import { EstoqueListClient } from './EstoqueListClient'

export type EstoqueCategoriaOpcao = Readonly<{ id: string; nome: string }>

/**
 * Server component — substitui o `EstoqueGerentePageClient` (paginação tradicional)
 * por uma versão com scroll infinito + filtros enxutos, mantendo o `actions.ts`
 * intacto.
 *
 * Roteia para `EstoqueListClient` em vez do `EstoqueGerentePageClient`.
 * As subrotas `/imprimir-etiquetas` e `/importar-nfe` continuam funcionando
 * (este arquivo só toca o index).
 */
export default async function EstoqueGerentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const soBaixoInicial = filtro === 'baixo'

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
    <EstoqueListClient
      idioma={idioma}
      soBaixoInicial={soBaixoInicial}
      categorias={categoriasOpts}
      importacaoNfeEnabled={importacaoNfeEnabled ?? false}
    />
  )
}
