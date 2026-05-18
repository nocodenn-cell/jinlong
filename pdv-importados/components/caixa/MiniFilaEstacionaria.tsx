"use client"

import { useEffect, useCallback } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { VendaSuspensaItem } from "@/app/caixa/actions"
import { resgatarPreVenda } from "@/app/caixa/actions"
import { useSuspensaoStore } from "@/stores/suspensaoStore"

type Props = Readonly<{
  m: Mensagens
  onResgatar: (itens: VendaSuspensaItem[], id: string) => void
  lojaId: string
}>

function fmtHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch (_e) {
    return iso
  }
}

function fmtMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2)}`
}

function ShimmerCard() {
  return (
    <div className="w-36 shrink-0 rounded-lg border border-border bg-card p-2 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted mb-1" />
      <div className="h-2 w-14 rounded bg-muted mb-2" />
      <div className="h-3 w-12 rounded bg-muted mb-2" />
      <div className="h-6 w-full rounded bg-muted" />
    </div>
  )
}

export function MiniFilaEstacionaria({ m, onResgatar, lojaId }: Props) {
  const { suspensoes, carregando, carregarSuspensoes, removerSuspensao } = useSuspensaoStore()

  useEffect(() => {
    carregarSuspensoes().catch(() => undefined)
  }, [carregarSuspensoes])

  // Supabase Realtime subscription
  useEffect(() => {
    if (!lojaId) return

    let channel: { unsubscribe: () => void } | null = null

    const setup = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        channel = supabase
          .channel(`mini-fila-${lojaId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "vendas_suspensas",
              filter: `loja_id=eq.${lojaId}`,
            },
            (payload) => {
              // Only react to ATIVA status changes
              const newRecord = payload.new as Record<string, unknown> | undefined
              const oldRecord = payload.old as Record<string, unknown> | undefined
              const relevantStatus = "ATIVA"
              if (
                (newRecord && newRecord["status"] === relevantStatus) ||
                (oldRecord && oldRecord["status"] === relevantStatus) ||
                payload.eventType === "DELETE"
              ) {
                carregarSuspensoes().catch(() => undefined)
              }
            },
          )
          .subscribe()
      } catch (_e) {
        // realtime unavailable — polling fallback not needed, FilaEstacionariaDrawer handles that
      }
    }

    setup().catch(() => undefined)

    return () => {
      channel?.unsubscribe()
    }
  }, [lojaId, carregarSuspensoes])

  const handleClick = useCallback(
    async (suspensao: (typeof suspensoes)[number]) => {
      if (suspensao.fonte === "local") {
        removerSuspensao(suspensao.id)
        onResgatar(suspensao.itens, suspensao.id)
        return
      }

      try {
        const result = await resgatarPreVenda(suspensao.id)
        if (!result.ok) {
          // Already rescued by another terminal — silently remove stale card
          removerSuspensao(suspensao.id)
          return
        }
        removerSuspensao(suspensao.id)
        onResgatar(result.itens, suspensao.id)
      } catch (_e) {
        // network error — user can retry by clicking again
      }
    },
    [m, onResgatar, removerSuspensao],
  )

  const showSkeleton = carregando && suspensoes.length === 0

  if (!showSkeleton && suspensoes.length === 0) return null

  return (
    <>
      {/* Desktop: fixed bottom-right */}
      <div className="hidden sm:flex fixed bottom-4 right-4 z-30 flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            {showSkeleton ? "…" : suspensoes.length}
          </span>
          <span className="text-xs font-semibold text-foreground">
            {m.caixa.mini_fila_titulo ?? m.caixa.fila_estacionaria}
          </span>
        </div>
        <div className="flex flex-row gap-2 max-w-xs overflow-x-auto pb-1">
          {showSkeleton ? (
            <>
              <ShimmerCard />
              <ShimmerCard />
              <ShimmerCard />
            </>
          ) : (
            suspensoes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleClick(s).catch(() => undefined)}
                className="w-36 shrink-0 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-card p-2 text-left shadow-lg hover:border-amber-500/60 hover:bg-amber-500/5 transition-colors"
                title={m.caixa.venda_suspensa_resgate}
              >
                <span className="text-xs font-semibold text-foreground truncate">
                  {s.identificacao || "(sem nome)"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtHora(s.criadoEm)} · {s.totalItens} {s.totalItens === 1 ? "item" : "itens"}
                </span>
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {fmtMoeda(s.totalLiquido)}
                </span>
                {s.fonte === "local" && (
                  <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-600">
                    offline
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Mobile: fixed bottom bar */}
      <div className="flex sm:hidden fixed bottom-0 left-0 right-0 z-30 overflow-x-auto bg-card border-t border-border pb-safe px-2 py-2 gap-2">
        <div className="flex items-center gap-1 shrink-0 pr-1 border-r border-border mr-1">
          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {showSkeleton ? "…" : suspensoes.length}
          </span>
        </div>
        {showSkeleton ? (
          <>
            <ShimmerCard />
            <ShimmerCard />
          </>
        ) : (
          suspensoes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s).catch(() => undefined)}
              className="w-32 shrink-0 flex flex-col gap-0.5 rounded-lg border border-amber-500/30 bg-background p-2 text-left hover:bg-amber-500/5 transition-colors"
              title={m.caixa.venda_suspensa_resgate}
            >
              <span className="text-[11px] font-semibold text-foreground truncate">
                {s.identificacao || "(sem nome)"}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {fmtHora(s.criadoEm)} · {s.totalItens} {s.totalItens === 1 ? "item" : "itens"}
              </span>
              <span className="text-[11px] font-bold tabular-nums text-foreground">
                {fmtMoeda(s.totalLiquido)}
              </span>
              {s.fonte === "local" && (
                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-600">
                  offline
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </>
  )
}
