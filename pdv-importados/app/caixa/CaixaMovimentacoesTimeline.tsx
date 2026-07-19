"use client"

import { memo } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState, Loading } from "@/components/ui/feedback"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  idioma: Idioma
  itens: MovimentacaoCaixaDTO[]
  carregando: boolean
  processandoAcao: boolean
  onCancelar: (item: MovimentacaoCaixaDTO) => void
  onEstornar: (item: MovimentacaoCaixaDTO) => void
}

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

function CaixaMovimentacoesTimelineImpl({
  m,
  idioma,
  itens,
  carregando,
  processandoAcao,
  onCancelar,
  onEstornar,
}: Props) {
  const loc = localeFromIdioma(idioma)
  const money = (n: number) => `${m.caixa.moeda_prefixo} ${formatDecimalBRL(n)}`

  const statusLabel = (status: MovimentacaoCaixaDTO["status"]) => {
    if (status === "aprovado") return m.caixa.timeline_status_aprovado
    if (status === "cancelado") return m.caixa.timeline_status_cancelado
    return m.caixa.timeline_status_pendente
  }

  const tipoLabel = (tipo: MovimentacaoCaixaDTO["tipo"]) => {
    if (tipo === "sangria") return m.caixa.sangria
    if (tipo === "suprimento") return m.caixa.suprimento
    return m.caixa.timeline_tipo_estorno
  }

  return (
    <section className="mx-4 sm:mx-6 mt-2 mb-2 overflow-hidden rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="text-body font-semibold">{m.caixa.timeline_titulo}</div>
        <div className="text-caption text-fg-muted">{m.caixa.timeline_subtitulo}</div>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {carregando ? (
          <Loading label={m.caixa.timeline_carregando} className="min-h-0 py-6" size="sm" />
        ) : itens.length === 0 ? (
          <EmptyState title={m.caixa.timeline_vazio} className="py-6" />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {itens.map((item) => {
              const podeCancelar = item.status === "pendente"
              const podeEstornar = item.status === "aprovado" && item.tipo !== "estorno"
              return (
                <li key={item.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-caption">
                    <span className="font-medium">
                      {tipoLabel(item.tipo)} · {money(item.valor)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5',
                        item.status === 'aprovado'
                          ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
                          : 'border-border bg-surface-soft text-fg-muted',
                      )}
                    >
                      {item.status === 'aprovado' ? (
                        <ImperialSealIcon
                          className="h-3.5 w-3.5 shrink-0 text-[var(--color-danger-strong)]"
                          title={m.caixa.aria_selo_mov_aprovada}
                        />
                      ) : null}
                      {statusLabel(item.status)}
                    </span>
                    {item.numeroSequencial !== null && (
                      <span className="text-fg-subtle">
                        {m.caixa.timeline_numero}: #{item.numeroSequencial}
                      </span>
                    )}
                  </div>
                  <div className="text-caption text-fg-muted">
                    {new Date(item.createdAt).toLocaleString(loc)} · {m.caixa.timeline_motivo}: {item.motivo}
                  </div>
                  <div className="text-caption text-fg-muted">
                    {m.caixa.timeline_saldo}: {money(item.saldoAntes)} → {money(item.saldoDepois)}
                  </div>
                  {(podeCancelar || podeEstornar) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {podeCancelar && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => onCancelar(item)}
                          disabled={processandoAcao}
                        >
                          {m.caixa.timeline_cancelar}
                        </Button>
                      )}
                      {podeEstornar && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => onEstornar(item)}
                          disabled={processandoAcao}
                        >
                          {m.caixa.timeline_estornar}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export const CaixaMovimentacoesTimeline = memo(CaixaMovimentacoesTimelineImpl)
