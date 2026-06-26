'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { GERENTE_UI_THEME_STORAGE_KEY, parseGerenteUiTheme, type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

const ThemeCtx = createContext<Ctx>({ theme: 'noturno', setTheme: () => {} })

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<GerenteUiTheme>('noturno')

  useEffect(() => {
    const stored = localStorage.getItem(GERENTE_UI_THEME_STORAGE_KEY)
    const resolved = parseGerenteUiTheme(stored)
    if (resolved !== 'noturno') setThemeState(resolved)
  }, [])

  function setTheme(t: GerenteUiTheme) {
    setThemeState(t)
    localStorage.setItem(GERENTE_UI_THEME_STORAGE_KEY, t)
  }

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useGerenteUiTheme(): Ctx {
  return useContext(ThemeCtx)
}
