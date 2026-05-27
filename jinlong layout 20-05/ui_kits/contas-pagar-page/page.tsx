import { createClient } from '@/lib/supabase/server'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { buscarContasPagarAction } from './actions'
import { ContasPagarListClient } from './ContasPagarListClient'

/**
 * Server component da rota `/gerente/financeiro/contas-pagar`.
 * Busca primeira página + lista de fornecedores para o filtro.
 */
export default async function ContasPagarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const periodoInicial = typeof sp.periodo === 'string' ? sp.periodo : ''
  const statusInicial =
    typeof sp.status === 'string' && sp.status !== '' ? sp.status : 'todos'

  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const m = getMessages(idioma)

  const supabase = await createClient()
  const [{ data: fornecedores }, contasIniciais] = await Promise.all([
    supabase
      .from('fornecedores')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome'),
    buscarContasPagarAction(1, { status: statusInicial, periodo: periodoInicial }),
  ])

  const lista = contasIniciais.ok ? contasIniciais.contas : []
  const hasMore = contasIniciais.ok ? contasIniciais.hasMore : false

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.contas_pagar.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.contas_pagar.subtitulo}</p>

      <ContasPagarListClient
        idioma={idioma}
        locale={locale}
        contasIniciais={lista}
        hasMoreInicial={hasMore}
        fornecedoresOpts={(fornecedores ?? []) as Array<{ id: string; nome: string }>}
        statusInicial={statusInicial}
        periodoInicial={periodoInicial}
      />
    </div>
  )
}
