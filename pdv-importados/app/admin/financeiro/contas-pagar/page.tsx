import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarFornecedoresPaginadosAction } from '@/app/gerente/fornecedores/actions'
import { buscarContasPagarAction } from '@/app/gerente/financeiro/contas-pagar/actions'
import { ContasPagarListClient } from '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'

type SearchParams = {
  status?: string
  periodo?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminContasPagarPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.financeiroContasPagar,
    resource: `route:${ROUTES.admin.financeiroContasPagar}`,
  })

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const statusInicial = sp.status ?? 'todos'
  const periodoInicial = sp.periodo ?? ''

  const [listaRes, fornRes] = await Promise.all([
    buscarContasPagarAction(1, { status: statusInicial, periodo: periodoInicial || undefined }),
    buscarFornecedoresPaginadosAction(1, { status: 'ativos' }),
  ])

  const contasIniciais = listaRes.ok ? listaRes.contas : []
  const hasMoreInicial = listaRes.ok ? listaRes.hasMore : false
  const fornecedoresOpts = fornRes.ok
    ? fornRes.fornecedores.map((f) => ({ id: f.id, nome: f.nome }))
    : []

  return (
    <ContasPagarListClient
      idioma={session.idioma}
      locale={localeFromIdioma(session.idioma)}
      contasIniciais={contasIniciais}
      hasMoreInicial={hasMoreInicial}
      fornecedoresOpts={fornecedoresOpts}
      statusInicial={statusInicial}
      periodoInicial={periodoInicial}
    />
  )
}
