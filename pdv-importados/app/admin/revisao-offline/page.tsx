/**
 * Admin — Revisão de vendas offline (fila de eventos do PDV que não entraram direto).
 *
 * Server Component. A lista vem de listar_revisoes_offline com o JWT do usuário: o banco devolve só eventos das
 * lojas em que ele é DONO/GERENTE ativo (outra empresa nunca aparece). A decisão passa por decidirRevisaoOffline
 * → revisar_evento_offline, que repete toda a autorização. A UI só mostra/desabilita.
 */
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@/lib/navigation/routes'
import { filtroValido } from '@/lib/revisaoOffline/revisaoOffline'
import { listarRevisoesOffline } from './actions'
import { RevisaoOfflineContent } from './_components/RevisaoOfflineContent'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams?: Promise<{ aba?: string }> }

export default async function RevisaoOfflinePage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({ pathname: ROUTES.admin.revisaoOffline })
  const sp = (await searchParams) ?? {}
  const filtro = filtroValido(sp.aba === 'historico' ? 'DECIDIDOS' : 'PENDENTE')
  const t = getMessages(session.idioma).revisao_offline
  const res = await listarRevisoesOffline(filtro)
  return (
    <RevisaoOfflineContent
      t={t}
      locale={localeFromIdioma(session.idioma)}
      filtro={filtro}
      itens={res.ok ? res.itens : []}
      erroLista={res.ok ? null : res.erro}
    />
  )
}
