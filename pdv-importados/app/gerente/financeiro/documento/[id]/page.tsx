import { notFound } from 'next/navigation'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { DocumentoFiscalDetalheClient } from './DocumentoFiscalDetalheClient'

type PageProps = { params: Promise<{ id: string }> }

export default async function DocumentoFiscalDetalhePage(props: PageProps) {
  const { id } = await props.params
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const supabase = await createClient()

  const { data: doc, error: docErr } = await supabase
    .from('documentos_fiscais_pendentes')
    .select(
      `
      id,
      venda_id,
      tipo_doc,
      status,
      tentativas,
      proxima_tentativa_em,
      ultima_tentativa_em,
      ultimo_erro,
      fiscal_error_code,
      fiscal_error_category,
      chave_fiscal,
      protocolo,
      created_at,
      updated_at
    `,
    )
    .eq('id', id)
    .maybeSingle()

  if (docErr || !doc) {
    notFound()
  }

  const { data: eventosRaw, error: evErr } = await supabase
    .from('documentos_fiscais_eventos')
    .select('id, evento_tipo, status_antes, status_depois, origem_acao, payload, created_at')
    .eq('documento_id', id)
    .order('created_at', { ascending: true })

  if (evErr && process.env.NODE_ENV === 'development') {
    console.warn('[documento fiscal] eventos:', evErr.message)
  }

  const eventos = (evErr ? [] : (eventosRaw ?? [])).map((e) => ({
    id: e.id as string,
    evento_tipo: String(e.evento_tipo),
    status_antes: e.status_antes as string | null,
    status_depois: e.status_depois as string | null,
    origem_acao: String(e.origem_acao),
    payload: (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>,
    created_at: formatDateTimeOrDash(e.created_at as string | null, locale, 'medium'),
  }))

  return (
    <DocumentoFiscalDetalheClient
      doc={{
        id: doc.id as string,
        venda_id: doc.venda_id as string,
        tipo_doc: String(doc.tipo_doc),
        status: String(doc.status),
        tentativas: doc.tentativas as number | null,
        proxima_tentativa_em: formatDateTimeOrDash(doc.proxima_tentativa_em as string | null, locale, 'medium'),
        ultima_tentativa_em: formatDateTimeOrDash(doc.ultima_tentativa_em as string | null, locale, 'medium'),
        ultimo_erro: doc.ultimo_erro as string | null,
        fiscal_error_code: doc.fiscal_error_code as string | null,
        fiscal_error_category: doc.fiscal_error_category as string | null,
        chave_fiscal: doc.chave_fiscal as string | null,
        protocolo: doc.protocolo as string | null,
        created_at: formatDateTimeOrDash(doc.created_at as string | null, locale, 'medium'),
        updated_at: formatDateTimeOrDash(doc.updated_at as string | null, locale, 'medium'),
      }}
      eventos={eventos}
      voltarLabel="Voltar ao financeiro"
      locale={locale}
    />
  )
}
