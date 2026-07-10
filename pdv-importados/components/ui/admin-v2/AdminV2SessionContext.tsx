'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Idioma } from '@/idioma/normalizeIdioma'

type AdminV2SessionCtx = Readonly<{ idioma: Idioma }>

const Ctx = createContext<AdminV2SessionCtx | null>(null)

export function AdminV2SessionProvider({
  idioma,
  children,
}: Readonly<{ idioma: Idioma; children: ReactNode }>) {
  return <Ctx.Provider value={{ idioma }}>{children}</Ctx.Provider>
}

export function useAdminV2Session(): AdminV2SessionCtx {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useAdminV2Session must be used within AdminV2SessionProvider')
  }
  return ctx
}
