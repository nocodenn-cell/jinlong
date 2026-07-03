"use client"

import { useCallback, useEffect, useState } from "react"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"

const STORAGE_KEY = "fastproduct.caixa.layoutVariant"

function layoutVariantFromEnvDefault(): CaixaPdvLayoutVariant {
  return process.env.NEXT_PUBLIC_CAIXA_PDV_LAYOUT === "classic" ? "classic" : "default"
}

function readStoredLayoutVariant(): CaixaPdvLayoutVariant | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === "classic" || raw === "default" ? raw : null
  } catch {
    // localStorage indisponível (modo privado, política de cookies etc.) — ignora e usa o default.
    return null
  }
}

/**
 * Preferência de tema claro/escuro do Caixa, escolhida pelo operador em
 * runtime (toggle no topbar) e persistida em localStorage por dispositivo.
 *
 * `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` continua definindo o default para quem
 * nunca alternou o tema (ex.: primeira visita, ou navegador/perfil sem
 * preferência salva) — o toggle não remove essa configuração de deploy,
 * só permite ao operador sobrepor a escolha localmente.
 *
 * Segue o mesmo "STATE READY GATE" de `useHasMounted`: o valor lido do
 * localStorage só é aplicado após a montagem no cliente, para o primeiro
 * paint do cliente bater com o HTML do SSR (evita hydration mismatch).
 */
export function useCaixaLayoutPreference(): {
  layoutVariant: CaixaPdvLayoutVariant
  toggleLayoutVariant: () => void
} {
  const [layoutVariant, setLayoutVariant] = useState<CaixaPdvLayoutVariant>(
    layoutVariantFromEnvDefault(),
  )

  useEffect(() => {
    const stored = readStoredLayoutVariant()
    if (stored) setLayoutVariant(stored)
  }, [])

  const toggleLayoutVariant = useCallback(() => {
    setLayoutVariant((prev) => {
      const next: CaixaPdvLayoutVariant = prev === "classic" ? "default" : "classic"
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Sem persistência disponível — a troca ainda funciona para esta sessão.
      }
      return next
    })
  }, [])

  return { layoutVariant, toggleLayoutVariant }
}
