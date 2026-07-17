'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { reprocessarDocumentoFiscal } from '@/app/gerente/financeiro/actions'
import { obterDetalheDocumentoFiscal } from '@/app/admin/financeiro/actions'
import {
  labelFiscalEventoTipo,
  linhasDescricaoPayloadGenerico,
} from '@/app/gerente/financeiro/lib/fiscalEventTimeline'
import type { DocumentoFiscalDetalhe } from '@/app/admin/financeiro/actions'

type Props = {
  idioma: Idioma
  documentoId: string | null
  onClose: () => void
  locale: string
}

function isFocusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && !el.hasAttribute('disabled') && el.tabIndex !== -1
}

export function DocumentoFiscalDetailSheet({ idioma, documentoId, onClose, locale }: Props) {
  const m = getMessages(idioma)
  const ui = m.admin_ui
  const [detalhe, setDetalhe] = useState<DocumentoFiscalDetalhe | null>(null)
  const [erro, setErro] = useState(false)
  const [pending, startTransition] = useTransition()
  const panelRef = useRef<HTMLElement>(null)

  // Escape + trava de scroll + ciclo de Tab contido (mesma técnica do
  // DragonModal — este é um drawer lateral, padrão diferente do diálogo
  // centralizado, sem primitivo compartilhado ainda para esse caso).
  useEffect(() => {
    if (!documentoId) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter(isFocusable)
        if (focusables.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        const activeDentro = active instanceof HTMLElement && focusables.includes(active)
        if (e.shiftKey && (active === first || !activeDentro)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !activeDentro)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) panel.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
      previouslyFocused?.focus?.()
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
      emitGerenteToast({ kind: 'success', message: ui.financeiro_doc_toast_reprocessado })
      const refreshed = await obterDetalheDocumentoFiscal(doc.id)
      if (refreshed) setDetalhe(refreshed)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="doc-fiscal-titulo">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label={ui.financeiro_doc_fechar} onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--color-border-secondary)] bg-jl-surface-base shadow-xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border-secondary)] px-4 py-3">
          <h2 id="doc-fiscal-titulo" className="text-base font-semibold text-jl-fg-1">{ui.financeiro_doc_titulo}</h2>
          <button type="button" onClick={onClose} aria-label={ui.financeiro_doc_fechar} className="rounded-lg p-1 text-jl-fg-3 hover:bg-jl-surface-elev">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {erro ? (
            <p className="text-sm text-red-400">{ui.financeiro_doc_erro_carregar}</p>
          ) : !doc ? (
            <p className="text-sm text-jl-fg-3">{ui.financeiro_doc_carregando}</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <GerenteStatusBadge status={doc.status} />
                <span className="text-sm text-jl-fg-2">{doc.tipo_doc}</span>
              </div>
              <dl className="space-y-2 text-sm text-jl-fg-2">
                <div>
                  <dt className="text-jl-fg-3">{ui.financeiro_doc_campo_venda}</dt>
                  <dd className="font-mono text-xs">{doc.venda_id}</dd>
                </div>
                {doc.ultimo_erro ? (
                  <div>
                    <dt className="text-jl-fg-3">{ui.financeiro_doc_campo_erro}</dt>
                    <dd className="text-red-400">{doc.ultimo_erro}</dd>
                  </div>
                ) : null}
                {doc.chave_fiscal ? (
                  <div>
                    <dt className="text-jl-fg-3">{ui.financeiro_doc_campo_chave}</dt>
                    <dd className="break-all font-mono text-xs">{doc.chave_fiscal}</dd>
                  </div>
                ) : null}
              </dl>
              {podeReprocessar ? (
                <ConfirmActionButton
                  type="button"
                  disabled={pending}
                  confirmMessage={ui.financeiro_doc_confirmar_reprocessar}
                  onClick={handleReprocessar}
                  className="admin-v2-btn-secondary mt-4 text-sm"
                >
                  {ui.financeiro_doc_btn_reprocessar}
                </ConfirmActionButton>
              ) : null}
              <h3 className="mb-2 mt-6 text-sm font-semibold text-jl-fg-1">{ui.financeiro_doc_timeline_titulo}</h3>
              {eventos.length === 0 ? (
                <p className="text-xs text-jl-fg-3">{ui.financeiro_doc_timeline_vazio}</p>
              ) : (
                <ol className="list-decimal space-y-3 pl-4 text-xs">
                  {eventos.map((e) => (
                    <li key={e.id}>
                      <div className="font-medium text-jl-fg-1">{labelFiscalEventoTipo(e.evento_tipo, m)}</div>
                      <div className="text-jl-fg-3">{e.created_at}</div>
                      <ul className="mt-1 list-disc pl-4 text-jl-fg-2">
                        {linhasDescricaoPayloadGenerico(e.evento_tipo, e.payload, m, locale).map((line, i) => (
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
