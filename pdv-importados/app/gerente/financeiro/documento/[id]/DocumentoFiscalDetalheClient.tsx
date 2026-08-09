'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { StatusChip } from '@/components/ui/StatusChip'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/admin-v2'
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

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-small">
      <span className="text-jl-fg-3">{label} </span>
      <span className="text-jl-fg-2">{children}</span>
    </div>
  )
}

export function DocumentoFiscalDetalheClient({
  doc,
  eventos,
  voltarLabel,
  voltarHref = '/gerente/financeiro',
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
    <div className="mx-auto max-w-3xl">
      <Link
        href={voltarHref}
        className="inline-flex items-center gap-1 text-small font-medium text-jl-fg-3 transition-colors hover:text-jl-fg-1"
      >
        ← {voltarLabel}
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="text-title font-semibold tracking-tight text-jl-fg-1">Documento fiscal</h1>
        <p className="mt-1 text-small leading-relaxed text-jl-fg-3">
          Timeline auditável (quem/o quê/quando conforme dados gravados no backend).
        </p>
      </header>

      <SectionCard className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={doc.status} />
          <span className="text-small text-jl-fg-2">
            <span className="font-semibold text-jl-fg-1">Tipo:</span> {doc.tipo_doc}
          </span>
        </div>
        <dl className="mt-4 grid gap-2">
          <MetaRow label="Venda">
            <span className="font-mono text-caption">{doc.venda_id}</span>
          </MetaRow>
          <MetaRow label="Tentativas">{Number(doc.tentativas ?? 0)}</MetaRow>
          {doc.proxima_tentativa_em ? (
            <MetaRow label="Próxima tentativa">{doc.proxima_tentativa_em}</MetaRow>
          ) : null}
          {doc.ultima_tentativa_em ? (
            <MetaRow label="Última tentativa">{doc.ultima_tentativa_em}</MetaRow>
          ) : null}
          {doc.ultimo_erro ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-small text-destructive">
              <span className="font-semibold">Erro atual:</span> {doc.ultimo_erro}
            </div>
          ) : null}
          {doc.fiscal_error_code ? (
            <MetaRow label="Código fiscal">{doc.fiscal_error_code}</MetaRow>
          ) : null}
          {doc.chave_fiscal ? (
            <MetaRow label="Chave">
              <span className="font-mono text-caption">{doc.chave_fiscal}</span>
            </MetaRow>
          ) : null}
          <MetaRow label="Criado em">{doc.created_at ?? '—'}</MetaRow>
          <MetaRow label="Atualizado em">{doc.updated_at ?? '—'}</MetaRow>
        </dl>
        {podeReprocessar ? (
          <Button
            type="button"
            variant="destructive"
            disabled={loadReprocessar}
            className="mt-4"
            onClick={() => {
              const ok = globalThis.confirm(
                `Confirma reprocessar o documento ${doc.id.slice(0, 8)}…? O item voltará para a fila fiscal.`,
              )
              if (!ok) return
              void mutReprocessar(null)
            }}
          >
            {loadReprocessar ? 'Reprocessando...' : 'Reprocessar manualmente'}
          </Button>
        ) : null}
      </SectionCard>

      <SectionCard title="Timeline">
        {eventos.length === 0 ? (
          <p className="text-small text-jl-fg-3">Nenhum evento registrado (aplique a migration 066).</p>
        ) : (
          <ol className="m-0 flex list-decimal flex-col gap-4 pl-5 text-small">
            {eventos.map((e) => {
              const detalhes = linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, locale)
              return (
                <li key={e.id} className="text-jl-fg-2">
                  <div className="font-semibold text-jl-fg-1">{labelFiscalEventoTipo(e.evento_tipo)}</div>
                  <div className="mt-0.5 text-caption text-jl-fg-3">
                    {e.created_at}
                    {e.status_antes || e.status_depois
                      ? ` · ${e.status_antes ?? '—'} → ${e.status_depois ?? '—'}`
                      : ''}
                  </div>
                  <div className="mt-0.5 text-caption text-jl-fg-3">Origem: {e.origem_acao}</div>
                  {detalhes.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-caption text-jl-fg-2">
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
    </div>
  )
}
