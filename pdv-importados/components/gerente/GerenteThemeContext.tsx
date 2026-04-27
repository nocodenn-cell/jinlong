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
import { GERENTE_UI_THEME_STORAGE_KEY, parseGerenteUiTheme, type GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

const GerenteUiThemeContext = createContext<Ctx | null>(null)

export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<GerenteUiTheme>('noturno')

  useLayoutEffect(() => {
    try {
      setThemeState(parseGerenteUiTheme(localStorage.getItem(GERENTE_UI_THEME_STORAGE_KEY)))
    } catch {
      /* ignore */
    }
  }, [])

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
    document.documentElement.dataset.gerenteUiThemeLegacy = theme === 'novem' ? 'dragon-light' : 'dragon-dark'
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
