"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"

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

export function CaixaMovimentacoesTimeline({
  m,
  idioma,
  itens,
  carregando,
  processandoAcao,
  onCancelar,
  onEstornar,
}: Props) {
  const loc = localeFromIdioma(idioma)
  const money = (n: number) => `${m.caixa.moeda_prefixo} ${n.toLocaleString(loc, { minimumFractionDigits: 2 })}`

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
    <section className="mx-4 sm:mx-6 mt-2 mb-2 rounded-lg border overflow-hidden app-surface app-border">
      <div className="px-4 py-3 border-b app-divider">
        <div className="text-sm font-semibold">{m.caixa.timeline_titulo}</div>
        <div className="text-xs app-muted">{m.caixa.timeline_subtitulo}</div>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {carregando ? (
          <div className="px-4 py-3 text-xs app-muted">{m.caixa.timeline_carregando}</div>
        ) : itens.length === 0 ? (
          <div className="px-4 py-3 text-xs app-muted">{m.caixa.timeline_vazio}</div>
        ) : (
          <ul className="divide-y app-divider">
            {itens.map((item) => {
              const podeCancelar = item.status === "pendente"
              const podeEstornar = item.status === "aprovado" && item.tipo !== "estorno"
              return (
                <li key={item.id} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">
                      {tipoLabel(item.tipo)} · {money(item.valor)}
                    </span>
                    <span
                      className={[
                        'inline-flex items-center gap-1 rounded border px-2 py-0.5',
                        item.status === 'aprovado'
                          ? 'app-badge-danger'
                          : 'app-btn-neutral',
                      ].join(' ')}
                    >
                      {item.status === 'aprovado' ? (
                        <ImperialSealIcon
                          className="h-3.5 w-3.5 shrink-0 text-[color:var(--caixa-imperial-red,#b91c1c)]"
                          title={m.caixa.aria_selo_mov_aprovada}
                        />
                      ) : null}
                      {statusLabel(item.status)}
                    </span>
                    {item.numeroSequencial !== null && (
                      <span className="app-subtle">
                        {m.caixa.timeline_numero}: #{item.numeroSequencial}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] app-muted">
                    {new Date(item.createdAt).toLocaleString(loc)} · {m.caixa.timeline_motivo}: {item.motivo}
                  </div>
                  <div className="text-[11px] app-muted">
                    {m.caixa.timeline_saldo}: {money(item.saldoAntes)} → {money(item.saldoDepois)}
                  </div>
                  {(podeCancelar || podeEstornar) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {podeCancelar && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="app-btn-danger"
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
                          variant="outline"
                          className="app-btn-danger"
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
