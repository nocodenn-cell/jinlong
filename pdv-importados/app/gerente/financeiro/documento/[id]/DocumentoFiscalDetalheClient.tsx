'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { PageShell, SectionCard } from '@/components/ui/admin-v2'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { StatusChip } from '@/components/ui/StatusChip'
import { EmptyState } from '@/components/ui/feedback'
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
  voltarHref?: string
  locale: string
}>

export function DocumentoFiscalDetalheClient({
  doc,
  eventos,
  voltarLabel,
  voltarHref = '/admin/financeiro?tab=fiscal',
  locale,
}: Props) {
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
    <PageShell
      title="Documento fiscal"
      subtitle="Timeline auditável (quem/o quê/quando conforme dados gravados no backend)."
      filters={
        <nav aria-label="Breadcrumb" className="text-caption text-fg-muted">
          <Link href={voltarHref} className="font-medium text-fg hover:underline">
            {voltarLabel}
          </Link>
          <span aria-hidden className="mx-1.5">
            /
          </span>
          <span className="font-mono text-fg">{doc.id.slice(0, 8)}…</span>
        </nav>
      }
    >
      <SectionCard
        title="Resumo"
        action={<StatusChip status={doc.status} />}
      >
        <dl className="grid gap-2 text-body">
          <div>
            <dt className="inline text-fg-subtle">Tipo · </dt>
            <dd className="inline text-fg">{doc.tipo_doc}</dd>
          </div>
          <div>
            <dt className="inline text-fg-subtle">Venda · </dt>
            <dd className="inline font-mono text-caption">{doc.venda_id}</dd>
          </div>
          <div>
            <dt className="inline text-fg-subtle">Tentativas · </dt>
            <dd className="inline tabular-nums">{Number(doc.tentativas ?? 0)}</dd>
          </div>
          {doc.proxima_tentativa_em ? (
            <div>
              <dt className="inline text-fg-subtle">Próxima tentativa · </dt>
              <dd className="inline">{doc.proxima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.ultima_tentativa_em ? (
            <div>
              <dt className="inline text-fg-subtle">Última tentativa · </dt>
              <dd className="inline">{doc.ultima_tentativa_em}</dd>
            </div>
          ) : null}
          {doc.chave_fiscal ? (
            <div>
              <dt className="inline text-fg-subtle">Chave · </dt>
              <dd className="inline font-mono text-caption">{doc.chave_fiscal}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-fg-subtle">Criado · </dt>
            <dd className="inline">{doc.created_at}</dd>
          </div>
          <div>
            <dt className="inline text-fg-subtle">Atualizado · </dt>
            <dd className="inline">{doc.updated_at}</dd>
          </div>
        </dl>

        {doc.ultimo_erro ? (
          <InlineAlert tone="danger" title="Erro atual" className="mt-4">
            {doc.ultimo_erro}
            {doc.fiscal_error_code ? (
              <span className="mt-1 block text-caption">Código: {doc.fiscal_error_code}</span>
            ) : null}
          </InlineAlert>
        ) : null}

        {podeReprocessar ? (
          <ConfirmActionButton
            type="button"
            disabled={loadReprocessar}
            confirmMessage={`Confirma reprocessar o documento ${doc.id.slice(0, 8)}…? O item voltará para a fila fiscal.`}
            onClick={() => void mutReprocessar(null)}
            className="mt-4"
            variant="danger"
          >
            {loadReprocessar ? 'Reprocessando...' : 'Reprocessar manualmente'}
          </ConfirmActionButton>
        ) : null}
      </SectionCard>

      <SectionCard title="Timeline">
        {eventos.length === 0 ? (
          <EmptyState
            title="Nenhum evento registrado"
            description="Aplique a migration 066 se a timeline estiver vazia em ambiente novo."
          />
        ) : (
          <ol className="m-0 flex list-decimal flex-col gap-4 pl-5 text-body">
            {eventos.map((e) => {
              const detalhes = linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, locale)
              return (
                <li key={e.id}>
                  <div className="font-semibold text-fg">{labelFiscalEventoTipo(e.evento_tipo)}</div>
                  <div className="mt-0.5 text-caption text-fg-muted">
                    {e.created_at}
                    {e.status_antes || e.status_depois
                      ? ` · ${e.status_antes ?? '—'} → ${e.status_depois ?? '—'}`
                      : ''}
                  </div>
                  <div className="mt-0.5 text-caption text-fg-muted">Origem: {e.origem_acao}</div>
                  {detalhes.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-caption text-fg">
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
      </SectionCard>
    </PageShell>
  )
}
