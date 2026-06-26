'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

const ThemeCtx = createContext<Ctx>({ theme: 'dragon-light', setTheme: () => {} })

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  // Tema escuro (dragon-dark) DESATIVADO temporariamente (comando Bling claro
  // global): a área gerente fica travada em claro. setTheme é no-op até o dark
  // ser reabilitado. Para reativar, restaure o estado/localStorage anterior.
  const theme: GerenteUiTheme = 'dragon-light'
  const setTheme: Ctx['setTheme'] = () => {}

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useGerenteUiTheme(): Ctx {
  return useContext(ThemeCtx)
}
