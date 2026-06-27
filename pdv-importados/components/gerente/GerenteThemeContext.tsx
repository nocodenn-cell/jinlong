'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

/**
 * Tema claro ('dragon-light') é contrato vigente (ADR-PDV-TEMA-002).
 * localStorage não é lido — estado local desativado por enquanto.
 * setTheme() é inerte mas preservado: facilita ativação futura se requisito surgir.
 * Tema escuro é roadmap condicional (requer novo requisito de negócio).
 */
const ThemeCtx = createContext<Ctx>({ theme: 'dragon-light', setTheme: () => {} })

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <ThemeCtx.Provider value={{ theme: 'dragon-light', setTheme: () => {} }}>{children}</ThemeCtx.Provider>
}

export function useGerenteUiTheme(): Ctx {
  return useContext(ThemeCtx)
}
