import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { createClient } from '@/lib/supabase/server'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { buscarRelatorioVendasAvancadoAction } from './actions'
import { RelatorioVendasClient } from './RelatorioVendasClient'

/**
 * Server component — `/gerente/relatorios/vendas`.
 * Carrega filtros base (vendedores + categorias) e a primeira consulta dos
 * últimos 7 dias. O cliente toma conta dos filtros + chart + CSV/PDF.
 */
export default async function RelatorioVendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const m = getMessages(idioma)

  const hoje = new Date()
  const seteDias = new Date(Date.now() - 6 * 86400000)
  const deDefault = (typeof sp.de === 'string' ? sp.de : '') || seteDias.toISOString().slice(0, 10)
  const ateDefault = (typeof sp.ate === 'string' ? sp.ate : '') || hoje.toISOString().slice(0, 10)

  const supabase = await createClient()
  const [{ data: vendedores }, { data: categorias }, inicial] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nome')
      .in('papel', ['gerente', 'caixa', 'dono'])
      .order('nome'),
    supabase.from('categorias').select('id, nome').eq('ativo', true).order('nome'),
    buscarRelatorioVendasAvancadoAction({ de: deDefault, ate: ateDefault }),
  ])

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.relatorios_vendas.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.relatorios_vendas.subtitulo}</p>

      <RelatorioVendasClient
        idioma={idioma}
        locale={locale}
        deInicial={deDefault}
        ateInicial={ateDefault}
        vendedores={(vendedores ?? []) as Array<{ id: string; nome: string }>}
        categorias={(categorias ?? []) as Array<{ id: string; nome: string }>}
        inicial={inicial.ok ? inicial : null}
      />
    </div>
  )
}
