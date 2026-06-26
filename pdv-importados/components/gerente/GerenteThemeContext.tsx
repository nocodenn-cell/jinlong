'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

/**
 * Fase 0 — Layout Compiler: tema travado em claro ('dragon-light').
 * O provider deixou de ler/escrever localStorage e `setTheme` é inerte —
 * não existe mais alternância para 'dragon-dark'.
 */
const ThemeCtx = createContext<Ctx>({ theme: 'dragon-light', setTheme: () => {} })

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <ThemeCtx.Provider value={{ theme: 'dragon-light', setTheme: () => {} }}>{children}</ThemeCtx.Provider>
}

export function useGerenteUiTheme(): Ctx {
  return useContext(ThemeCtx)
}
