import { createClient } from '@/lib/supabase/server'
import {
  fetchContasReceberListagem,
  fetchFinanceiroTitulosKpis,
  isDefaultTituloFilters,
  parseTituloFiltersFromSearchParams,
} from '@/lib/gerente/financeiroTitulosServer'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { FinanceiroGerentePageClient } from './FinanceiroGerentePageClient'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const parsed = parseTituloFiltersFromSearchParams(sp)
  const { limite, ...filters } = parsed

  const [{ data: clientes }, { titulos, capped }, kpisTitulos, { data: docsFiscais }] = await Promise.all([
    supabase.from('clientes').select('id, nome').eq('ativo', true).order('nome'),
    fetchContasReceberListagem(supabase, filters, limite),
    fetchFinanceiroTitulosKpis(supabase),
    supabase
      .from('documentos_fiscais_pendentes')
      .select('id, venda_id, tipo_doc, status, tentativas, ultimo_erro')
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const filaPendenteCount = (docsFiscais ?? []).filter(
    (d: { status: string }) => String(d.status).toUpperCase() === 'PENDENTE',
  ).length
  const errosFiscaisCount = (docsFiscais ?? []).filter(
    (d: { status: string }) => String(d.status).toUpperCase() === 'ERRO',
  ).length

  return (
    <FinanceiroGerentePageClient
      idioma={idioma}
      clientes={clientes ?? []}
      titulos={titulos}
      docsFiscais={docsFiscais ?? []}
      tituloQuery={{
        filters,
        limite,
        listCapped: capped,
        listaFiltrada: !isDefaultTituloFilters(filters),
      }}
      kpis={{
        titulosAbertosCount: kpisTitulos.titulosAbertosCount,
        valorAbertoTotal: kpisTitulos.valorAbertoTotal,
        kpiValorTruncado: kpisTitulos.kpiValorTruncado,
        filaPendenteCount,
        errosFiscaisCount,
      }}
    />
  )
}
