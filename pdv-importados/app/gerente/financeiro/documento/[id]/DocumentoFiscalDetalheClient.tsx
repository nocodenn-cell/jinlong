'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { reprocessarDocumentoFiscal } from '../../actions'
import {
  labelFiscalEventoTipo,
  linhasDescricaoPayloadGenerico,
} from '../../lib/fiscalEventTimeline'

export type DocumentoFiscalDetalheDoc = {
  id: string
  venda_id: string
  tipo_doc: string
  status: string
  tentativas: number | null
  proxima_tentativa_em: string | null
  ultima_tentativa_em: string | null
  ultimo_erro: string | null
  fiscal_error_code: string | null
  fiscal_error_category: string | null
  chave_fiscal: string | null
  protocolo: string | null
  created_at: string | null
  updated_at: string | null
}

export type DocumentoFiscalDetalheEvento = {
  id: string
  evento_tipo: string
  status_antes: string | null
  status_depois: string | null
  origem_acao: string
  payload: Record<string, unknown>
  created_at: string
}

type Props = Readonly<{
  doc: DocumentoFiscalDetalheDoc
  eventos: DocumentoFiscalDetalheEvento[]
  voltarLabel: string
  locale: string
}>

export function DocumentoFiscalDetalheClient({ doc, eventos, voltarLabel, locale }: Props) {
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const { mutate: mutReprocessar, loading: loadReprocessar } = useGerenteMutation(
    async () => {
      const r = await reprocessarDocumentoFiscal(doc.id)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Documento marcado para reprocesso.' },
  )

  const podeReprocessar = doc.status === 'ERRO' || doc.status === 'PENDENTE'

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Link href="/gerente/financeiro" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {voltarLabel}
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 16 }}>Documento fiscal</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Timeline auditável (quem/o quê/quando conforme dados gravados no backend).
      </p>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <GerenteStatusBadge status={doc.status} />
          <span style={{ fontSize: 14 }}>
            <strong>Tipo:</strong> {doc.tipo_doc}
          </span>
        </div>
        <dl style={{ marginTop: 12, fontSize: 14, display: 'grid', gap: 6 }}>
          <div>
            <dt style={{ color: '#6b7280', display: 'inline' }}>Venda </dt>
            <dd style={{ display: 'inline', fontFamily: 'monospace' }}>{doc.venda_id}</dd>
          </div>
          <div>
            <dt style={{ color: '#6b7280', display: 'inline' }}>Tentativas </dt>
            <dd style={{ display: 'inline' }}>{Number(doc.tentativas ?? 0)}</dd>
          </div>
          {doc.proxima_tentativa_em ? (
            <div>
              <dt style={{ color: '#6b7280', display: 'inline' }}>Próxima tentativa </dt>
              <dd style={{ display: 'inline' }}>{doc.proxima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.ultima_tentativa_em ? (
            <div>
              <dt style={{ color: '#6b7280', display: 'inline' }}>Última tentativa </dt>
              <dd style={{ display: 'inline' }}>{doc.ultima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.ultimo_erro ? (
            <div>
              <dt style={{ color: '#b91c1c', display: 'inline' }}>Erro atual </dt>
              <dd style={{ display: 'inline', color: '#b91c1c' }}>{doc.ultimo_erro}</dd>
            </div>
          ) : null}
          {doc.fiscal_error_code ? (
            <div>
              <dt style={{ color: '#6b7280', display: 'inline' }}>Código fiscal </dt>
              <dd style={{ display: 'inline' }}>{doc.fiscal_error_code}</dd>
            </div>
          ) : null}
          {doc.chave_fiscal ? (
            <div>
              <dt style={{ color: '#6b7280', display: 'inline' }}>Chave </dt>
              <dd style={{ display: 'inline', fontFamily: 'monospace', fontSize: 12 }}>{doc.chave_fiscal}</dd>
            </div>
          ) : null}
          <div>
            <dt style={{ color: '#6b7280', display: 'inline' }}>Criado em </dt>
            <dd style={{ display: 'inline' }}>{doc.created_at}</dd>
          </div>
          <div>
            <dt style={{ color: '#6b7280', display: 'inline' }}>Atualizado em </dt>
            <dd style={{ display: 'inline' }}>{doc.updated_at}</dd>
          </div>
        </dl>
        {podeReprocessar ? (
          <button
            type="button"
            disabled={loadReprocessar}
            onClick={() => void mutReprocessar(null)}
            style={{
              marginTop: 16,
              padding: '8px 14px',
              borderRadius: 8,
              background: '#111827',
              color: '#fff',
              border: 'none',
              cursor: loadReprocessar ? 'not-allowed' : 'pointer',
              opacity: loadReprocessar ? 0.7 : 1,
            }}
          >
            {loadReprocessar ? 'Reprocessando...' : 'Reprocessar manualmente'}
          </button>
        ) : null}
      </section>

      <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Timeline</h2>
        {eventos.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Nenhum evento registrado (aplique a migration 066).</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {eventos.map((e) => {
              const detalhes = linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, locale)
              return (
                <li key={e.id} style={{ fontSize: 14 }}>
                  <div style={{ fontWeight: 600 }}>{labelFiscalEventoTipo(e.evento_tipo)}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    {e.created_at}
                    {e.status_antes || e.status_depois
                      ? ` · ${e.status_antes ?? '—'} → ${e.status_depois ?? '—'}`
                      : ''}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Origem: {e.origem_acao}</div>
                  {detalhes.length > 0 ? (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: '#374151' }}>
                      {detalhes.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
