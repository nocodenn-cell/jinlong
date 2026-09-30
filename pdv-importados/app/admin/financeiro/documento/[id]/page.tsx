import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import {
  DocumentoFiscalDetalheClient,
  type DocumentoFiscalDetalheDoc,
  type DocumentoFiscalDetalheEvento,
} from '@/app/gerente/financeiro/documento/[id]/DocumentoFiscalDetalheClient'
import { FinanceiroHubNavShell, PageHeader } from '@/components/ui/admin-v2'

type PageProps = { params: Promise<{ id: string }> }

const DOC_COLS =
  'id, venda_id, tipo_doc, status, tentativas, proxima_tentativa_em, ultima_tentativa_em, ultimo_erro, fiscal_error_code, fiscal_error_category, chave_fiscal, protocolo, created_at, updated_at'

export default async function AdminDocumentoFiscalPage({ params }: PageProps) {
  const { id } = await params
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.financeiro,
    resource: `route:${ROUTES.admin.financeiro}`,
  })

  const supabase = await createClient()
  const [{ data: docRaw }, { data: eventosRaw }] = await Promise.all([
    supabase
      .from('documentos_fiscais_pendentes')
      .select(DOC_COLS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('documentos_fiscais_eventos')
      .select(
        'id, evento_tipo, status_antes, status_depois, origem_acao, payload, created_at, actor_user_id, actor_role, usuarios(nome)',
      )
      .eq('documento_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!docRaw) notFound()

  const doc: DocumentoFiscalDetalheDoc = docRaw
  const eventos: DocumentoFiscalDetalheEvento[] = (eventosRaw ?? []).map((e) => {
    const usuario = e.usuarios as { nome?: string } | { nome?: string }[] | null
    const actorNome = Array.isArray(usuario) ? usuario[0]?.nome : usuario?.nome
    return {
      id: e.id,
      evento_tipo: e.evento_tipo,
      status_antes: e.status_antes,
      status_depois: e.status_depois,
      origem_acao: e.origem_acao,
      payload: (e.payload ?? {}) as Record<string, unknown>,
      created_at: e.created_at,
      actor_user_id: e.actor_user_id ?? null,
      actor_role: e.actor_role ?? null,
      actor_nome: actorNome ?? null,
    }
  })

  return (
    <div className="admin-v2-page">
      <PageHeader title="Financeiro" subtitle="Detalhe do documento na fila fiscal" />
      <div className="admin-v2-stack">
        <FinanceiroHubNavShell activeTab="fiscal" />
        <DocumentoFiscalDetalheClient
          doc={doc}
          eventos={eventos}
          voltarLabel="Financeiro"
          voltarHref={ROUTES.admin.financeiro}
          locale={localeFromIdioma(session.idioma)}
        />
      </div>
    </div>
  )
}
