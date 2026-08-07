'use client'

import { useEffect, useState, useTransition } from 'react'
import { StatusChip } from '@/components/ui/StatusChip'
import { DetailSheet } from '@/components/ui/DetailSheet'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitToast } from '@/lib/gerente/toast'
import { reprocessarDocumentoFiscal } from '@/app/gerente/financeiro/actions'
import { obterDetalheDocumentoFiscal } from '@/app/admin/financeiro/actions'
import {
  labelFiscalEventoTipo,
  linhasDescricaoPayloadGenerico,
} from '@/app/gerente/financeiro/lib/fiscalEventTimeline'
import type { DocumentoFiscalDetalhe } from '@/app/admin/financeiro/actions'

type Props = {
  documentoId: string | null
  onClose: () => void
  locale: string
}

export function DocumentoFiscalDetailSheet({ documentoId, onClose, locale }: Props) {
  const [detalhe, setDetalhe] = useState<DocumentoFiscalDetalhe | null>(null)
  const [erro, setErro] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!documentoId) {
      setDetalhe(null)
      return
    }
    let vivo = true
    setErro(false)
    obterDetalheDocumentoFiscal(documentoId)
      .then((d) => {
        if (!vivo) return
        if (d) setDetalhe(d)
        else setErro(true)
      })
      .catch(() => {
        if (vivo) setErro(true)
      })
    return () => {
      vivo = false
    }
  }, [documentoId])

  const doc = detalhe?.doc
  const eventos = detalhe?.eventos ?? []
  const podeReprocessar = doc?.status === 'ERRO' || doc?.status === 'PENDENTE'

  function handleReprocessar() {
    if (!doc) return
    startTransition(async () => {
      const r = await reprocessarDocumentoFiscal(doc.id)
      if (!r.success) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      emitToast({ kind: 'success', message: 'Documento marcado para reprocesso.' })
      const refreshed = await obterDetalheDocumentoFiscal(doc.id)
      if (refreshed) setDetalhe(refreshed)
    })
  }

  return (
    <DetailSheet
      open={documentoId != null}
      onClose={onClose}
      title="Documento fiscal"
      subtitle={documentoId ?? undefined}
    >
      {erro ? (
        <p className="text-sm text-red-400">Não foi possível carregar o documento.</p>
      ) : !doc ? (
        <p className="text-sm text-fg-subtle">Carregando…</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusChip status={doc.status} />
            <span className="text-sm text-fg-muted">{doc.tipo_doc}</span>
          </div>
          <dl className="space-y-2 text-sm text-fg-muted">
            <div>
              <dt className="text-fg-subtle">Venda</dt>
              <dd className="font-mono text-xs">{doc.venda_id}</dd>
            </div>
            {doc.ultimo_erro ? (
              <div>
                <dt className="text-fg-subtle">Erro</dt>
                <dd className="text-red-400">{doc.ultimo_erro}</dd>
              </div>
            ) : null}
            {doc.chave_fiscal ? (
              <div>
                <dt className="text-fg-subtle">Chave</dt>
                <dd className="break-all font-mono text-xs">{doc.chave_fiscal}</dd>
              </div>
            ) : null}
          </dl>
          {podeReprocessar ? (
            <ConfirmActionButton
              type="button"
              disabled={pending}
              confirmMessage="Confirma reprocessar este documento?"
              onClick={handleReprocessar}
              className="mt-4"
            >
              Reprocessar
            </ConfirmActionButton>
          ) : null}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-fg">Timeline</h3>
          {eventos.length === 0 ? (
            <p className="text-xs text-fg-subtle">Nenhum evento registrado.</p>
          ) : (
            <ol className="list-decimal space-y-3 pl-4 text-xs">
              {eventos.map((e) => (
                <li key={e.id}>
                  <div className="font-medium text-fg">{labelFiscalEventoTipo(e.evento_tipo)}</div>
                  <div className="text-fg-subtle">{e.created_at}</div>
                  <ul className="mt-1 list-disc pl-4 text-fg-muted">
                    {linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, locale).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </DetailSheet>
  )
}
