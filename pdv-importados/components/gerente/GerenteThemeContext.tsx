'use client'

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { GERENTE_UI_THEME_STORAGE_KEY, type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

const GerenteUiThemeContext = createContext<Ctx | null>(null)

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<GerenteUiTheme>('noturno')

  const setTheme = useCallback((t: GerenteUiTheme) => {
    setThemeState(t)
    try {
      localStorage.setItem(GERENTE_UI_THEME_STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  useLayoutEffect(() => {
    document.documentElement.dataset.appTheme = theme
    document.documentElement.dataset.gerenteUiTheme = theme
    document.documentElement.dataset.gerenteUiThemeLegacy = 'dragon-dark'
  }, [theme])

  return <GerenteUiThemeContext.Provider value={value}>{children}</GerenteUiThemeContext.Provider>
}

export function useGerenteUiTheme(): Ctx {
  const ctx = useContext(GerenteUiThemeContext)
  if (!ctx) {
    throw new Error('useGerenteUiTheme deve ficar dentro de GerenteUiThemeProvider')
  }
  return ctx
}
