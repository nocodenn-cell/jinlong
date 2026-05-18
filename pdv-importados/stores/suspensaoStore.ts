"use client"
import { create } from "zustand"
import { listarPreVendasAtivas, type PreVendaRow, type VendaSuspensaItem } from "@/app/caixa/actions"

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

export type SuspensaoUnificada = PreVendaRow & { fonte: "servidor" | "local" }

type SuspensaoState = {
  suspensoes: SuspensaoUnificada[]
  carregando: boolean
  carregarSuspensoes: () => Promise<void>
  adicionarSuspensaoLocal: (payload: ParkedLocal) => void
  removerSuspensao: (id: string) => void
}

function lerParkedLocal(): ParkedLocal[] {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage.getItem(PARK_STORAGE_KEY) : null // NOSONAR - stores non-sensitive cart state for offline recovery
    if (!raw) return []
    return JSON.parse(raw) as ParkedLocal[]
  } catch {
    return []
  }
}

function salvarParkedLocal(lista: ParkedLocal[]): void {
  try {
    window.localStorage.setItem(PARK_STORAGE_KEY, JSON.stringify(lista)) // NOSONAR - stores non-sensitive cart state for offline recovery
  } catch {
    // storage unavailable in this context — safe to ignore
  }
}

export const useSuspensaoStore = create<SuspensaoState>((set) => ({
  suspensoes: [],
  carregando: false,

  carregarSuspensoes: async () => {
    set({ carregando: true })
    try {
      const result = await listarPreVendasAtivas()
      const servidor: PreVendaRow[] = result.ok ? result.preVendas : []
      const locais = lerParkedLocal()
      const servidorIds = new Set(servidor.map((s) => s.id))

      const merged: SuspensaoUnificada[] = [
        ...servidor.map((s) => ({ ...s, fonte: "servidor" as const })),
        ...locais
          .filter((l) => !servidorIds.has(l.id))
          .map((l) => ({ ...l, fonte: "local" as const })),
      ]
      set({ suspensoes: merged })
    } catch {
      // network errors are expected when offline — keep existing state
    } finally {
      set({ carregando: false })
    }
  },

  adicionarSuspensaoLocal: (payload) => {
    const lista = lerParkedLocal()
    lista.unshift(payload)
    salvarParkedLocal(lista)
    // Refresh after adding
    useSuspensaoStore.getState().carregarSuspensoes().catch(() => undefined)
  },

  removerSuspensao: (id) => {
    // Remove from localStorage immediately
    const lista = lerParkedLocal().filter((p) => p.id !== id)
    salvarParkedLocal(lista)
    // Remove from local state immediately
    set((state) => ({
      suspensoes: state.suspensoes.filter((s) => s.id !== id),
    }))
  },
}))
