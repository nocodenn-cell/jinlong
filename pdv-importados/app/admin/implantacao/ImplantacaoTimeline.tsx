'use client'

import type { TimelineEvento } from './evidenciaImplantacao'

type Props = Readonly<{
  titulo: string
  vazio: string
  eventos: readonly TimelineEvento[]
  locale: string
  labelItem: (key: string) => string
}>

function fmt(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ImplantacaoTimeline({ titulo, vazio, eventos, locale, labelItem }: Props) {
  return (
    <section
      className="rounded-xl border border-jl-border-1 bg-jl-surface-soft p-4"
      data-testid="implantacao-timeline"
    >
      <h2 className="text-sm font-semibold text-jl-fg-1">{titulo}</h2>
      {eventos.length === 0 ? (
        <p className="mt-2 text-xs text-jl-fg-3">{vazio}</p>
      ) : (
        <ol className="mt-3 space-y-2 border-l border-jl-border-1 pl-3">
          {eventos.map((e) => (
            <li key={`${e.key}-${e.concluidoEm}`} className="text-xs">
              <p className="font-medium text-jl-fg-1">{labelItem(e.key)}</p>
              <p className="text-jl-fg-3 tabular-nums">
                {fmt(e.concluidoEm, locale)}
                {e.responsavel ? ` · ${e.responsavel}` : ''}
              </p>
              {e.evidencia ? (
                <p className="mt-0.5 text-jl-fg-2 whitespace-pre-wrap">{e.evidencia}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
