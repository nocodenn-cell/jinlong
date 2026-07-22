'use server'

import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { ROUTES } from '@shared-core/navigation/routes'
import type {
  DocumentoFiscalDetalheDoc,
  DocumentoFiscalDetalheEvento,
} from '@/app/gerente/financeiro/documento/[id]/DocumentoFiscalDetalheClient'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DocumentoFiscalDetalhe = Readonly<{
  doc: DocumentoFiscalDetalheDoc
  eventos: DocumentoFiscalDetalheEvento[]
}>

export async function obterDetalheDocumentoFiscal(
  documentoId: string,
): Promise<DocumentoFiscalDetalhe | null> {
  if (!UUID_RE.test(documentoId)) return null

  const auth = await assertAdminSession(undefined, {
    pathname: ROUTES.admin.financeiro,
    resource: 'sensitive:financeiro',
  })
  if (!auth.ok) return null

  const supabase = await createClient()
  const [{ data: doc, error: docErr }, { data: eventosRaw, error: evErr }] = await Promise.all([
    supabase
      .from('documentos_fiscais_pendentes')
      .select(
        'id, venda_id, tipo_doc, status, tentativas, proxima_tentativa_em, ultima_tentativa_em, ultimo_erro, fiscal_error_code, fiscal_error_category, chave_fiscal, protocolo, created_at, updated_at',
      )
      .eq('id', documentoId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('documentos_fiscais_eventos')
      .select('id, evento_tipo, status_antes, status_depois, origem_acao, payload, created_at')
      .eq('documento_id', documentoId)
      .order('created_at', { ascending: true }),
  ])

  if (docErr || !doc) return null
  if (evErr) return null

  return {
    doc: {
      id: doc.id,
      venda_id: doc.venda_id,
      tipo_doc: doc.tipo_doc,
      status: doc.status,
      tentativas: doc.tentativas,
      proxima_tentativa_em: doc.proxima_tentativa_em,
      ultima_tentativa_em: doc.ultima_tentativa_em,
      ultimo_erro: doc.ultimo_erro,
      fiscal_error_code: doc.fiscal_error_code,
      fiscal_error_category: doc.fiscal_error_category,
      chave_fiscal: doc.chave_fiscal,
      protocolo: doc.protocolo,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    },
    eventos: (eventosRaw ?? []).map((e) => ({
      id: e.id,
      evento_tipo: e.evento_tipo,
      status_antes: e.status_antes,
      status_depois: e.status_depois,
      origem_acao: e.origem_acao,
      payload: (e.payload ?? {}) as Record<string, unknown>,
      created_at: e.created_at,
    })),
  }
}
