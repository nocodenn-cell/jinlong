'use client'

import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
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
    if (!documentoId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [documentoId, onClose])

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

  if (!documentoId) return null

  const doc = detalhe?.doc
  const eventos = detalhe?.eventos ?? []
  const podeReprocessar = doc?.status === 'ERRO' || doc?.status === 'PENDENTE'

  function handleReprocessar() {
    if (!doc) return
    startTransition(async () => {
      const r = await reprocessarDocumentoFiscal(doc.id)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: 'Documento marcado para reprocesso.' })
      const refreshed = await obterDetalheDocumentoFiscal(doc.id)
      if (refreshed) setDetalhe(refreshed)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--color-border-secondary)] bg-jl-surface-base shadow-xl">
        <header className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-4 py-3">
          <h2 className="text-base font-semibold text-jl-fg-1">Documento fiscal</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-jl-fg-3 hover:bg-jl-surface-elev">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {erro ? (
            <p className="text-sm text-red-400">Não foi possível carregar o documento.</p>
          ) : !doc ? (
            <p className="text-sm text-jl-fg-3">Carregando…</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <GerenteStatusBadge status={doc.status} />
                <span className="text-sm text-jl-fg-2">{doc.tipo_doc}</span>
              </div>
              <dl className="space-y-2 text-sm text-jl-fg-2">
                <div>
                  <dt className="text-jl-fg-3">Venda</dt>
                  <dd className="font-mono text-xs">{doc.venda_id}</dd>
                </div>
                {doc.ultimo_erro ? (
                  <div>
                    <dt className="text-jl-fg-3">Erro</dt>
                    <dd className="text-red-400">{doc.ultimo_erro}</dd>
                  </div>
                ) : null}
                {doc.chave_fiscal ? (
                  <div>
                    <dt className="text-jl-fg-3">Chave</dt>
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
                  className="admin-v2-btn-secondary mt-4 text-sm"
                >
                  Reprocessar
                </ConfirmActionButton>
              ) : null}
              <h3 className="mb-2 mt-6 text-sm font-semibold text-jl-fg-1">Timeline</h3>
              {eventos.length === 0 ? (
                <p className="text-xs text-jl-fg-3">Nenhum evento registrado.</p>
              ) : (
                <ol className="list-decimal space-y-3 pl-4 text-xs">
                  {eventos.map((e) => (
                    <li key={e.id}>
                      <div className="font-medium text-jl-fg-1">{labelFiscalEventoTipo(e.evento_tipo)}</div>
                      <div className="text-jl-fg-3">{e.created_at}</div>
                      <ul className="mt-1 list-disc pl-4 text-jl-fg-2">
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
        </div>
      </aside>
    </div>
  )
}
