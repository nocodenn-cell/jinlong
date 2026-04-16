"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/actions"

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
  if (idioma === "zh-HK") return "zh-HK"
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
    <section className="mx-4 sm:mx-6 mt-2 mb-2 rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-sm font-semibold text-slate-100">{m.caixa.timeline_titulo}</div>
        <div className="text-xs text-slate-400">{m.caixa.timeline_subtitulo}</div>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {carregando ? (
          <div className="px-4 py-3 text-xs text-slate-400">{m.caixa.timeline_carregando}</div>
        ) : itens.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400">{m.caixa.timeline_vazio}</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {itens.map((item) => {
              const podeCancelar = item.status === "pendente"
              const podeEstornar = item.status === "aprovado" && item.tipo !== "estorno"
              return (
                <li key={item.id} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-200 font-medium">
                      {tipoLabel(item.tipo)} · {money(item.valor)}
                    </span>
                    <span className="rounded border border-slate-600 px-2 py-0.5 text-slate-300">
                      {statusLabel(item.status)}
                    </span>
                    {item.numeroSequencial !== null && (
                      <span className="text-slate-500">
                        {m.caixa.timeline_numero}: #{item.numeroSequencial}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(item.createdAt).toLocaleString(loc)} · {m.caixa.timeline_motivo}: {item.motivo}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {m.caixa.timeline_saldo}: {money(item.saldoAntes)} → {money(item.saldoDepois)}
                  </div>
                  {(podeCancelar || podeEstornar) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {podeCancelar && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-amber-700/60 bg-amber-900/20 text-amber-200 hover:bg-amber-800/30"
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
                          className="border-rose-700/60 bg-rose-900/20 text-rose-200 hover:bg-rose-800/30"
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
