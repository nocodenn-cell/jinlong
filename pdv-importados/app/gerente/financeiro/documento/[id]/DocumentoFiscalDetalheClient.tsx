'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/gerente/financeiro" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {voltarLabel}
      </Link>
      <h1 className="gerente-fin-page-title mt-4 text-2xl font-semibold tracking-tight">Documento fiscal</h1>
      <p className="gerente-fin-muted mb-6 text-sm leading-relaxed">
        Timeline auditável (quem/o quê/quando conforme dados gravados no backend).
      </p>

      <section className="dragon-glass-card mb-6 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <GerenteStatusBadge status={doc.status} />
          <span className="gerente-fin-cell text-sm">
            <strong>Tipo:</strong> {doc.tipo_doc}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm">
          <div>
            <dt className="gerente-fin-muted inline">Venda </dt>
            <dd className="inline font-mono text-xs">{doc.venda_id}</dd>
          </div>
          <div>
            <dt className="gerente-fin-muted inline">Tentativas </dt>
            <dd className="gerente-fin-cell inline">{Number(doc.tentativas ?? 0)}</dd>
          </div>
          {doc.proxima_tentativa_em ? (
            <div>
              <dt className="gerente-fin-muted inline">Próxima tentativa </dt>
              <dd className="gerente-fin-cell inline">{doc.proxima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.ultima_tentativa_em ? (
            <div>
              <dt className="gerente-fin-muted inline">Última tentativa </dt>
              <dd className="gerente-fin-cell inline">{doc.ultima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.ultimo_erro ? (
            <div>
              <dt className="inline app-badge-danger rounded px-1 py-0.5">Erro atual </dt>
              <dd className="inline app-badge-danger rounded px-1 py-0.5">{doc.ultimo_erro}</dd>
            </div>
          ) : null}
          {doc.fiscal_error_code ? (
            <div>
              <dt className="gerente-fin-muted inline">Código fiscal </dt>
              <dd className="gerente-fin-cell inline">{doc.fiscal_error_code}</dd>
            </div>
          ) : null}
          {doc.chave_fiscal ? (
            <div>
              <dt className="gerente-fin-muted inline">Chave </dt>
              <dd className="inline font-mono text-xs">{doc.chave_fiscal}</dd>
            </div>
          ) : null}
          <div>
            <dt className="gerente-fin-muted inline">Criado em </dt>
            <dd className="gerente-fin-cell inline">{doc.created_at}</dd>
          </div>
          <div>
            <dt className="gerente-fin-muted inline">Atualizado em </dt>
            <dd className="gerente-fin-cell inline">{doc.updated_at}</dd>
          </div>
        </dl>
        {podeReprocessar ? (
          <ConfirmActionButton
            type="button"
            disabled={loadReprocessar}
            confirmMessage={`Confirma reprocessar o documento ${doc.id.slice(0, 8)}…? O item voltará para a fila fiscal.`}
            onClick={() => void mutReprocessar(null)}
            className="mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold shadow-md transition-[filter] disabled:cursor-not-allowed disabled:opacity-70 app-btn-danger"
          >
            {loadReprocessar ? 'Reprocessando...' : 'Reprocessar manualmente'}
          </ConfirmActionButton>
        ) : null}
      </section>

      <section className="dragon-glass-card rounded-xl p-5">
        <h2 className="gerente-section-accent mb-4 text-base font-semibold">Timeline</h2>
        {eventos.length === 0 ? (
          <p className="gerente-fin-muted text-sm">Nenhum evento registrado para este documento ainda.</p>
        ) : (
          <ol className="m-0 flex list-decimal flex-col gap-4 pl-5 text-sm">
            {eventos.map((e) => {
              const detalhes = linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, locale)
              return (
                <li key={e.id}>
                  <div className="gerente-fin-cell font-semibold">{labelFiscalEventoTipo(e.evento_tipo)}</div>
                  <div className="gerente-fin-muted mt-0.5 text-xs">
                    {e.created_at}
                    {e.status_antes || e.status_depois
                      ? ` · ${e.status_antes ?? '—'} → ${e.status_depois ?? '—'}`
                      : ''}
                  </div>
                  <div className="gerente-fin-muted mt-0.5 text-xs">Origem: {e.origem_acao}</div>
                  {detalhes.length > 0 ? (
                    <ul className="gerente-fin-cell mt-2 list-disc space-y-1 pl-4 text-xs">
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
