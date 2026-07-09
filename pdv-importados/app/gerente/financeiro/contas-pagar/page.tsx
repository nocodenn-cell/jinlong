import { buscarFornecedoresPaginadosAction } from '@/app/gerente/fornecedores/actions'
import { buscarContasPagarAction } from '@/app/gerente/financeiro/contas-pagar/actions'
import { ContasPagarListClient } from '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { redirect } from 'next/navigation'

type SearchParams = {
  status?: string
  periodo?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function ContasPagarPage({ searchParams }: PageProps) {
  const auth = await assertGerenteSession()
  if (!auth.ok) redirect(ROUTES.auth.login)

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

  const { idioma } = auth.session

  return (
    <ContasPagarListClient
      idioma={idioma}
      locale={localeFromIdioma(idioma)}
      contasIniciais={contasIniciais}
      hasMoreInicial={hasMoreInicial}
      fornecedoresOpts={fornecedoresOpts}
      statusInicial={statusInicial}
      periodoInicial={periodoInicial}
    />
  )
}
