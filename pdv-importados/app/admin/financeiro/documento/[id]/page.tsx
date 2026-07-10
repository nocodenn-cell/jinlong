import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import {
  DocumentoFiscalDetalheClient,
  type DocumentoFiscalDetalheDoc,
  type DocumentoFiscalDetalheEvento,
} from '@/app/gerente/financeiro/documento/[id]/DocumentoFiscalDetalheClient'

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
      .select('id, evento_tipo, status_antes, status_depois, origem_acao, payload, created_at')
      .eq('documento_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!docRaw) notFound()

  const doc: DocumentoFiscalDetalheDoc = docRaw
  const eventos: DocumentoFiscalDetalheEvento[] = (eventosRaw ?? []).map((e) => ({
    id: e.id,
    evento_tipo: e.evento_tipo,
    status_antes: e.status_antes,
    status_depois: e.status_depois,
    origem_acao: e.origem_acao,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    created_at: e.created_at,
  }))

  return (
    <DocumentoFiscalDetalheClient
      doc={doc}
      eventos={eventos}
      voltarLabel="Financeiro"
      voltarHref={ROUTES.admin.financeiro}
      locale={localeFromIdioma(session.idioma)}
    />
  )
}
