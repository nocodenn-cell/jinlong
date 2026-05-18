"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { PreVendaRow, VendaSuspensaItem } from "@/app/caixa/actions"
import { listarPreVendasAtivas, resgatarPreVenda } from "@/app/caixa/actions"

const PARK_STORAGE_KEY = "jinlong_parked_sales"

type ParkedLocal = {
  id: string
  identificacao: string
  itens: VendaSuspensaItem[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  criadoEm: string
}

function lerParkedLocal(): ParkedLocal[] {
  try {
    const raw = typeof window !== "undefined"
      ? window.localStorage.getItem(PARK_STORAGE_KEY) // NOSONAR - stores non-sensitive cart state for offline recovery
      : null
    if (!raw) return []
    return JSON.parse(raw) as ParkedLocal[]
  } catch (_e) {
    return []
  }
}

function removerParkedLocal(id: string): void {
  try {
    const lista = lerParkedLocal().filter((p) => p.id !== id)
    window.localStorage.setItem(PARK_STORAGE_KEY, JSON.stringify(lista)) // NOSONAR - stores non-sensitive cart state for offline recovery
  } catch (_e) {
    // storage unavailable in this context — safe to ignore
  }
}

type Props = Readonly<{
  m: Mensagens
  open: boolean
  onClose: () => void
  onResgatar: (itens: VendaSuspensaItem[], suspensaoId: string) => void
}>

export function FilaEstacionariaDrawer({ m, open, onClose, onResgatar }: Props) {
  const [preVendas, setPreVendas] = useState<PreVendaRow[]>([])
  const [locais, setLocais] = useState<ParkedLocal[]>([])
  const [carregando, setCarregando] = useState(false)
  const [resgatando, setResgatando] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carregarLista = useCallback(async () => {
    setCarregando(true)
    try {
      const [result, locals] = await Promise.all([
        listarPreVendasAtivas(),
        Promise.resolve(lerParkedLocal()),
      ])
      if (result.ok) setPreVendas(result.preVendas)
      setLocais(locals)
    } catch (_e) {
      // network errors are expected when offline — safe to ignore
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    carregarLista().catch(() => undefined)
    intervalRef.current = setInterval(() => {
      carregarLista().catch(() => undefined)
    }, 15_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [open, carregarLista])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (open) window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const handleResgatarServidor = useCallback(async (id: string) => {
    setResgatando(id)
    try {
      const result = await resgatarPreVenda(id)
      if (result.ok) {
        onResgatar(result.itens, id)
        onClose()
      }
    } catch (_e) {
      // network error during rescue — user can retry
    } finally {
      setResgatando(null)
    }
  }, [onResgatar, onClose])

  const handleResgatarLocal = useCallback((item: ParkedLocal) => {
    removerParkedLocal(item.id)
    onResgatar(item.itens, item.id)
    onClose()
  }, [onResgatar, onClose])

  function fmtHora(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    } catch (_e) {
      return iso
    }
  }

  const todasVendas = [
    ...preVendas.map((v) => ({ ...v, fonte: "servidor" as const })),
    ...locais
      .filter((l) => !preVendas.some((s) => s.id === l.id))
      .map((l) => ({ ...l, fonte: "local" as const })),
  ]

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={m.caixa.fila_estacionaria}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{m.caixa.fila_estacionaria}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar fila estacionária"
            className="app-btn-neutral rounded-md px-3 py-1.5 text-xs font-semibold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {carregando && todasVendas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{m.comum.carregando ?? "Carregando…"}</p>
          ) : todasVendas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{m.caixa.venda_suspensa_resgate}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {todasVendas.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {v.identificacao || "(sem identificação)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtHora(v.criadoEm)} · {v.totalItens} {v.totalItens === 1 ? "item" : "itens"}
                        {v.fonte === "local" && (
                          <span className="ml-1 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] text-amber-600">offline</span>
                        )}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                      R$ {v.totalLiquido.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={resgatando !== null}
                    onClick={() => v.fonte === "local"
                      ? handleResgatarLocal(v as ParkedLocal)
                      : handleResgatarServidor(v.id).catch(() => undefined)
                    }
                    className="w-full rounded-md border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resgatando === v.id ? "Resgatando…" : m.caixa.venda_suspensa_resgate}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
